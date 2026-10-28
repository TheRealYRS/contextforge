// Context generation: turns an analysed project + content plan into a small set of
// logical output files. Layout (folders vs flat) is applied later by exporter.js.
// Cross-file links are written as {{link:<id>}} tokens and resolved at export time.
import { CAT } from './registry.js';
import { TIERS, planContent, summaryCounts, STRATEGIES } from './packager.js';
import { findSecrets, redact } from './secrets.js';
import { humanSize, byteLength, fence, uniq } from './util.js';

export const APP = { name: 'ContextForge', formatVersion: '1.0' };
const DETECTED = '_(detected from source)_';
const INFERRED = '_(inferred from project structure)_';

const LANG_FENCE = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx', '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyw': 'python', '.pyi': 'python', '.sql': 'sql', '.ddl': 'sql', '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
  '.json': 'json', '.jsonl': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml', '.toml': 'toml', '.ini': 'ini', '.cfg': 'ini', '.md': 'markdown', '.java': 'java', '.kt': 'kotlin',
  '.cs': 'csharp', '.go': 'go', '.rs': 'rust', '.php': 'php', '.rb': 'ruby', '.swift': 'swift', '.dart': 'dart', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.ps1': 'powershell', '.psm1': 'powershell', '.bat': 'bat', '.vue': 'vue', '.svelte': 'svelte', '.r': 'r', '.lua': 'lua', '.scala': 'scala',
  '.csv': 'csv', '.tsv': 'tsv', '.properties': 'properties', '.tf': 'hcl', '.feature': 'gherkin', '.svg': 'xml', '.gradle': 'groovy', '.groovy': 'groovy',
};
const fenceLang = (r) => LANG_FENCE[r.ext] || (r.name.toLowerCase() === 'dockerfile' ? 'dockerfile' : r.name.toLowerCase() === 'makefile' ? 'makefile' : '');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const table = (headers, rows) => (rows.length
  ? [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
  : '_None._');
const code = (s) => `\`${String(s).replace(/`/g, 'ˋ')}\``;

/** Apply secret redaction to content destined for output. */
function safeText(r, text, config, stats) {
  if (!config.detectSecrets || !config.redactSecrets || !text) return text;
  const found = findSecrets(text);
  if (!found.length) return text;
  const out = redact(text, found);
  stats.redactions.push({ path: r.path, count: out.count, types: uniq(found.map((f) => f.type)) });
  return out.text;
}

function truncateToBytes(text, maxBytes) {
  const lines = text.split('\n');
  let used = 0; let n = 0;
  for (; n < lines.length; n++) { const b = byteLength(lines[n]) + 1; if (used + b > maxBytes) break; used += b; }
  return { text: lines.slice(0, Math.max(n, 1)).join('\n'), shownLines: Math.max(n, 1), totalLines: lines.length };
}

