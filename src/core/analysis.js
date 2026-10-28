// Scan + analyse pipeline. Read-only: input files are only ever read.
// Entries: [{ path, size, lastModified, read(): Promise<Uint8Array> }]
import { CAT, classify, extensionOf, isTestPath, ENTRY_NAMES, LOCKFILE_NAMES } from './registry.js';
import { detectEncoding, decode } from './encoding.js';
import { GitIgnore } from './gitignore.js';
import { findProcessor } from './processors/index.js';
import { buildGraph } from './dependencies.js';
import { findSecrets, isSensitiveFile } from './secrets.js';
import { sha256Hex, yieldToUI, CancelledError, globToRegExp } from './util.js';
import { normalizeInputPath } from './safety.js';

const MB = 1024 * 1024;
const NOISE = new Set([CAT.CACHE, CAT.BUILD, CAT.GENERATED]);
const SECONDARY_DIRS = new Set(['backup', 'backups', 'bak', 'old', 'archive', 'archived', 'copy', 'legacy', 'deprecated', 'tmp', 'temp', 'vendor', 'third_party']);

export const STAGES = ['Reading project files', 'Classifying content', 'Analyzing relationships', 'Selecting relevant content', 'Generating context files', 'Validating the package', 'Preparing downloads'];

/** Strip a common leading folder (webkitdirectory includes the chosen folder name). */
export function prepareEntries(rawEntries) {
  const entries = rawEntries.map((e) => ({ ...e, path: normalizeInputPath(e.path) })).filter((e) => e.path);
  const firsts = new Set(entries.map((e) => e.path.split('/')[0]));
  let root = '';
  if (firsts.size === 1 && entries.every((e) => e.path.includes('/'))) {
    root = [...firsts][0];
    for (const e of entries) e.path = e.path.slice(root.length + 1);
  }
  // duplicate input paths (possible with multi-select of files sharing names) are disambiguated, never dropped
  const seen = new Map();
  for (const e of entries) {
    const n = seen.get(e.path) || 0;
    seen.set(e.path, n + 1);
    if (n) { const dot = e.path.lastIndexOf('.'); e.path = dot > e.path.lastIndexOf('/') ? `${e.path.slice(0, dot)} (${n + 1})${e.path.slice(dot)}` : `${e.path} (${n + 1})`; }
  }
  return { entries, root };
}

function makeRecord(entry) {
  const name = entry.path.split('/').pop();
  const c = classify(entry.path);
  return {
    path: entry.path, name, ext: extensionOf(name), dir: entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '',
    size: entry.size || 0, modified: entry.lastModified ? new Date(entry.lastModified).toISOString() : '',
    language: c.language, category: c.category, family: c.family, binary: !c.text, unknown: c.unknown,
    encoding: '', lineCount: 0, sha256: '', status: 'pending', error: '',
    ruleReason: '', included: false, reason: '', override: null,
    large: false, duplicateOf: '', sensitive: isSensitiveFile(entry.path), secrets: [],
    analysis: {}, text: null, lossyDecode: false, entryPoint: false, entryEvidence: [],
  };
}

function excludedDir(path, dirs) {
  const parts = path.split('/');
  for (let i = 0; i < parts.length - 1; i++) if (dirs.has(parts[i].toLowerCase())) return parts.slice(0, i + 1).join('/');
  return null;
}

/**
 * Analyse a project. Returns a project object; never throws for individual file failures.
 * opts: { config, onProgress(stageIndex, done, total, label), signal: {cancelled} }
 */
