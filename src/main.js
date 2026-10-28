// ContextForge UI. Vanilla ES modules, no framework. All file content is rendered with
// textContent (never innerHTML), so project files cannot inject markup or script.
import { makeConfig, STORAGE_KEY, DEFAULTS } from './core/config.js';
import { analyzeProject, STAGES, verifyOriginals } from './core/analysis.js';
import { applyStrategy, planContent, summaryCounts, STRATEGIES } from './core/packager.js';
import { generateContextFiles, detectProjectType } from './core/generator.js';
import { exportFor } from './core/pipeline.js';
import { LAYOUTS } from './core/exporter.js';
import { searchProject } from './core/search.js';
import { ALL_CATEGORIES, knownExtensionCount } from './core/registry.js';
import { humanSize, CancelledError } from './core/util.js';
import { safePackageName } from './core/safety.js';
import { supportsDirectoryPicker, supportsDirectoryInput, entriesFromDirectoryHandle, entriesFromFileList, entriesFromDataTransfer } from './core/sources.js';
import { downloadOne, writeAllToFolder, supportsFolderWrite } from './core/download.js';

// ------------------------------------------------------------------ tiny DOM helper
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'value' || k === 'disabled' || k === 'indeterminate') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const app = document.getElementById('app');
const mount = (...nodes) => { app.replaceChildren(...nodes); };

// ------------------------------------------------------------------ state
const state = {
  config: loadSettings(),
  view: 'home',            // home | progress | workspace
  page: 'overview',        // overview | files | package | output
  entries: null, preSkipped: [], rootName: '',
  project: null,
  generation: null, exportResult: null, originalsCheck: null,
  progress: { stage: 0, done: 0, total: 0, label: '' }, signal: null,
  filesUi: { q: '', cat: '', status: 'all', selected: null, contentSearch: false, page: 0 },
  previewOutput: null, writeResult: null, error: '',
};

function loadSettings() {
  try { return makeConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { return makeConfig(); }
}
function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config)); } catch { /* storage unavailable: settings stay in memory */ }
}

// ------------------------------------------------------------------ chrome
function topbar() {
  return h('header', { class: 'topbar' },
    h('button', { class: 'brand', onclick: () => goHome(), 'aria-label': 'ContextForge home' },
      h('img', { class: 'brand-mark', src: './favicon.svg', alt: '' }), 'ContextForge'),
    h('div', { class: 'topbar-actions' },
      state.project ? h('span', { class: 'project-pill', title: state.project.name }, state.project.name) : null,
      state.project && state.view === 'workspace' ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => goHome() }, 'New project') : null,
      h('button', { class: 'btn btn-sm', onclick: openSettings }, 'Settings')));
}

function goHome() {
  if (state.project && !confirm('Close this project? Generated files that were not downloaded will be discarded.')) return;
  Object.assign(state, { view: 'home', project: null, entries: null, generation: null, exportResult: null, originalsCheck: null, writeResult: null, previewOutput: null, error: '' });
  render();
}

// ------------------------------------------------------------------ home
function renderHome() {
  const hasPicker = supportsDirectoryPicker();
  const hasDirInput = supportsDirectoryInput();
  const dirInput = h('input', { type: 'file', class: 'sr-only', webkitdirectory: true, directory: true, multiple: true, onchange: (e) => e.target.files.length && startFromFileList(e.target.files) });
  const fileInput = h('input', { type: 'file', class: 'sr-only', multiple: true, onchange: (e) => e.target.files.length && startFromFileList(e.target.files) });
  const zone = h('div', { class: 'dropzone', ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'), ondrop: onDrop },
    'or drop a project folder here');
  return h('main', { class: 'home' },
    h('h1', {}, 'Turn any project into context an AI can work with.'),
    h('p', { class: 'lede' }, 'ContextForge reads a project folder, understands its structure, and produces a compact set of readable files — overview, verbatim contents, map, data and a manifest — ready to give to any AI assistant.'),
    h('div', { class: 'home-actions' },
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => (hasPicker ? pickDirectory() : dirInput.click()), disabled: !hasPicker && !hasDirInput }, 'Select Project'),
      h('button', { class: 'btn btn-lg', onclick: () => fileInput.click() }, 'Select Files'),
      dirInput, fileInput),
    !hasPicker && !hasDirInput ? h('div', { class: 'notice' }, 'This browser cannot select whole folders. Use “Select Files” to choose individual files (folder paths are then unavailable), or open ContextForge in a current Chromium, Firefox or Safari release.') : null,
    !hasPicker && hasDirInput ? h('div', { class: 'notice info' }, 'Your browser will ask to “upload” the folder. Nothing is uploaded — files are read locally in this tab. Heavy folders such as node_modules are listed by the browser but never read.') : null,
    state.error ? h('div', { class: 'notice err', role: 'alert' }, state.error) : null,
    zone,
    h('div', { class: 'steps', 'aria-label': 'Workflow' },
      ...['Select', 'Analyze', 'Review', 'Package', 'Validate', 'Download'].map((s, i) => h('div', { class: 'step' }, h('b', {}, `0${i + 1}`), h('span', {}, s)))),
    h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('strong', {}, 'Stays on your machine'), 'Processing happens in this browser tab. No upload, account, server or API key.'),
      h('div', { class: 'fact' }, h('strong', {}, 'Source kept verbatim'), 'Code is preserved exactly, with original paths. Truncation and redaction are always stated.'),
      h('div', { class: 'fact' }, h('strong', {}, `${knownExtensionCount()}+ formats`), 'Code in 25+ languages, config, SQL, CSV, Excel, Word, PowerPoint, PDF. Unknown formats are reported, never dropped.')));
}