// ---------------------------------------------------------------- project type
export function detectProjectType(project) {
  const inc = project.files.filter((r) => r.status !== 'skipped');
  const count = (pred) => inc.filter(pred).length;
  const out = [];
  const has = (n) => inc.some((r) => r.name.toLowerCase() === n);
  const fw = uniq(inc.flatMap((r) => r.analysis?.testFrameworks || []));
  const src = count((r) => r.category === CAT.SOURCE); const tests = count((r) => r.category === CAT.TEST);
  if (has('package.json')) out.push(['JavaScript/Node.js project', 'package.json present']);
  if (count((r) => r.family === 'TypeScript') > 0) out.push(['TypeScript code', `${count((r) => r.family === 'TypeScript')} TypeScript file(s)`]);
  if (count((r) => r.family === 'Python') > 0) out.push(['Python code', `${count((r) => r.family === 'Python')} Python file(s)${has('requirements.txt') || has('pyproject.toml') ? ' and a Python dependency manifest' : ''}`]);
  if (count((r) => r.family === 'HTML') && count((r) => r.family === 'CSS')) out.push(['Web front end', 'HTML pages and stylesheets present']);
  for (const [fam, label, manifest] of [['Java', 'Java project', 'pom.xml'], ['C#', '.NET / C# project', ''], ['Go', 'Go project', 'go.mod'], ['Rust', 'Rust project', 'cargo.toml'], ['PHP', 'PHP project', 'composer.json'], ['Ruby', 'Ruby project', 'gemfile'], ['Kotlin', 'Kotlin project', ''], ['Swift', 'Swift project', ''], ['Dart', 'Dart/Flutter project', ''], ['C/C++', 'C/C++ project', '']]) {
    const n = count((r) => r.family === fam);
    if (n) out.push([label, `${n} ${fam} file(s)${manifest && has(manifest) ? ` and ${manifest}` : ''}`]);
  }
  if (tests && (tests >= src * 0.3 || fw.some((f) => ['playwright', 'cypress', 'selenium', 'testng'].includes(f)) || count((r) => ['.feature', '.robot'].includes(r.ext)))) out.push(['QA / test automation', `${tests} test file(s)${fw.length ? `; test tooling seen in source/manifests: ${fw.join(', ')}` : ''}`]);
  const sql = count((r) => r.family === 'SQL');
  if (sql) out.push(['Database / SQL', `${sql} SQL file(s)${count((r) => r.analysis?.isMigration) ? ', including migrations' : ''}`]);
  const data = count((r) => [CAT.DATA, CAT.SPREADSHEET].includes(r.category)) + count((r) => r.ext === '.ipynb');
  if (data >= 2 || count((r) => r.ext === '.ipynb')) out.push(['Data / analytics material', `${data} dataset, spreadsheet or notebook file(s)`]);
  const docs = count((r) => [CAT.DOC, CAT.PDF, CAT.OFFICE].includes(r.category));
  if (docs > src + tests && docs >= 3) out.push(['Documentation / knowledge repository', `${docs} document(s) vs ${src + tests} code file(s)`]);
  const cfg = count((r) => r.category === CAT.CONFIG);
  if (cfg > src && cfg >= 5) out.push(['Configuration-heavy project', `${cfg} configuration file(s)`]);
  if (!out.length) out.push(['Unclassified', 'no strong structural signals were found']);
  return out;
}

function description(project) {
  const parts = [];
  const readme = project.files.filter((r) => /^readme(\.|$)/i.test(r.name) && r.analysis?.firstParagraph).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (readme) parts.push(`From \`${readme.path}\`: "${readme.analysis.firstParagraph.replace(/\s+/g, ' ').slice(0, 400)}" ${DETECTED}`);
  const pkg = project.files.find((r) => r.analysis?.kind === 'npm-metadata' && r.analysis.description);
  if (pkg) parts.push(`\`${pkg.path}\` describes it as: "${pkg.analysis.description}" ${DETECTED}`);
  const py = project.files.find((r) => r.analysis?.kind === 'python' && r.analysis.docstring && r.entryPoint);
  if (py) parts.push(`Entry module \`${py.path}\` docstring: "${py.analysis.docstring}" ${DETECTED}`);
  if (!parts.length) parts.push(`No README, manifest description or module docstring was found, so the purpose of this project cannot be stated from evidence. Use the structure and contents below. ${INFERRED}`);
  return parts;
}

// ---------------------------------------------------------------- contents
function renderSourceSection(p, config, stats) {
  const r = p.record;
  const meta = [r.category, r.language || r.ext || 'unknown', r.lineCount ? `${r.lineCount} lines` : '', humanSize(r.size), r.sha256 ? `sha256 ${r.sha256.slice(0, 12)}` : ''].filter(Boolean).join(' · ');
  const out = [`### ${code(r.path)}`, '', `<sub>${meta}</sub>`, ''];
  if (r.lossyDecode) out.push('> ⚠ Original file contained bytes invalid in its detected encoding; they were decoded with replacement characters.', '');
  const isNotebook = r.analysis.kind === 'notebook';
  let body = isNotebook ? r.analysis.extractedText || '' : r.text ?? '';
  const redactBefore = stats.redactions.length;
  body = safeText(r, body, config, stats);
  const redactions = stats.redactions.length > redactBefore ? stats.redactions[stats.redactions.length - 1] : null;
  if (redactions) out.push(`> 🔒 ${redactions.count} detected secret value(s) redacted (${redactions.types.join(', ')}). The original file is unchanged.`, '');
  if (p.mode === 'truncated') {
    const t = truncateToBytes(body, p.bytesAllowed);
    out.push(`> ⚠ **TRUNCATED** — showing lines 1–${t.shownLines} of ${t.totalLines}. The generated-text budget was reached. Raise the budget or include fewer files to keep this file complete.`, '');
    body = t.text;
    stats.truncated.push({ path: r.path, shownLines: t.shownLines, totalLines: t.totalLines });
  }
  if (isNotebook) { out.push(`_Jupyter notebook: ${r.analysis.codeCells} code cell(s), ${r.analysis.markdownCells} markdown cell(s). Outputs omitted._`, '', body); }
  else { const f = fence(body); out.push(`${f}${fenceLang(r)}`, body.replace(/\n$/, ''), f); }
  const dupes = stats.dupesOf.get(r.path);
  if (dupes?.length) out.push('', `_Identical content also exists at: ${dupes.map(code).join(', ')} (not repeated)._`);
  out.push('');
  return out.join('\n');
}