export async function analyzeProject(rawEntries, opts) {
  const { config, onProgress = () => {}, signal = {}, projectName, preSkippedDirs = [] } = opts;
  const started = Date.now();
  const { entries, root } = prepareEntries(rawEntries);
  const records = entries.map(makeRecord);
  const byPath = new Map(records.map((r) => [r.path, r]));
  const issues = [];
  const skippedDirs = new Map();
  const excludeDirs = new Set(config.excludeDirs.map((d) => d.toLowerCase().replace(/\/$/, '')));
  const patterns = config.excludePatterns.map((g) => [g, globToRegExp(g)]);
  const check = () => { if (signal.cancelled) throw new CancelledError(); };

  // .gitignore files (root and nested) — read first, used as a signal only
  const ignores = [];
  if (config.respectGitignore) {
    for (const e of entries) {
      if (e.path.split('/').pop() !== '.gitignore' || excludedDir(e.path, excludeDirs)) continue;
      try { const { text } = decode(await e.read(), 'utf-8'); ignores.push({ base: e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/') + 1) : '', gi: GitIgnore.fromText(text) }); }
      catch { issues.push({ path: e.path, stage: 'read', message: 'could not read .gitignore' }); }
    }
  }
  const gitignored = (p) => ignores.some(({ base, gi }) => p.startsWith(base) && gi.match(p.slice(base.length)));

  // Stage 1 — read
  const total = entries.length;
  for (let i = 0; i < entries.length; i++) {
    check();
    const entry = entries[i];
    const r = records[i];
    const dir = excludedDir(r.path, excludeDirs);
    if (dir) {
      r.status = 'skipped'; r.ruleReason = `inside excluded directory '${dir}/'`;
      skippedDirs.set(dir, (skippedDirs.get(dir) || 0) + 1);
    } else {
      const pat = patterns.find(([, re]) => re.test(r.name) || re.test(r.path));
      if (pat) r.ruleReason = `matches exclusion pattern '${pat[0]}'`;
      else if (gitignored(r.path)) r.ruleReason = 'ignored by .gitignore';
      await readOne(entry, r, config, issues);
    }
    if (i % 10 === 0 || i === total - 1) { onProgress(0, i + 1, total, r.path); await yieldToUI(); }
  }

  // Stage 2 — classify & process
  const toProcess = records.filter((r) => r.status === 'read');
  for (let i = 0; i < toProcess.length; i++) {
    check();
    const r = toProcess[i];
    await processOne(r, config, issues);
    if (i % 10 === 0 || i === toProcess.length - 1) { onProgress(1, i + 1, toProcess.length, r.path); await yieldToUI(); }
  }
  for (const r of records) delete r._bytes;

  // refine test category using source evidence
  for (const r of records) {
    if (r.category === CAT.SOURCE && (r.analysis.testFrameworks || []).length && (isTestPath(r.path)[0] || /test|spec/i.test(r.name))) r.category = CAT.TEST;
  }

  // duplicates (by content hash)
  const groups = new Map();
  for (const r of records) if (r.sha256 && r.size > 0) (groups.get(r.sha256) || groups.set(r.sha256, []).get(r.sha256)).push(r);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => keeperRank(a).localeCompare(keeperRank(b)));
    for (const d of g.slice(1)) d.duplicateOf = g[0].path;
  }

  // Stage 3 — relationships
  onProgress(2, 0, 1, 'building relationship graph'); await yieldToUI();
  const relationships = buildGraph(records.filter((r) => r.status !== 'skipped'));
  markEntryPoints(records, relationships);
  onProgress(2, 1, 1, 'relationships complete');

  // baseline rule reasons that are content-dependent
  for (const r of records) {
    if (r.ruleReason) continue;
    if (NOISE.has(r.category)) r.ruleReason = `category '${r.category}' is excluded by default`;
    else if (r.sensitive && config.excludeSensitiveFiles) r.ruleReason = 'potentially sensitive file (credentials/keys)';
    else if (LOCKFILE_NAMES.has(r.name.toLowerCase()) && !config.includeLockfiles) r.ruleReason = 'lock file (large, low value)';
    else if (r.unknown && r.binary) r.ruleReason = 'unknown binary format — content cannot be represented as text';
    else if (r.large) r.ruleReason = `larger than the extraction limit — metadata only`;
  }

  return {
    name: projectName || root || 'project', root, scannedAt: new Date().toISOString(), durationMs: Date.now() - started,
    files: records, byPath, relationships, issues,
    skippedDirs: [...[...skippedDirs.entries()].map(([dir, count]) => ({ dir, count })), ...preSkippedDirs.map((d) => ({ dir: root && d.startsWith(`${root}/`) ? d.slice(root.length + 1) : d, count: null, note: 'not read (excluded before scanning)' }))],
    gitignoreFiles: ignores.length,
  };
}

function keeperRank(r) {
  const secondary = r.path.toLowerCase().split('/').slice(0, -1).some((p) => SECONDARY_DIRS.has(p)) ? 1 : 0;
  const copyish = /( copy|copy of|\.bak|[-_]old|[-_]copy)/i.test(r.name) ? 1 : 0;
  return `${secondary}${copyish}${String(r.path.split('/').length).padStart(3, '0')}${String(r.path.length).padStart(5, '0')}${r.path}`;
}

async function readOne(entry, r, config, issues) {
  const isDoc = [CAT.PDF, CAT.SPREADSHEET, CAT.OFFICE].includes(r.category);
  const limit = (isDoc ? config.maxDocumentMB : config.maxFileSizeMB) * MB;
  const hashLimit = config.hashMaxMB * MB;
  if (r.size > hashLimit) {
    r.large = true; r.status = 'metadata-only';
    r.error = `file is ${(r.size / MB).toFixed(1)} MB — above the ${config.hashMaxMB} MB read limit; not read or hashed`;
    return;
  }
  let bytes;
  try { bytes = await entry.read(); }
  catch (e) { r.status = 'failed'; r.error = `could not read file (${e?.name || 'error'}: permission denied, locked or removed)`; issues.push({ path: r.path, stage: 'read', message: r.error }); return; }
  try { r.sha256 = await sha256Hex(bytes); } catch { issues.push({ path: r.path, stage: 'hash', message: 'could not hash' }); }
  if (r.size > limit) { r.large = true; r.status = 'metadata-only'; r.error = `larger than the ${isDoc ? config.maxDocumentMB : config.maxFileSizeMB} MB extraction limit — metadata only`; return; }
  const enc = detectEncoding(bytes.subarray(0, 8192));
  if (r.binary === false || r.unknown) {
    if (enc.binary) { r.binary = true; if (r.unknown) r.language = 'Unknown (binary)'; }
    else {
      r.binary = false; r.encoding = enc.encoding;
      const { text, lossy } = decode(bytes, enc.encoding);
      r.text = text.replace(/^\uFEFF/, ''); r.lossyDecode = lossy;
      r.lineCount = r.text ? r.text.split('\n').length : 0;
      if (r.unknown) r.language = 'Unknown (text)';
      if (lossy) issues.push({ path: r.path, stage: 'encoding', message: 'contained invalid byte sequences; decoded with replacement' });
    }
  }
  r._bytes = bytes;
  r.status = 'read';
}

async function processOne(r, config, issues) {
  const p = findProcessor(r);
  try {
    const analysis = p ? (await p.process({ record: r, bytes: r._bytes, text: r.text ?? '', config })) || {} : {};
    analysis.processor = p?.name || 'none';
    r.analysis = analysis;
    if (analysis.error) { r.status = 'failed'; r.error = analysis.error; issues.push({ path: r.path, stage: 'parse', message: analysis.error }); }
    else r.status = analysis.limitation || (analysis.limitations || []).length ? 'partial' : 'ok';
  } catch (e) {
    r.status = 'failed'; r.error = `${p?.name || 'processor'} failed: ${String(e?.message || e).slice(0, 120)}`;
    issues.push({ path: r.path, stage: 'parse', message: r.error });
  }
  if (config.detectSecrets) {
    const body = r.text ?? r.analysis.extractedText;
    if (body) r.secrets = findSecrets(body).map(({ type, line }) => ({ type, line }));
  }
}

function markEntryPoints(records, edges) {
  const referenced = new Set(edges.filter((e) => e.resolved).map((e) => e.target));
  const declared = new Map();
  for (const r of records) for (const ep of r.analysis?.entryPoints || []) declared.set(`${r.dir ? `${r.dir}/` : ''}${ep.replace(/^\.\//, '')}`, r.path);
  for (const r of records) {
    if (r.status === 'skipped') continue;
    const ev = [];
    if (ENTRY_NAMES.has(r.name.toLowerCase())) ev.push(`conventional entry-point name '${r.name}'`);
    if (r.analysis?.hasMainGuard) ev.push('has a Python `__main__` guard');
    if (declared.has(r.path)) ev.push(`declared as entry point in ${declared.get(r.path)}`);
    if (['.html', '.htm'].includes(r.ext) && r.path.split('/').length <= 2 && r.category !== CAT.TEST) ev.push('top-level HTML page');
    if (ev.length && !referenced.has(r.path) && r.category !== CAT.TEST) ev.push('not imported by other project files');
    if (ev.length && r.category !== CAT.TEST) { r.entryPoint = true; r.entryEvidence = ev; }
  }
}

/** Re-read included inputs and compare hashes to verify the originals were not changed. */
export async function verifyOriginals(project, rawEntries, paths) {
  const { entries } = prepareEntries(rawEntries);
  const map = new Map(entries.map((e) => [e.path, e]));
  let checked = 0; const changed = []; const unreadable = [];
  for (const p of paths) {
    const r = project.byPath.get(p); const e = map.get(p);
    if (!r?.sha256 || !e) continue;
    try { if ((await sha256Hex(await e.read())) !== r.sha256) changed.push(p); checked++; }
    catch { unreadable.push(p); }
  }
  return { checked, changed, unreadable };
}