async function pickDirectory() {
  let handle;
  try { handle = await window.showDirectoryPicker({ mode: 'read', id: 'contextforge-input' }); }
  catch (e) { if (e?.name !== 'AbortError') { state.error = `Folder access was not granted (${e?.name || 'error'}).`; render(); } return; }
  beginProgress();
  try {
    const { entries, skippedDirs, rootName } = await entriesFromDirectoryHandle(handle, { signal: state.signal, excludeDirs: state.config.excludeDirs, onFound: (n) => setProgress(0, n, 0, 'listing files…') });
    await startAnalysis(entries, rootName, skippedDirs);
  } catch (e) { failProgress(e); }
}

function startFromFileList(fileList) {
  const { entries, rootName } = entriesFromFileList(fileList);
  beginProgress();
  startAnalysis(entries, rootName, []).catch(failProgress);
}

async function onDrop(e) {
  e.preventDefault();
  const items = e.dataTransfer?.items;
  if (!items?.length) return;
  beginProgress();
  try {
    const { entries, rootName, skippedDirs } = await entriesFromDataTransfer(items, { excludeDirs: state.config.excludeDirs });
    await startAnalysis(entries, rootName, skippedDirs);
  } catch (err) { failProgress(err); }
}

// ------------------------------------------------------------------ progress
function beginProgress() {
  state.signal = { cancelled: false };
  state.view = 'progress'; state.error = '';
  state.progress = { stage: 0, done: 0, total: 0, label: 'opening…' };
  render();
}
let progressEls = null;
function setProgress(stage, done, total, label) {
  state.progress = { stage, done, total, label };
  if (!progressEls) return;
  progressEls.items.forEach((li, i) => { li.className = i < stage ? 'done' : i === stage ? 'active' : ''; });
  progressEls.bar.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  progressEls.count.textContent = total ? `${done.toLocaleString()} / ${total.toLocaleString()}` : done ? `${done.toLocaleString()} found` : '';
  progressEls.label.textContent = label || '';
}
function renderProgress() {
  const items = STAGES.map((s) => h('li', {}, h('span', { class: 'stage-dot' }), s));
  const bar = h('i'); const count = h('span'); const label = h('span');
  progressEls = { items, bar, count, label };
  const view = h('main', { class: 'progress-view' },
    h('h2', {}, 'Working on your project'),
    h('ol', { class: 'stage-list' }, items),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Progress' }, bar),
    h('div', { class: 'progress-meta' }, count, label),
    h('div', { style: 'margin-top:22px' }, h('button', { class: 'btn', onclick: () => { state.signal.cancelled = true; } }, 'Cancel')));
  queueMicrotask(() => setProgress(state.progress.stage, state.progress.done, state.progress.total, state.progress.label));
  return view;
}
function failProgress(e) {
  progressEls = null;
  state.view = state.project ? 'workspace' : 'home';
  state.error = e instanceof CancelledError ? 'Cancelled. Nothing was changed.' : `Something went wrong: ${e?.message || e}`;
  if (!(e instanceof CancelledError)) console.error(e);
  render();
}

async function startAnalysis(entries, rootName, preSkipped) {
  if (!entries.length) throw new Error('No files were found in the selection.');
  state.entries = entries; state.preSkipped = preSkipped; state.rootName = rootName;
  await runAnalysis();
}
async function runAnalysis() {
  state.signal = state.signal?.cancelled === false ? state.signal : { cancelled: false };
  const project = await analyzeProject(state.entries, {
    config: state.config, signal: state.signal, projectName: state.rootName || undefined, preSkippedDirs: state.preSkipped,
    onProgress: (stage, done, total, label) => setProgress(stage, done, total, label),
  });
  setProgress(3, 1, 1, 'applying strategy');
  applyStrategy(project, state.config.strategy);
  Object.assign(state, { project, generation: null, exportResult: null, originalsCheck: null, writeResult: null, previewOutput: null, view: 'workspace', page: 'overview', error: '' });
  state.filesUi = { q: '', cat: '', status: 'all', selected: null, contentSearch: false, page: 0 };
  progressEls = null;
  render();
}

// ------------------------------------------------------------------ workspace
function invalidatePackage() { state.generation = null; state.exportResult = null; state.originalsCheck = null; state.writeResult = null; state.previewOutput = null; }

