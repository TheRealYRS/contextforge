// Genuine validation of an export plan. Every check computes its result from the actual
// generated content — nothing is assumed.
import { isSafeOutputPath, sanitizeRelativePath } from './safety.js';
import { byteLength } from './util.js';

export function markdownProblems(text) {
  const problems = [];
  if (!/^#\s/.test(text.trimStart())) problems.push('does not start with a top-level heading');
  let open = 0; let openLine = 0;
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^(`{3,})(.*)$/);
    if (!m) return;
    if (!open) { open = m[1].length; openLine = i + 1; }
    else if (m[1].length >= open && !m[2].trim()) open = 0;
  });
  if (open) problems.push(`unclosed code fence opened at line ${openLine}`);
  if (/\{\{link:[\w-]+\}\}/.test(text)) problems.push('contains an unresolved internal link');
  return problems;
}

/** Remove fenced code blocks so headings/links inside verbatim content are ignored. */
export function stripFences(text) {
  const out = []; let open = 0;
  for (const line of text.split('\n')) {
    const m = line.match(/^(`{3,})(.*)$/);
    if (m && !open) { open = m[1].length; continue; }
    if (m && open && m[1].length >= open && !m[2].trim()) { open = 0; continue; }
    if (!open) out.push(line);
  }
  return out.join('\n');
}