function dataSection(p, config, stats, sampleRows) {
  const r = p.record; const a = r.analysis;
  const out = [`### ${code(r.path)}`, '', `<sub>${[r.category, r.language, humanSize(r.size), r.sha256 ? `sha256 ${r.sha256.slice(0, 12)}` : ''].filter(Boolean).join(' · ')}</sub>`, ''];
  if (a.kind === 'spreadsheet') {
    out.push(`Workbook with **${a.sheetCount}** sheet(s), **${a.totalFormulas}** formula cell(s).${a.hasMacros ? ' Contains a VBA macro project — macros were **not** executed or extracted.' : ''} ${DETECTED}`, '');
    if (a.definedNames?.length) out.push('**Named ranges:** ' + a.definedNames.map((d) => `${code(d.name)} → ${code(d.ref)}`).join(', '), '');
    for (const s of a.sheets) {
      out.push(`#### Sheet: ${s.name}${s.state !== 'visible' ? ` _(${s.state})_` : ''}`, '');
      if (s.error) { out.push(`_${s.error}_`, ''); continue; }
      out.push(`Dimension ${code(s.dimension || 'n/a')} · ${s.rows} row(s) · ${s.formulaCount} formula(s)`, '');
      if (s.headers.length) {
        const width = Math.max(s.headers.length, ...s.sampleRows.map((x) => x.length));
        const pad = (row) => Array.from({ length: width }, (_, i) => safeText(r, row[i] ?? '', config, stats));
        out.push(table(pad(s.headers).map((h, i) => h || `col ${i + 1}`), s.sampleRows.map(pad)), '');
        if (s.rows > s.sampleRows.length + 1) out.push(`_Showing header + ${s.sampleRows.length} sample row(s) of ${s.rows}._`, '');
      }
      if (s.sampleFormulas?.length) out.push('Sample formulas:', ...s.sampleFormulas.map((f) => `- ${code(f)}`), '');
    }
  } else if (a.kind === 'csv' && p.mode === 'summary') {
    out.push(`Delimited data · delimiter ${code(a.delimiter)} · ${a.columnCount} column(s) · ${a.rowCountApproximate ? '~' : ''}${a.rowCount} data row(s) ${DETECTED}`, '');
    out.push(table(['Column', 'Inferred type'], a.columns.map((c) => [c.name, c.type])), '');
    if (a.sampleRows.length) { out.push('Sample rows:', ''); out.push(table(a.columns.map((c) => c.name), a.sampleRows.map((row) => a.columns.map((_, i) => safeText(r, row[i] ?? '', config, stats)))), ''); }
    out.push(`_Summary only — the full dataset is not included (${p.record.size > 200 * 1024 ? 'too large' : 'Smart/Minimal strategy'}). Use Complete Context or include it manually for full rows._`, '');
  } else if (r.text != null && p.mode !== 'summary') {
    let body = safeText(r, r.text || '', config, stats);
    if (p.mode === 'truncated') { const t = truncateToBytes(body, p.bytesAllowed); body = t.text; out.push(`> ⚠ **TRUNCATED** — showing lines 1–${t.shownLines} of ${t.totalLines}.`, ''); stats.truncated.push({ path: r.path, shownLines: t.shownLines, totalLines: t.totalLines }); }
    const f = fence(body); out.push(`${f}${fenceLang(r)}`, body.replace(/\n$/, ''), f, '');
  } else if (r.text != null) {
    out.push(`JSON Lines dataset · ${a.recordCount ?? '?'} record(s).`, '');
    if (a.firstRecordShape) out.push('First record shape:', '', '```json', JSON.stringify(a.firstRecordShape, null, 2), '```', '');
  } else if (['pdf', 'docx', 'pptx'].includes(a.kind)) {
    const label = { pdf: `PDF · ${a.pageCount} page(s)${a.title ? ` · title "${a.title}"` : ''} · text extraction is best-effort`, docx: `Word document · ${a.paragraphCount} paragraph(s) · ${a.tableCount} table(s)${a.hasMacros ? ' · macros not executed' : ''}`, pptx: `PowerPoint · ${a.slideCount} slide(s)` }[a.kind];
    out.push(`${label} ${DETECTED}`, '');
    for (const l of a.limitations || []) out.push(`> ⚠ ${l}`, '');
    let body = safeText(r, a.extractedText || '', config, stats);
    if (!body) out.push('_No text could be extracted._', '');
    else {
      if (p.mode === 'truncated') { const t = truncateToBytes(body, p.bytesAllowed); body = t.text; out.push(`> ⚠ **TRUNCATED** — showing ${t.shownLines} of ${t.totalLines} extracted lines.`, ''); stats.truncated.push({ path: r.path, shownLines: t.shownLines, totalLines: t.totalLines }); }
      out.push('<details open><summary>Extracted text</summary>', '', body.replace(/^(#{1,2}) /gm, '#### ').replace(/^(\s*)(`{3,}|~{3,})/gm, '$1\$2'), '', '</details>', '');
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- main entry
export function generateContextFiles(project, config) {
  const counts = summaryCounts(project);
  const { plan, estimatedBytes, budgetBytes } = planContent(project, config);
  const stats = { redactions: [], truncated: [], dupesOf: new Map() };
  for (const r of project.files) if (r.duplicateOf) (stats.dupesOf.get(r.duplicateOf) || stats.dupesOf.set(r.duplicateOf, []).get(r.duplicateOf)).push(r.path);

  const contentItems = plan.filter((p) => p.target === 'contents' && p.mode !== 'omitted');
  const dataItems = plan.filter((p) => p.target === 'data' && p.mode !== 'omitted');
  const omitted = plan.filter((p) => p.mode === 'omitted');
  const internalEdges = project.relationships.filter((e) => e.resolved && !e.external);
  const separateMap = project.files.filter((r) => r.status !== 'skipped').length > 8 || internalEdges.length > 5;

  // ---- PROJECT_CONTENTS (may be split into parts)
  const partLimit = config.maxContentsFileMB * 1024 * 1024;
  const parts = [[]];
  let partBytes = 0;
  const sectionOf = new Map();
  let lastTier = -1;
  for (const p of contentItems) {
    let chunk = '';
    if (p.tier !== lastTier) { chunk += `## ${TIERS[p.tier]}\n\n`; lastTier = p.tier; }
    chunk += renderSourceSection(p, config, stats);
    const b = byteLength(chunk);
    if (partBytes + b > partLimit && parts[parts.length - 1].length) { parts.push([]); partBytes = 0; if (!chunk.startsWith('## ')) chunk = `## ${TIERS[p.tier]} (continued)\n\n${chunk}`; }
    parts[parts.length - 1].push(chunk);
    partBytes += b;
    sectionOf.set(p.record.path, parts.length);
  }
  const contentIds = parts.map((_, i) => (i === 0 ? 'contents' : `contents-${i + 1}`));
  const contentFiles = parts.map((chunks, i) => {
    const sources = contentItems.filter((p) => sectionOf.get(p.record.path) === i + 1).map((p) => p.record.path);
    const header = [
      `# PROJECT CONTENTS${parts.length > 1 ? ` — part ${i + 1} of ${parts.length}` : ''}`, '',
      `Original project content for **${project.name}**, grouped by role. Every section heading is the file's original relative path. Content is verbatim unless a notice says it was truncated or redacted.`, '',
      `Start with [PROJECT_OVERVIEW.md]({{link:overview}})${separateMap ? ` and [PROJECT_MAP.md]({{link:map}})` : ''}.${parts.length > 1 ? ` Other parts: ${contentIds.filter((_, j) => j !== i).map((id, k) => `[part ${k + (k >= i ? 2 : 1)}]({{link:${id}}})`).join(', ')}.` : ''}`, '',
      '**Files in this part**', '', ...sources.map((s) => `- ${code(s)}`), '', '---', '',
    ].join('\n');
    return { id: contentIds[i], logicalName: i === 0 ? 'PROJECT_CONTENTS.md' : `PROJECT_CONTENTS_part${i + 1}.md`, dir: 'context', content: header + chunks.join(''), sources, contentType: 'text/markdown' };
  });
  const contentsLink = (path) => `[${code(path)}]({{link:${contentIds[(sectionOf.get(path) || 1) - 1]}}})`;

  // ---- DATA_AND_DOCUMENTS
  let dataFile = null;
  if (dataItems.length) {
    const body = ['# DATA AND DOCUMENTS', '', `Structured information extracted from datasets, spreadsheets and documents in **${project.name}**. Datasets are summarised (schema + samples) rather than dumped; document text is extracted where the format allows.`, '', `See [PROJECT_OVERVIEW.md]({{link:overview}}) for context.`, '', '---', ''];
    for (const p of dataItems) body.push(dataSection(p, config, stats));
    dataFile = { id: 'data', logicalName: 'DATA_AND_DOCUMENTS.md', dir: 'context', content: body.join('\n'), sources: dataItems.map((p) => p.record.path), contentType: 'text/markdown' };
  }
  const dataLink = (path) => `[${code(path)}]({{link:data}})`;
  const where = (path) => (sectionOf.has(path) ? contentsLink(path) : dataItems.some((p) => p.record.path === path) ? dataLink(path) : code(path));

  // ---- MAP
  const mapBody = renderMap(project, { where, internalEdges });
  const mapFile = separateMap ? { id: 'map', logicalName: 'PROJECT_MAP.md', dir: 'maps', content: ['# PROJECT MAP', '', `Structure, entry points and relationships for **${project.name}**. Links point to the section of the generated file that holds each file's content.`, '', mapBody].join('\n'), sources: [], contentType: 'text/markdown' } : null;

  // ---- OVERVIEW
  const generated = [{ id: 'overview', name: 'PROJECT_OVERVIEW.md', what: 'this file — start here' },
    ...contentFiles.map((f) => ({ id: f.id, name: f.logicalName, what: `verbatim source/config/test/doc content (${f.sources.length} file(s))` })),
    ...(mapFile ? [{ id: 'map', name: 'PROJECT_MAP.md', what: 'directories, entry points, relationships, test→source links' }] : []),
    ...(dataFile ? [{ id: 'data', name: 'DATA_AND_DOCUMENTS.md', what: 'dataset schemas/samples and extracted document text' }] : []),
    { id: 'manifest', name: 'PACKAGE_MANIFEST.json', what: 'machine-readable audit: every input file, inclusion decision, hashes, export mapping, validation' }];
  const overview = renderOverview(project, config, { counts, generated, separateMap, mapBody, stats, omitted, estimatedBytes, budgetBytes, where });

  const files = [{ id: 'overview', logicalName: 'PROJECT_OVERVIEW.md', dir: '', content: overview, sources: [], contentType: 'text/markdown' }, ...contentFiles];
  if (mapFile) files.push(mapFile);
  if (dataFile) files.push(dataFile);
  for (const f of files) f.path = f.dir ? `${f.dir}/${f.logicalName}` : f.logicalName;

  // per-input mapping used by the manifest
  const placement = new Map();
  for (const p of plan) placement.set(p.record.path, { mode: p.mode, file: p.mode === 'omitted' ? null : p.target === 'data' ? 'data' : contentIds[(sectionOf.get(p.record.path) || 1) - 1] });
  return { files, plan, placement, stats, counts, estimatedBytes, budgetBytes, separateMap };
}

function renderOverview(project, config, ctx) {
  const { counts, generated, separateMap, mapBody, stats, omitted, where } = ctx;
  const types = detectProjectType(project);
  const live = project.files.filter((r) => r.status !== 'skipped');
  const fam = {};
  for (const r of project.files.filter((x) => x.included)) fam[r.family] = (fam[r.family] || 0) + 1;
  const deps = project.files.filter((r) => r.analysis?.kind === 'npm-metadata' || r.analysis?.kind === 'python-requirements' || r.analysis?.dependencies?.length);
  const configs = project.files.filter((r) => r.included && r.category === CAT.CONFIG);
  const tests = project.files.filter((r) => r.category === CAT.TEST && r.status !== 'skipped');
  const frameworks = uniq(tests.flatMap((r) => r.analysis?.testFrameworks || []));
  const declared = uniq(project.files.flatMap((r) => (r.analysis?.kind === 'npm-metadata' ? r.analysis.testFrameworks : [])));
  const reasons = {};
  for (const r of project.files.filter((x) => !x.included)) { const k = r.reason.replace(/'[^']*'/g, "'…'").replace(/identical content to .*/, 'duplicate content (included once)'); reasons[k] = (reasons[k] || 0) + 1; }
  const L = [];
  L.push(`# ${project.name} — PROJECT OVERVIEW`, '');
  L.push(`> Generated by **${APP.name}** on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC using the **${STRATEGIES[project.strategy].label}** strategy. All analysis is static — no project code, SQL, script or macro was executed. Statements are marked ${DETECTED} or ${INFERRED}.`, '');
  L.push('## How to use this package', '', 'Read this overview first, then open the files below as needed. Each section in the content files is headed by the original relative path, so you can cite exact files.', '');
  L.push(table(['File', 'Contains'], generated.map((g) => [g.id === 'manifest' ? code(g.name) : `[${g.name}]({{link:${g.id}}})`, g.what])), '');
  L.push('## What this project appears to be', '', ...description(project).flatMap((p) => [p, '']));
  L.push(`**Detected project type** ${INFERRED}:`, '', ...types.map(([t, ev]) => `- **${t}** — evidence: ${ev}`), '');
  L.push('## At a glance', '', table(['Measure', 'Value'], [
    ['Files discovered', counts.total], ['Skipped (dependency/build/cache folders)', counts.skipped], ['Content included in this package', counts.included],
    ['Not included (see reasons below)', counts.excluded - counts.skipped], ['Unknown formats', counts.unknown], ['Large files (metadata only)', counts.large],
    ['Processing failures', counts.failed], ['Partially processed', counts.partial], ['Duplicates (included once)', counts.duplicates],
  ]), '');
  L.push('**Included content by language/format**', '', table(['Family', 'Files'], Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])), '');
  // directories
  const dirs = {};
  for (const r of live) { const top = r.path.includes('/') ? r.path.split('/')[0] + '/' : '(root)'; (dirs[top] ||= { n: 0, cats: {} }); dirs[top].n++; dirs[top].cats[r.category] = (dirs[top].cats[r.category] || 0) + 1; }
  L.push('## Major directories', '', table(['Directory', 'Files', 'Mostly'], Object.entries(dirs).sort((a, b) => b[1].n - a[1].n).slice(0, 20).map(([d, v]) => [code(d), v.n, Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0][0]])), '');
  const entries = project.files.filter((r) => r.entryPoint);
  L.push('## Entry points', '', entries.length ? entries.slice(0, 20).map((r) => `- ${where(r.path)} — ${r.entryEvidence.join('; ')} ${INFERRED}`).join('\n') : `_No entry point could be identified with confidence. Do not assume one exists._`, '');
  L.push('## Dependencies', '');
  if (deps.length) for (const r of deps) {
    const a = r.analysis;
    const list = a.kind === 'npm-metadata' ? [...a.dependencies, ...a.devDependencies.map((d) => `${d} (dev)`)] : a.packages || a.dependencies || [];
    L.push(`- **${code(r.path)}**: ${list.length ? list.slice(0, 40).join(', ') + (list.length > 40 ? ` … +${list.length - 40} more` : '') : 'no entries parsed'} ${DETECTED}`);
    if (a.kind === 'npm-metadata' && Object.keys(a.scripts).length) L.push(`  - scripts: ${Object.entries(a.scripts).slice(0, 12).map(([k, v]) => `${code(k)} → ${code(v)}`).join(', ')}`);
  } else L.push('_No dependency manifest was found._');
  const ext = {};
  for (const e of project.relationships.filter((x) => x.external)) ext[e.specifier] = (ext[e.specifier] || 0) + 1;
  const topExt = Object.entries(ext).sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (topExt.length) L.push('', `Most-imported external modules ${DETECTED}: ${topExt.map(([k, v]) => `${code(k)} (${v})`).join(', ')}`);
  L.push('');
  L.push('## Configuration', '', configs.length ? configs.slice(0, 30).map((r) => {
    const a = r.analysis; const keys = a.topLevelKeys?.length ? a.topLevelKeys : a.sections?.length ? a.sections : a.keys || [];
    return `- ${where(r.path)}${keys.length ? ` — ${a.format === 'dotenv' ? 'keys' : 'top-level'}: ${keys.slice(0, 10).map(code).join(', ')}` : ''}`;
  }).join('\n') : '_No configuration files are included._', '');
  L.push('## Testing', '', `- Test files: **${tests.length}**${tests.length ? ` in ${uniq(tests.map((t) => t.dir || '(root)')).slice(0, 8).map(code).join(', ')}` : ''}`);
  L.push(frameworks.length ? `- Frameworks seen in test source: ${frameworks.join(', ')} ${DETECTED}` : '- No test framework could be confirmed from test source; none is assumed from filenames.');
  if (declared.length) L.push(`- Test tooling declared in package metadata: ${declared.join(', ')} ${DETECTED}`);
  L.push('');
  if (separateMap) L.push(`Full relationship detail is in [PROJECT_MAP.md]({{link:map}}).`, '');
  else L.push('## Project map', '', mapBody, '');
  // limitations & uncertainties
  L.push('## Known limitations and uncertainties', '');
  const lim = ['Static analysis only: runtime behaviour, generated code and dynamic imports are not represented.',
    'Relationship confidence: **Direct** = resolved to a real file; **Likely** = unique name match; **Unknown** = reference found but not resolved. External modules are not project files.'];
  if (counts.unknown) lim.push(`${counts.unknown} file(s) use unrecognised extensions; text ones are included as plain text, binary ones are listed in the manifest only.`);
  if (counts.large) lim.push(`${counts.large} file(s) exceeded the extraction size limit and are represented by metadata only.`);
  if (counts.failed) lim.push(`${counts.failed} file(s) could not be processed: ${project.files.filter((r) => r.status === 'failed').slice(0, 8).map((r) => `${code(r.path)} (${r.error})`).join('; ')}.`);
  const partial = project.files.filter((r) => r.status === 'partial');
  if (partial.length) lim.push(`Partial extraction for: ${partial.slice(0, 10).map((r) => `${code(r.path)} — ${(r.analysis.limitations || [r.analysis.note]).filter(Boolean).join(' ')}`).join('; ')}.`);
  if (project.files.some((r) => r.category === CAT.IMAGE && r.status !== 'skipped')) lim.push('Images are listed by path and dimensions only; image content is not interpreted.');
  if (stats.truncated.length) lim.push(`**Truncated** to fit the ${humanSize(ctx.budgetBytes)} output budget: ${stats.truncated.map((t) => `${code(t.path)} (lines 1–${t.shownLines} of ${t.totalLines})`).join(', ')}.`);
  if (omitted.length) lim.push(`**Omitted** because the output budget was exhausted (${omitted.length} file(s)): ${omitted.slice(0, 30).map((p) => code(p.record.path)).join(', ')}${omitted.length > 30 ? ' …' : ''}.`);
  if (stats.redactions.length) lim.push(`🔒 Detected secret values were **redacted** in ${uniq(stats.redactions.map((x) => x.path)).length} file(s): ${uniq(stats.redactions.map((x) => x.path)).map(code).join(', ')}. Redaction is pattern-based and not guaranteed to be complete.`);
  const sens = project.files.filter((r) => r.sensitive);
  if (sens.length) lim.push(`Potentially sensitive files ${sens.some((r) => r.included) ? 'found' : 'excluded'}: ${sens.map((r) => code(r.path)).join(', ')}.`);
  L.push(...lim.map((l) => `- ${l}`), '');
  L.push('## Not included', '', 'Nothing in the original project was modified. These files were left out of the generated content (all are listed individually in `PACKAGE_MANIFEST.json`):', '');
  L.push(table(['Reason', 'Files'], Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])), '');
  if (project.skippedDirs.length) L.push(`Skipped directories: ${project.skippedDirs.map((d) => `${code(d.dir + '/')} (${d.count ?? 'not read'})`).join(', ')}`, '');
  return L.join('\n');
}

function renderMap(project, { where, internalEdges }) {
  const L = [];
  const live = project.files.filter((r) => r.status !== 'skipped');
  // tree
  const tree = {};
  for (const r of live) { let n = tree; const parts = r.path.split('/'); parts.forEach((p, i) => { n[p] ||= i === parts.length - 1 ? { __file: r } : {}; n = n[p]; }); }
  const lines = []; let count = 0;
  const walk = (node, prefix) => {
    const keys = Object.keys(node).filter((k) => k !== '__file').sort((a, b) => (!!node[a].__file - !!node[b].__file) || a.localeCompare(b));
    keys.forEach((k, i) => {
      if (count++ > 600) return;
      const last = i === keys.length - 1; const f = node[k].__file;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${k}${f ? (f.included ? '' : '  ·excluded') : '/'}`);
      if (!f) walk(node[k], prefix + (last ? '    ' : '│   '));
    });
  };
  walk(tree, '');
  if (count > 600) lines.push('… (tree truncated at 600 entries; see PACKAGE_MANIFEST.json for every path)');
  L.push('### Directory structure', '', '```text', project.name + '/', ...lines, '```', '');
  const hubs = {};
  for (const e of internalEdges) hubs[e.target] = (hubs[e.target] || 0) + 1;
  const topHubs = Object.entries(hubs).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (topHubs.length) L.push(`### Most-referenced files ${INFERRED}`, '', table(['File', 'Referenced by'], topHubs.map(([p, n]) => [where(p), `${n} file(s)`])), '');
  L.push('### Relationships', '', internalEdges.length ? table(['From', 'Kind', 'To', 'Confidence'], internalEdges.slice(0, 400).map((e) => [where(e.source), e.kind, where(e.target), e.confidence])) : '_No internal file relationships were detected._', '');
  if (internalEdges.length > 400) L.push(`_${internalEdges.length - 400} more relationships are listed in PACKAGE_MANIFEST.json._`, '');
  const unresolved = project.relationships.filter((e) => !e.resolved && !e.external);
  if (unresolved.length) L.push('### Unresolved references', '', 'Found in source but not matched to a project file (aliases, generated files, or files outside the selection):', '', table(['From', 'Reference'], unresolved.slice(0, 80).map((e) => [code(e.source), code(e.specifier)])), '');
  const testLinks = internalEdges.filter((e) => project.byPath.get(e.source)?.category === CAT.TEST && project.byPath.get(e.target)?.category !== CAT.TEST);
  if (testLinks.length) {
    const by = {}; for (const e of testLinks) (by[e.source] ||= []).push(e.target);
    L.push('### Tests → code they reference', '', table(['Test', 'References'], Object.entries(by).map(([t, s]) => [where(t), uniq(s).map(where).join(', ')])), '');
  }
  const tables = project.files.filter((r) => r.analysis?.kind === 'sql');
  if (tables.length) L.push('### SQL objects', '', table(['File', 'Creates', 'Views/procs', 'Uses', 'Migration'], tables.map((r) => [where(r.path), r.analysis.tablesCreated.join(', '), [...r.analysis.views, ...r.analysis.procedures].join(', '), r.analysis.tablesReferenced.slice(0, 12).join(', '), r.analysis.isMigration ? 'yes' : ''])), '');
  const assets = live.filter((r) => r.category === CAT.IMAGE);
  if (assets.length) L.push('### Assets (not interpreted)', '', table(['File', 'Format', 'Dimensions'], assets.slice(0, 60).map((r) => [code(r.path), r.analysis.format || r.ext, r.analysis.width ? `${r.analysis.width}×${r.analysis.height}` : '—'])), '');
  return L.join('\n');
}