function renderWorkspace() {
  const c = summaryCounts(state.project);
  const nav = [['overview', 'Overview'], ['files', 'Review files', c.included], ['package', 'Package'], ['output', 'Output', state.exportResult ? state.exportResult.exportPlan.outputs.length : null]];
  const pages = { overview: pageOverview, files: pageFiles, package: pagePackage, output: pageOutput };
  return h('div', { class: 'workspace' },
    h('nav', { class: 'sidenav', 'aria-label': 'Workspace' },
      ...nav.map(([id, label, n], i) => h('button', { 'aria-current': state.page === id ? 'page' : null, onclick: () => { state.page = id; render(); } },
        h('span', {}, h('span', { class: 'num' }, `0${i + 1} `), label), n != null ? h('span', { class: 'num' }, n) : null)),
      h('div', { class: 'sidenav-foot' }, 'All processing is local. Original files are only read, never modified.')),
    h('main', { class: 'main' }, state.error ? h('div', { class: 'notice err', role: 'alert', style: 'margin-bottom:14px' }, state.error) : null, pages[state.page]()));
}

function stat(k, v, tone = '') { return h('div', { class: `stat ${tone}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)); }

function pageOverview() {
  const p = state.project; const c = summaryCounts(p);
  const est = planContent(p, state.config);
  const types = detectProjectType(p);
  const failed = p.files.filter((r) => r.status === 'failed');
  const partial = p.files.filter((r) => r.status === 'partial' || r.status === 'metadata-only');
  const secrets = p.files.filter((r) => r.secrets.length);
  const sensitive = p.files.filter((r) => r.sensitive);
  const estFiles = 2 + (est.plan.some((x) => x.target === 'data' && x.mode !== 'omitted') ? 1 : 0) + (p.files.filter((r) => r.status !== 'skipped').length > 8 || p.relationships.filter((e) => e.resolved && !e.external).length > 5 ? 1 : 0) + Math.max(0, Math.ceil(est.estimatedBytes / (state.config.maxContentsFileMB * 1048576)) - 1);
  return h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, p.name), h('p', {}, `Analysed ${c.total.toLocaleString()} files in ${(p.durationMs / 1000).toFixed(1)}s using static analysis. Nothing was executed.`)),
      h('div', { class: 'inline-actions' }, h('button', { class: 'btn', onclick: () => { state.page = 'files'; render(); } }, 'Review files'), h('button', { class: 'btn btn-primary', onclick: () => { state.page = 'package'; render(); } }, 'Continue to package'))),
    h('div', { class: 'stats' },
      stat('Discovered', c.total.toLocaleString()), stat('Relevant', c.relevant.toLocaleString()), stat('Included', c.included.toLocaleString(), 'ok'),
      stat('Excluded', c.excluded.toLocaleString()), stat('Unknown', c.unknown, c.unknown ? 'warn' : ''), stat('Large', c.large, c.large ? 'warn' : ''),
      stat('Failures', c.failed, c.failed ? 'err' : ''), stat('Est. output files', estFiles), stat('Est. output size', humanSize(est.estimatedBytes))),
    h('div', { class: 'grid-2' },
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Detected project type'), h('span', { class: 'badge' }, 'inferred')),
        h('div', { class: 'panel-body' }, h('ul', { class: 'list' }, types.map(([t, ev]) => h('li', {}, h('strong', { style: 'color:var(--text)' }, t), ' — ', ev))))),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Entry points')),
        h('div', { class: 'panel-body' }, (() => { const e = p.files.filter((r) => r.entryPoint); return e.length ? h('ul', { class: 'list' }, e.slice(0, 12).map((r) => h('li', {}, h('code', {}, r.path), h('span', { class: 'small' }, ` — ${r.entryEvidence[0]}`)))) : h('p', { class: 'small' }, 'No entry point identified with confidence.'); })()))),
    secrets.length || sensitive.length ? h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Potential secrets'), h('span', { class: 'badge warn' }, `${secrets.length + sensitive.filter((s) => !s.secrets.length).length} file(s)`)),
      h('div', { class: 'panel-body' },
        h('p', { class: 'small', style: 'margin-top:0' }, state.config.redactSecrets ? 'Detected values will be replaced with [REDACTED: type] markers in the generated files. ' : 'Redaction is OFF — detected values would be copied into the output. ', state.config.excludeSensitiveFiles ? 'Sensitive files (.env, keys) are excluded by default.' : 'Sensitive files are NOT excluded by default.', ' Detection is pattern-based and cannot be guaranteed complete.'),
        h('ul', { class: 'list' }, [...new Set([...sensitive, ...secrets])].slice(0, 20).map((r) => h('li', {}, h('code', {}, r.path), ' ', r.sensitive ? h('span', { class: 'badge warn' }, 'sensitive file') : null, ' ', r.secrets.length ? h('span', { class: 'small' }, `${r.secrets.length} finding(s): ${[...new Set(r.secrets.map((s) => `${s.type} (line ${s.line})`))].slice(0, 3).join(', ')}`) : null, ' ', r.included ? h('span', { class: 'badge' }, 'included') : h('span', { class: 'badge' }, 'excluded')))))) : null,
    failed.length || partial.length ? h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Processing limitations'), h('span', { class: `badge ${failed.length ? 'err' : 'warn'}` }, `${failed.length + partial.length}`)),
      h('div', { class: 'panel-body' }, h('ul', { class: 'list' }, [...failed, ...partial].slice(0, 30).map((r) => h('li', {}, h('code', {}, r.path), h('span', { class: 'small' }, ` — ${r.error || (r.analysis.limitations || [r.analysis.note]).filter(Boolean).join(' ')}`)))))) : null,
    p.skippedDirs.length ? h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Skipped folders'), h('span', { class: 'small' }, 'dependencies, caches, build output')),
      h('div', { class: 'panel-body small' }, p.skippedDirs.slice(0, 40).map((d) => `${d.dir}/ (${d.count ?? 'not read'})`).join(' · '))) : null);
}

// ---------- files
const STATUS_FILTERS = [['all', 'All'], ['included', 'Included'], ['excluded', 'Excluded'], ['unknown', 'Unknown'], ['large', 'Large'], ['failed', 'Failed / partial'], ['sensitive', 'Sensitive'], ['skipped', 'Skipped folders']];
const PAGE_SIZE = 400;

function filteredFiles() {
  const { q, cat, status } = state.filesUi;
  const needle = q.toLowerCase();
  return state.project.files.filter((r) => {
    if (needle && !r.path.toLowerCase().includes(needle)) return false;
    if (cat && r.category !== cat) return false;
    switch (status) {
      case 'included': return r.included;
      case 'excluded': return !r.included && r.status !== 'skipped';
      case 'unknown': return r.unknown;
      case 'large': return r.large;
      case 'failed': return ['failed', 'partial', 'metadata-only'].includes(r.status);
      case 'sensitive': return r.sensitive || r.secrets.length;
      case 'skipped': return r.status === 'skipped';
      default: return true;
    }
  });
}

function setOverride(paths, value) {
  for (const p of paths) { const r = state.project.byPath.get(p); if (r && r.status !== 'skipped') r.override = value; }
  applyStrategy(state.project, state.project.strategy);
  invalidatePackage();
  render();
}

function pageFiles() {
  const p = state.project; const ui = state.filesUi;
  const rows = filteredFiles();
  const dirs = [...new Set(p.files.filter((r) => r.status !== 'skipped').map((r) => r.dir).filter(Boolean))].sort();
  const exts = [...new Set(p.files.filter((r) => r.status !== 'skipped').map((r) => r.ext).filter(Boolean))].sort();
  const search = h('input', { class: 'input grow', type: 'search', placeholder: ui.contentSearch ? 'Search file contents (paths, code, SQL, config, extracted text)…' : 'Filter by path or filename…', value: ui.q, 'aria-label': 'Search',
    oninput: debounce((e) => { ui.q = e.target.value; ui.page = 0; renderKeepFocus('files-search'); }, 160), id: 'files-search' });
  const toolbar = h('div', { class: 'toolbar' }, search,
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ui.contentSearch, onchange: (e) => { ui.contentSearch = e.target.checked; render(); } }), 'Search contents'),
    h('select', { class: 'input', 'aria-label': 'Category', onchange: (e) => { ui.cat = e.target.value; ui.page = 0; render(); } }, h('option', { value: '' }, 'All categories'), ...ALL_CATEGORIES.map((c) => h('option', { value: c, selected: ui.cat === c ? true : null }, c))),
    h('select', { class: 'input', 'aria-label': 'Status', onchange: (e) => { ui.status = e.target.value; ui.page = 0; render(); } }, ...STATUS_FILTERS.map(([v, l]) => h('option', { value: v, selected: ui.status === v ? true : null }, l))));
  const bulk = h('div', { class: 'toolbar' },
    h('span', { class: 'small' }, 'Bulk:'),
    bulkSelect('Folder…', dirs, (d) => p.files.filter((r) => r.dir === d || r.dir.startsWith(`${d}/`)).map((r) => r.path)),
    bulkSelect('Extension…', exts, (x) => p.files.filter((r) => r.ext === x).map((r) => r.path)),
    h('button', { class: 'btn btn-sm', onclick: () => setOverride(rows.map((r) => r.path), true) }, `Include ${rows.length} shown`),
    h('button', { class: 'btn btn-sm', onclick: () => setOverride(rows.map((r) => r.path), false) }, `Exclude ${rows.length} shown`),
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => setOverride(p.files.map((r) => r.path), null) }, 'Reset overrides'));

  let body;
  if (ui.contentSearch && ui.q.trim()) {
    const results = searchProject(p, ui.q);
    body = results.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Matches'))),
      h('tbody', {}, results.map((res) => h('tr', { class: state.filesUi.selected === res.path ? 'selected' : '' },
        h('td', { class: 'path', onclick: () => { ui.selected = res.path; render(); } }, res.path, ' ', res.included ? h('span', { class: 'badge ok' }, 'included') : h('span', { class: 'badge' }, 'excluded')),
        h('td', { class: 'reason' }, res.hits.map((hit) => h('div', { class: 'mono' }, hit.line ? `${hit.line}: ` : 'path: ', hit.text))))))))
      : h('div', { class: 'empty' }, 'No matches.');
  } else {
    const start = ui.page * PAGE_SIZE; const pageRows = rows.slice(start, start + PAGE_SIZE);
    const all = h('input', { type: 'checkbox', 'aria-label': 'Toggle all shown', checked: pageRows.length && pageRows.every((r) => r.included), indeterminate: pageRows.some((r) => r.included) && !pageRows.every((r) => r.included), onchange: (e) => setOverride(pageRows.map((r) => r.path), e.target.checked) });
    body = h('div', {},
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { style: 'width:34px' }, all), h('th', {}, 'Path'), h('th', {}, 'Category'), h('th', { style: 'text-align:right' }, 'Size'), h('th', {}, 'Status'), h('th', {}, 'Reason / note'))),
        h('tbody', {}, pageRows.map(fileRow)))),
      h('div', { class: 'table-foot inline-actions' }, `${rows.length.toLocaleString()} file(s) shown of ${p.files.length.toLocaleString()}`,
        rows.length > PAGE_SIZE ? [h('button', { class: 'btn btn-sm', disabled: ui.page === 0, onclick: () => { ui.page--; render(); } }, 'Prev'), `page ${ui.page + 1} / ${Math.ceil(rows.length / PAGE_SIZE)}`, h('button', { class: 'btn btn-sm', disabled: start + PAGE_SIZE >= rows.length, onclick: () => { ui.page++; render(); } }, 'Next')] : null));
  }
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'Review files'), h('p', {}, 'Tick to include, untick to exclude. Your choices override the strategy and rules. Excluding a file only affects the generated output.')),
      h('button', { class: 'btn btn-primary', onclick: () => { state.page = 'package'; render(); } }, 'Continue to package')),
    h('section', { class: 'panel' }, toolbar, bulk, body, ui.selected ? filePreview(ui.selected) : null));
}

function bulkSelect(placeholder, values, pathsFor) {
  const sel = h('select', { class: 'input', 'aria-label': placeholder }, h('option', { value: '' }, placeholder), ...values.map((v) => h('option', { value: v }, v)));
  return h('span', { class: 'inline-actions' }, sel,
    h('button', { class: 'btn btn-sm', onclick: () => sel.value && setOverride(pathsFor(sel.value), true) }, 'Include'),
    h('button', { class: 'btn btn-sm', onclick: () => sel.value && setOverride(pathsFor(sel.value), false) }, 'Exclude'));
}

function statusBadge(r) {
  if (r.status === 'skipped') return h('span', { class: 'badge' }, 'skipped');
  if (r.status === 'failed') return h('span', { class: 'badge err' }, 'failed');
  if (r.status === 'partial') return h('span', { class: 'badge warn' }, 'partial');
  if (r.status === 'metadata-only') return h('span', { class: 'badge warn' }, 'metadata only');
  return h('span', { class: 'badge ok' }, 'read');
}

function fileRow(r) {
  const tags = [r.unknown ? h('span', { class: 'badge warn' }, 'unknown') : null, r.sensitive ? h('span', { class: 'badge warn' }, 'sensitive') : null, r.secrets.length ? h('span', { class: 'badge warn' }, `${r.secrets.length} secret?`) : null, r.entryPoint ? h('span', { class: 'badge acc' }, 'entry') : null, r.override != null ? h('span', { class: 'badge acc' }, 'manual') : null];
  return h('tr', { class: `${r.included ? '' : 'excluded'} ${state.filesUi.selected === r.path ? 'selected' : ''}` },
    h('td', {}, h('input', { type: 'checkbox', checked: r.included, disabled: r.status === 'skipped', 'aria-label': `Include ${r.path}`, onchange: (e) => setOverride([r.path], e.target.checked) })),
    h('td', { class: 'path', tabindex: 0, onclick: () => { state.filesUi.selected = r.path; render(); }, onkeydown: (e) => { if (e.key === 'Enter') { state.filesUi.selected = r.path; render(); } } }, r.path, ' ', ...tags.filter(Boolean).flatMap((t) => [t, ' '])),
    h('td', { class: 'small' }, r.category, r.language ? h('div', { class: 'small', style: 'color:var(--faint)' }, r.language) : null),
    h('td', { class: 'num' }, humanSize(r.size)),
    h('td', {}, statusBadge(r)),
    h('td', { class: 'reason' }, r.included ? (r.duplicateOf ? `duplicate of ${r.duplicateOf}` : '') : r.reason));
}

function filePreview(path) {
  const r = state.project.byPath.get(path);
  if (!r) return null;
  let text = r.text ?? r.analysis.extractedText ?? null;
  let note = '';
  if (text == null) {
    note = r.status === 'skipped' ? 'Not read (inside an excluded folder).' : r.error || r.analysis.note || 'No text preview available for this file type.';
    const a = r.analysis;
    if (a.kind === 'spreadsheet') text = a.sheets.map((s) => `Sheet "${s.name}" ${s.dimension} — ${s.rows} rows, ${s.formulaCount} formulas\n  ${(s.headers || []).join(' | ')}\n${(s.sampleRows || []).map((x) => `  ${x.join(' | ')}`).join('\n')}`).join('\n\n');
    else if (a.kind === 'image') text = `${a.format} image${a.width ? ` ${a.width}×${a.height}` : ''}. Image content is not interpreted.`;
  }
  const shown = text != null && text.length > 200_000 ? `${text.slice(0, 200_000)}\n\n… preview limited to 200,000 characters` : text;
  return h('div', { class: 'preview' },
    h('div', { class: 'preview-head' }, h('span', {}, `${path} · read-only preview${r.secrets.length && state.config.redactSecrets ? ' · secrets will be redacted in output' : ''}`), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { state.filesUi.selected = null; render(); } }, 'Close')),
    h('pre', {}, shown ?? note));
}

// ---------- package
function pagePackage() {
  const p = state.project; const cfg = state.config;
  const est = planContent(p, cfg);
  const truncated = est.plan.filter((x) => x.mode === 'truncated').length;
  const omitted = est.plan.filter((x) => x.mode === 'omitted').length;
  const strategyCards = h('div', { class: 'strategy-cards', role: 'radiogroup', 'aria-label': 'Packaging strategy' },
    ...Object.entries(STRATEGIES).map(([id, s]) => h('label', { class: 'strategy-card' },
      h('input', { type: 'radio', name: 'strategy', value: id, checked: p.strategy === id, onchange: () => { applyStrategy(p, id); invalidatePackage(); render(); } }),
      h('strong', {}, s.label, id === 'smart' ? h('span', { class: 'badge acc', style: 'margin-left:8px' }, 'default') : null), h('p', {}, s.blurb))));
  const num = (key, label, step = 0.5) => h('label', { class: 'field' }, label, h('input', { class: 'input', type: 'number', min: 0.1, step, value: cfg[key], onchange: (e) => { const v = Number(e.target.value); if (v > 0) { cfg[key] = v; saveSettings(); invalidatePackage(); render(); } } }));
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'Package'), h('p', {}, 'Choose how much of the project to include. The strategy changes the actual contents of the generated files; your manual selections always win.'))),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Strategy')), h('div', { class: 'panel-body' }, strategyCards)),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Output budget')),
      h('div', { class: 'panel-body' },
        h('div', { class: 'field-row' }, num('maxOutputMB', 'Max generated text (MB)'), num('maxContentsFileMB', 'Split contents file above (MB)'), num('maxFileSizeMB', 'Max source file size to extract (MB) — re-analysis needed')),
        h('p', { class: 'small' }, 'When the budget is reached, entry points and core source are kept first, then tests, configuration, documentation and data. Anything truncated or omitted is listed in the overview and manifest. These are sizes, not AI-service limits — assistants differ in file-size and context limits, and ContextForge does not claim the package fits any particular one.'))),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Estimate')),
      h('div', { class: 'panel-body' },
        h('dl', { class: 'kv' },
          h('dt', {}, 'Files with content'), h('dd', {}, est.plan.length),
          h('dt', {}, 'Estimated generated text'), h('dd', {}, `${humanSize(est.estimatedBytes)} of ${humanSize(est.budgetBytes)} budget`),
          h('dt', {}, 'Will be truncated'), h('dd', {}, truncated ? h('span', { class: 'badge warn' }, truncated) : '0'),
          h('dt', {}, 'Will be omitted (budget)'), h('dd', {}, omitted ? h('span', { class: 'badge warn' }, omitted) : '0'),
          h('dt', {}, 'Secret redaction'), h('dd', {}, cfg.redactSecrets ? 'on' : h('span', { class: 'badge err' }, 'off'))),
        h('hr', { class: 'sep' }),
        h('button', { class: 'btn btn-primary btn-lg', disabled: !est.plan.length, onclick: generate }, state.generation ? 'Regenerate context files' : 'Generate context files'),
        !est.plan.length ? h('p', { class: 'small' }, 'Nothing is selected. Include at least one file in Review files.') : null)));
}

async function generate() {
  state.signal = { cancelled: false };
  state.view = 'progress'; render();
  try {
    setProgress(3, 1, 1, 'selecting content'); await tick();
    setProgress(4, 0, 1, 'writing context files'); await tick();
    const generation = generateContextFiles(state.project, state.config);
    if (state.signal.cancelled) throw new CancelledError();
    setProgress(5, 0, 1, 'validating generated files'); await tick();
    state.generation = generation;
    await runExport(state.config.exportLayout, false);
    setProgress(5, 0, 1, 're-reading originals to confirm they are unchanged'); await tick();
    const paths = state.project.files.filter((r) => r.included && r.sha256).map((r) => r.path);
    state.originalsCheck = await verifyOriginals(state.project, state.entries, paths);
    setProgress(6, 1, 1, 'ready'); await tick();
    progressEls = null; state.view = 'workspace'; state.page = 'output'; state.error = '';
    render();
  } catch (e) { failProgress(e); }
}

async function runExport(layout, rerender = true) {
  state.config.exportLayout = layout; saveSettings();
  state.exportResult = await exportFor(state.project, state.generation, state.config, layout);
  state.writeResult = null;
  if (state.previewOutput) state.previewOutput = state.exportResult.exportPlan.outputs.find((o) => o.id === state.previewOutput.id) || null;
  if (rerender) render();
}

// ---------- output
function pageOutput() {
  if (!state.exportResult) {
    return h('div', {}, h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'Output'), h('p', {}, 'No package generated yet.'))),
      h('button', { class: 'btn btn-primary', onclick: () => { state.page = 'package'; render(); } }, 'Go to Package'));
  }
  const { exportPlan, validation } = state.exportResult;
  const oc = state.originalsCheck;
  const checks = [...validation.checks];
  if (oc) checks.push({ name: 'Original files unchanged', ok: !oc.changed.length, detail: oc.changed.length ? `changed since analysis: ${oc.changed.join(', ')}` : `${oc.checked} included file(s) re-read and re-hashed${oc.unreadable.length ? `; ${oc.unreadable.length} could not be re-read` : ''}` });
  const allOk = checks.every((c) => c.ok);
  const pkgName = `${safePackageName(state.project.name)}_ContextForge`;
  const layoutCtl = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Export layout' },
    ...Object.entries(LAYOUTS).map(([id, label]) => h('label', {}, h('input', { type: 'radio', name: 'layout', value: id, checked: exportPlan.layout === id, onchange: () => runExport(id) }), h('span', {}, label))));
  const tree = exportPlan.layout === 'preserve'
    ? [`${pkgName}/`, ...exportPlan.outputs.map((o) => o.exportPath).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).map((p, i, arr) => `${i === arr.length - 1 ? '└── ' : '├── '}${p}`)].join('\n')
    : [`${pkgName}/`, ...exportPlan.outputs.map((o, i, arr) => `${i === arr.length - 1 ? '└── ' : '├── '}${o.exportPath}`)].join('\n');
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'Output'), h('p', {}, 'Your generated context files. Upload them to any AI assistant that accepts Markdown/JSON files — start with PROJECT_OVERVIEW.md.')),
      allOk ? h('span', { class: 'badge ok' }, 'Validated') : h('span', { class: 'badge err' }, 'Validation found problems')),
    h('div', { class: 'stats' }, stat('Package', pkgName.length > 18 ? `${pkgName.slice(0, 17)}…` : pkgName), stat('Generated files', exportPlan.outputs.length), stat('Total size', humanSize(exportPlan.totalBytes)), stat('Layout', exportPlan.layoutLabel), stat('Validation', allOk ? 'Passed' : `${checks.filter((c) => !c.ok).length} failed`, allOk ? 'ok' : 'err')),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', {}, 'Export layout'), layoutCtl),
      h('div', { class: 'panel-body small' }, exportPlan.layout === 'flat'
        ? 'Flat Files: every generated file at one level; folder names are folded into the filename (context/PROJECT_CONTENTS.md → context_PROJECT_CONTENTS.md). Links and the manifest use these names.'
        : 'Preserve Folder Structure: generated files keep their folders (context/, maps/). Links between files are relative.'),
      h('pre', { class: 'tree' }, tree)),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', {}, 'Generated files'),
        h('div', { class: 'inline-actions' },
          supportsFolderWrite() ? h('button', { class: 'btn btn-primary', onclick: () => downloadAllToFolder(pkgName) }, 'Download All to Folder') : null)),
      !supportsFolderWrite() ? h('div', { class: 'notice', style: 'margin:12px 16px' }, 'This browser cannot write into a folder, so files download one at a time. ', exportPlan.layout === 'preserve' ? 'Browser downloads cannot create sub-folders — each file is saved under its own name; the intended folder for each one is shown here and recorded in PACKAGE_MANIFEST.json. Choose Flat Files if you prefer names that already encode the folder.' : '') : null,
      state.writeResult ? writeResultNotice() : null,
      h('ul', { class: 'outfiles' }, exportPlan.outputs.map((o) => h('li', {},
        h('span', { class: 'path' }, o.exportPath.includes('/') ? h('span', { class: 'dir' }, o.exportPath.slice(0, o.exportPath.lastIndexOf('/') + 1)) : null, o.exportName),
        h('span', { class: 'size' }, humanSize(o.bytes)),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { state.previewOutput = o; render(); } }, 'Preview'),
        h('button', { class: 'btn btn-sm', onclick: () => downloadOne(o), 'aria-label': `Download ${o.exportName}` }, 'Download')))),
      state.previewOutput ? h('div', { class: 'preview' }, h('div', { class: 'preview-head' }, h('span', {}, state.previewOutput.exportPath), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { state.previewOutput = null; render(); } }, 'Close')),
        h('pre', {}, state.previewOutput.content.length > 300_000 ? `${state.previewOutput.content.slice(0, 300_000)}\n\n… preview limited; the downloaded file is complete.` : state.previewOutput.content)) : null),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Validation'), h('span', { class: 'small' }, 'computed from the generated files')),
      h('div', { class: 'panel-body' }, h('ul', { class: 'checks' }, checks.map((c) => h('li', { class: c.ok ? 'ok' : 'bad' }, h('span', { class: 'mark' }, c.ok ? '✓' : '✗'), h('span', {}, c.name, h('span', { class: 'detail' }, c.detail))))))));
}

function writeResultNotice() {
  const w = state.writeResult;
  if (w.error) return h('div', { class: 'notice err', style: 'margin:12px 16px' }, w.error);
  const failed = w.results.filter((r) => !r.ok);
  return failed.length
    ? h('div', { class: 'notice err', style: 'margin:12px 16px' }, `${w.results.length - failed.length} of ${w.results.length} files written to ${w.folder}. Failed: `, failed.map((f) => `${f.exportPath} (${f.error})`).join('; '), '. Use the individual Download buttons for those files.')
    : h('div', { class: 'notice ok', style: 'margin:12px 16px' }, `All ${w.results.length} files written to “${w.folder}” using the ${state.exportResult.exportPlan.layoutLabel} layout.`);
}

async function downloadAllToFolder(pkgName) {
  try {
    state.writeResult = await writeAllToFolder(state.exportResult.exportPlan.outputs, pkgName);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    state.writeResult = { error: `Could not write to the chosen folder (${e?.name || 'error'}: ${e?.message || e}). Nothing was written, or writing stopped part-way. Use the individual Download buttons instead.`, results: [] };
  }
  render();
}

// ------------------------------------------------------------------ settings dialog
function openSettings() {
  const c = { ...state.config };
  const dlg = h('dialog', { 'aria-label': 'Settings' });
  const num = (k, label) => h('label', { class: 'field' }, label, h('input', { class: 'input', type: 'number', min: 0.1, step: 0.5, value: c[k], onchange: (e) => { c[k] = Number(e.target.value); } }));
  const chk = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c[k], onchange: (e) => { c[k] = e.target.checked; } }), label);
  const sel = (k, label, opts) => h('label', { class: 'field' }, label, h('select', { class: 'input', onchange: (e) => { c[k] = e.target.value; } }, ...opts.map(([v, l]) => h('option', { value: v, selected: c[k] === v ? true : null }, l))));
  const area = (k, label) => h('label', { class: 'field' }, label, h('textarea', { class: 'input', rows: 4, onchange: (e) => { c[k] = e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean); } }, c[k].join('\n')));
  dlg.append(
    h('div', { class: 'panel-head' }, h('h3', {}, 'Settings'), h('span', { class: 'small' }, 'stored in this browser only — never project content')),
    h('div', { class: 'panel-body' },
      h('div', { class: 'field-row' }, sel('strategy', 'Default strategy', Object.entries(STRATEGIES).map(([k, v]) => [k, v.label])), sel('exportLayout', 'Default export layout', Object.entries(LAYOUTS))),
      h('div', { class: 'field-row' }, num('maxFileSizeMB', 'Max source file size (MB)'), num('maxDocumentMB', 'Max PDF/Office size (MB)'), num('maxOutputMB', 'Max generated text (MB)'), num('maxContentsFileMB', 'Split contents above (MB)')),
      h('div', { style: 'display:grid;gap:8px' }, chk('detectSecrets', 'Detect potential secrets'), chk('redactSecrets', 'Redact detected secrets in generated files'), chk('excludeSensitiveFiles', 'Exclude sensitive files (.env, keys, credentials) by default'), chk('respectGitignore', 'Use .gitignore as an exclusion signal'), chk('includeLockfiles', 'Include lock files')),
      area('excludeDirs', 'Excluded folders (one per line)'), area('excludePatterns', 'Excluded file patterns (one per line)')),
    h('div', { class: 'dialog-foot' },
      h('button', { class: 'btn btn-ghost', onclick: () => { Object.assign(c, makeConfig()); state.config = makeConfig(); saveSettings(); dlg.close(); render(); } }, 'Restore defaults'),
      h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', onclick: async () => {
        const scanChanged = ['maxFileSizeMB', 'maxDocumentMB', 'detectSecrets', 'excludeSensitiveFiles', 'respectGitignore', 'includeLockfiles', 'excludeDirs', 'excludePatterns'].some((k) => JSON.stringify(c[k]) !== JSON.stringify(state.config[k]));
        state.config = makeConfig(c); saveSettings(); dlg.close();
        if (state.project && scanChanged && confirm('Some changes affect analysis. Re-analyse the project now? (Manual selections will be reset.)')) { beginProgress(); runAnalysis().catch(failProgress); return; }
        if (state.project) { applyStrategy(state.project, state.project.strategy); invalidatePackage(); }
        render();
      } }, 'Save')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ------------------------------------------------------------------ util + render
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const tick = () => new Promise((r) => setTimeout(r, 0));
function renderKeepFocus(id) {
  const el = document.getElementById(id); const pos = el?.selectionStart;
  render();
  const again = document.getElementById(id);
  if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* not a text input */ } }
}

function render() {
  const view = state.view === 'progress' ? renderProgress() : state.view === 'workspace' && state.project ? renderWorkspace() : renderHome();
  mount(topbar(), view);
}

window.addEventListener('beforeunload', (e) => { if (state.project) { e.preventDefault(); e.returnValue = ''; } });
render();
export const __test = { state, DEFAULTS, render, runExport };