function linkTargets(text) {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => decodeURI(m[1])).filter((l) => !/^(https?:|mailto:|#)/.test(l) && /\.(md|json)$/i.test(l.split('#')[0]));
}
function join(fromPath, rel) {
  const parts = fromPath.split('/').slice(0, -1);
  for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
  return parts.join('/');
}

export function validateExport(project, generation, exp) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const outputs = exp.outputs;
  const paths = outputs.map((o) => o.exportPath);
  const pathSet = new Set(paths);

  // 1. safe filenames
  const unsafe = paths.filter((p) => !isSafeOutputPath(p));
  add('Output filenames are safe', !unsafe.length, unsafe.length ? `unsafe: ${unsafe.join(', ')}` : `${paths.length} filename(s) checked`);

  // 2. no duplicate output paths (case-insensitive — matters on Windows/macOS)
  const lower = paths.map((p) => p.toLowerCase());
  const dupes = lower.filter((p, i) => lower.indexOf(p) !== i);
  add('No duplicate output paths', !dupes.length, dupes.length ? `collisions: ${dupes.join(', ')}` : 'all export paths unique');

  // 3. layout correctness
  if (exp.layout === 'flat') {
    const nested = paths.filter((p) => p.includes('/'));
    add('Flat Files layout has no folders', !nested.length, nested.length ? `nested: ${nested.join(', ')}` : 'every file is at the top level');
  } else {
    const wrong = outputs.filter((o) => o.exportPath !== sanitizeRelativePath(o.logicalPath));
    add('Folder structure preserved', !wrong.length, wrong.length ? `moved: ${wrong.map((o) => o.exportPath).join(', ')}` : 'every file is at its logical path');
  }

  // 4. manifest valid + complete
  const mOut = outputs.find((o) => o.id === 'manifest');
  let manifest = null;
  try { manifest = JSON.parse(mOut.content); } catch (e) { /* reported below */ }
  add('Manifest is valid JSON', !!manifest, manifest ? `${mOut.bytes} bytes parsed` : 'PACKAGE_MANIFEST.json failed to parse');
  if (manifest) {
    const listed = new Set(manifest.export.files.map((f) => f.exportPath));
    const missing = paths.filter((p) => !listed.has(p));
    const extra = [...listed].filter((p) => !pathSet.has(p));
    add('Every generated file is in the manifest', !missing.length && !extra.length && manifest.export.fileCount === outputs.length,
      missing.length || extra.length ? `missing: ${missing.join(', ') || '-'}; unknown: ${extra.join(', ') || '-'}` : `${outputs.length} file(s) listed`);
    const badSize = manifest.export.files.filter((f) => f.bytes != null && outputs.find((o) => o.exportPath === f.exportPath)?.bytes !== f.bytes);
    const realBytes = outputs.filter((o) => byteLength(o.content) !== o.bytes);
    add('File sizes and counts are accurate', !badSize.length && !realBytes.length, badSize.length || realBytes.length ? `mismatch: ${[...badSize.map((f) => f.exportPath), ...realBytes.map((o) => o.exportPath)].join(', ')}` : `${outputs.length} file(s), sizes match content`);
    const inputsOk = manifest.inputs.length === project.files.length;
    const badRef = manifest.inputs.filter((i) => i.outputFile && !pathSet.has(i.outputFile));
    add('Manifest maps every input to its output', inputsOk && !badRef.length, !inputsOk ? `manifest lists ${manifest.inputs.length} of ${project.files.length} inputs` : badRef.length ? `dangling: ${badRef.map((i) => i.path).join(', ')}` : `${manifest.inputs.length} input path(s) recorded`);
  }

  // 5. markdown structure + links
  const mdProblems = [];
  const brokenLinks = [];
  for (const o of outputs.filter((x) => x.contentType === 'text/markdown')) {
    for (const p of markdownProblems(o.content)) mdProblems.push(`${o.exportPath}: ${p}`);
    for (const l of linkTargets(stripFences(o.content))) if (!pathSet.has(join(o.exportPath, l.split('#')[0]))) brokenLinks.push(`${o.exportPath} → ${l}`);
  }
  add('Markdown is structurally valid', !mdProblems.length, mdProblems.length ? mdProblems.slice(0, 5).join('; ') : 'headings present, code fences balanced');
  add('Every referenced output exists', !brokenLinks.length, brokenLinks.length ? brokenLinks.slice(0, 5).join('; ') : 'all internal links resolve');

  // 6. source references & no duplicated content
  const headingCount = new Map();
  for (const o of outputs.filter((x) => x.contentType === 'text/markdown' && x.id !== 'overview' && x.id !== 'map')) {
    for (const m of stripFences(o.content).matchAll(/^### `([^`]+)`$/gm)) headingCount.set(m[1], (headingCount.get(m[1]) || 0) + 1);
  }
  const repeated = [...headingCount].filter(([, n]) => n > 1).map(([p]) => p);
  add('No source content duplicated', !repeated.length, repeated.length ? `repeated: ${repeated.join(', ')}` : `${headingCount.size} source section(s), each once`);
  const placedMissing = [];
  for (const [path, pl] of generation.placement) {
    if (pl.mode === 'omitted') continue;
    const target = outputs.find((o) => o.id === pl.file);
    const safePath = path.replace(/`/g, 'ˋ');
    if (!target || !target.content.includes(`### \`${safePath}\``)) placedMissing.push(path);
  }
  add('Source references are consistent', !placedMissing.length, placedMissing.length ? `section missing for: ${placedMissing.slice(0, 5).join(', ')}` : `${generation.placement.size} included file(s) located in their output file`);

  // 7. nothing silently omitted
  const overview = outputs.find((o) => o.id === 'overview').content;
  const omitted = generation.plan.filter((p) => p.mode === 'omitted').map((p) => p.record.path);
  const unreportedOmit = omitted.filter((p) => !overview.includes(p) || !manifest?.omittedForBudget.includes(p));
  const truncated = generation.stats.truncated.map((t) => t.path);
  const unreportedTrunc = truncated.filter((p) => !overview.includes(p) || !manifest?.truncation.some((t) => t.path === p));
  add('Truncation and omissions are reported', !unreportedOmit.length && !unreportedTrunc.length,
    unreportedOmit.length || unreportedTrunc.length ? `unreported: ${[...unreportedOmit, ...unreportedTrunc].join(', ')}` : `${truncated.length} truncated, ${omitted.length} omitted — all reported`);
  const failed = project.files.filter((r) => r.status === 'failed');
  const unreportedFail = failed.filter((r) => !manifest?.extractionLimitations.some((x) => x.path === r.path));
  add('Extraction failures are reported', !unreportedFail.length, unreportedFail.length ? `unreported: ${unreportedFail.map((r) => r.path).join(', ')}` : `${failed.length} failure(s) reported`);
  const excludedNoReason = project.files.filter((r) => !r.included && !r.reason);
  add('Every exclusion has a reason', !excludedNoReason.length, excludedNoReason.length ? `no reason: ${excludedNoReason.slice(0, 5).map((r) => r.path).join(', ')}` : `${project.files.filter((r) => !r.included).length} exclusion(s) explained`);

  return { ok: checks.every((c) => c.ok), checks };
}
