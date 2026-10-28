// Relationship graph. Every edge carries a confidence: Direct (resolved to a real file),
// Likely (unique filename/stem match), Unknown (reference exists but could not be resolved).
// External modules (npm packages, stdlib) are recorded as external, never invented as files.
export const CONF = { DIRECT: 'Direct', LIKELY: 'Likely', UNKNOWN: 'Unknown' };

const JS_EXT = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.json', '.vue', '.svelte'];
const JS_INDEX = ['index.js', 'index.mjs', 'index.cjs', 'index.ts', 'index.tsx', 'index.jsx'];
const PY_EXT = ['.py', '.pyi'];
const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'http', 'https', 'url', 'util', 'events', 'stream', 'crypto', 'child_process', 'assert', 'buffer', 'zlib', 'net', 'readline', 'worker_threads', 'process', 'querystring', 'timers', 'cluster', 'tty', 'dns', 'module', 'perf_hooks', 'v8', 'vm']);
const PY_STDLIB = new Set('abc argparse array ast asyncio base64 bisect builtins calendar collections concurrent configparser contextlib copy csv ctypes dataclasses datetime decimal difflib email enum errno fnmatch fractions functools gc getpass glob gzip hashlib heapq hmac html http importlib inspect io ipaddress itertools json logging math mimetypes multiprocessing operator os pathlib pickle platform pprint queue random re secrets select shlex shutil signal socket sqlite3 ssl stat statistics string struct subprocess sys tempfile textwrap threading time timeit tkinter tomllib traceback types typing unittest urllib uuid warnings weakref xml zipfile zlib __future__'.split(' '));

function normalize(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
  }
  return out.join('/');
}
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const basename = (p) => p.split('/').pop();

class Index {
  constructor(files) {
    this.paths = new Set(files.map((f) => f.path));
    this.byName = new Map(); this.byStem = new Map();
    for (const f of files) {
      const n = f.name.toLowerCase();
      (this.byName.get(n) || this.byName.set(n, []).get(n)).push(f.path);
      const stem = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : n;
      (this.byStem.get(stem) || this.byStem.set(stem, []).get(stem)).push(f.path);
    }
  }
  has(p) { return this.paths.has(p); }
  uniqueName(n) { const m = this.byName.get(n.toLowerCase()) || []; return m.length === 1 ? m[0] : null; }
  uniqueStem(stem, exts) { const m = (this.byStem.get(stem.toLowerCase()) || []).filter((p) => exts.some((e) => p.toLowerCase().endsWith(e))); return m.length === 1 ? m[0] : null; }
}

function resolveRelative(from, spec, idx, exts, indexes) {
  const cand = normalize(`${dirname(from)}/${spec}`);
  if (!cand) return null;
  if (idx.has(cand)) return cand;
  for (const e of exts) if (idx.has(cand + e)) return cand + e;
  for (const n of indexes) if (idx.has(`${cand}/${n}`)) return `${cand}/${n}`;
  if (basename(cand).includes('.')) { // './x.js' written for x.ts / x.mjs
    const stem = cand.slice(0, cand.lastIndexOf('.'));
    for (const e of exts) if (idx.has(stem + e)) return stem + e;
  }
  return null;
}

function resolveJs(from, spec, idx) {
  if (!spec) return [null, CONF.UNKNOWN, false];
  if (spec.startsWith('node:')) return [null, CONF.DIRECT, true];
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const r = resolveRelative(from, spec.startsWith('/') ? `/${spec}` : spec, idx, JS_EXT, JS_INDEX) || (spec.startsWith('/') ? resolveRelative('', spec.slice(1), idx, JS_EXT, JS_INDEX) : null);
    return r ? [r, CONF.DIRECT, false] : [null, CONF.UNKNOWN, false];
  }
  if (spec.startsWith('@/') || spec.startsWith('~/')) {
    const r = resolveRelative('', `src/${spec.slice(2)}`, idx, JS_EXT, JS_INDEX) || resolveRelative('', spec.slice(2), idx, JS_EXT, JS_INDEX);
    return r ? [r, CONF.LIKELY, false] : [null, CONF.UNKNOWN, false];
  }
  if (NODE_BUILTINS.has(spec.split('/')[0])) return [null, CONF.DIRECT, true];
  return [null, CONF.DIRECT, true]; // bare specifier -> package
}

function resolvePy(from, mod, level, idx) {
  if (level) {
    let base = dirname(from);
    for (let i = 1; i < level; i++) base = dirname(base);
    const cand = mod ? normalize(`${base}/${mod.replace(/\./g, '/')}`) : base;
    if (cand != null) {
      for (const e of PY_EXT) if (idx.has(cand + e)) return [cand + e, CONF.DIRECT, false];
      if (idx.has(`${cand}/__init__.py`.replace(/^\//, ''))) return [`${cand}/__init__.py`.replace(/^\//, ''), CONF.DIRECT, false];
    }
    return [null, CONF.UNKNOWN, false];
  }
  if (PY_STDLIB.has(mod.split('.')[0])) return [null, CONF.DIRECT, true];
  const asPath = mod.replace(/\./g, '/');
  for (const e of PY_EXT) if (idx.has(asPath + e)) return [asPath + e, CONF.DIRECT, false];
  if (idx.has(`${asPath}/__init__.py`)) return [`${asPath}/__init__.py`, CONF.DIRECT, false];
  const sib = normalize(`${dirname(from)}/${asPath}`);
  if (sib) for (const e of PY_EXT) if (idx.has(sib + e)) return [sib + e, CONF.DIRECT, false];
  // anywhere in tree with matching suffix path (e.g. project root is a subfolder)
  const suffixHit = [...idx.paths].filter((p) => PY_EXT.some((e) => p.endsWith(`/${asPath}${e}`)));
  if (suffixHit.length === 1) return [suffixHit[0], CONF.LIKELY, false];
  const u = idx.uniqueStem(mod.split('.').pop(), PY_EXT);
  if (u && u !== from && mod.includes('.')) return [u, CONF.LIKELY, false];
  return [null, CONF.DIRECT, true];
}

function resolveAsset(from, spec, idx) {
  const s = String(spec).split(/[?#]/)[0].trim();
  if (!s) return [null, CONF.UNKNOWN];
  for (const c of [normalize(`${dirname(from)}/${s}`), normalize(s.replace(/^\/+/, ''))]) if (c && idx.has(c)) return [c, CONF.DIRECT];
  const u = idx.uniqueName(basename(s));
  return u ? [u, CONF.LIKELY] : [null, CONF.UNKNOWN];
}

export function buildGraph(files) {
  const idx = new Index(files);
  const edges = [];
  const seen = new Set();
  const add = (source, target, kind, specifier, confidence, external) => {
    const t = target ?? specifier;
    const key = `${source}|${t}|${kind}|${specifier}`;
    if (seen.has(key) || t === source) return;
    seen.add(key);
    edges.push({ source, target: t, kind, specifier, confidence: target || external ? confidence : CONF.UNKNOWN, resolved: !!target, external: !!external });
  };
  for (const f of files) {
    const a = f.analysis || {};
    const p = f.path;
    switch (a.kind) {
      case 'javascript':
        for (const s of a.imports || []) { const [t, c, x] = resolveJs(p, s, idx); add(p, t, 'import', s, c, x); }
        for (const s of a.requires || []) { const [t, c, x] = resolveJs(p, s, idx); add(p, t, 'require', s, c, x); }
        for (const s of a.dataReferences || []) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'reads', s, c, false); }
        break;
      case 'python':
        for (const m of [...(a.imports || []), ...(a.fromImports || [])]) { const [t, c, x] = resolvePy(p, m, 0, idx); add(p, t, 'import', m, c, x); }
        for (const m of a.relativeImports || []) { const lvl = m.length - m.replace(/^\.+/, '').length; const [t, c, x] = resolvePy(p, m.replace(/^\.+/, ''), lvl, idx); add(p, t, 'import', m, c, x); }
        for (const s of a.dataReferences || []) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'reads', s, c, false); }
        break;
      case 'html':
        for (const s of a.scripts || []) { const [t, c] = resolveAsset(p, s, idx); add(p, t, 'script', s, c, false); }
        for (const s of a.stylesheets || []) { const [t, c] = resolveAsset(p, s, idx); add(p, t, 'stylesheet', s, c, false); }
        for (const s of [...(a.images || []), ...(a.anchors || [])]) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'link', s, c, false); }
        break;
      case 'css':
        for (const s of a.imports || []) {
          let [t, c] = resolveAsset(p, s, idx);
          if (!t && !/\.\w+$/.test(s)) for (const e of ['.scss', '.css', '.sass', '.less']) { const u = resolveAsset(p, `${s}${e}`, idx)[0] || resolveAsset(p, `${dirname(s) ? `${dirname(s)}/` : ''}_${basename(s)}${e}`, idx)[0]; if (u) { t = u; c = CONF.DIRECT; break; } }
          add(p, t, 'import', s, c, false);
        }
        for (const s of a.urls || []) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'asset', s, c, false); }
        break;
      case 'sql':
        for (const s of a.sqlFileReferences || []) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'reference', s, c, false); }
        break;
      case 'source':
        for (const s of a.imports || []) if (/[/.]/.test(s)) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'import', s, c, false); }
        break;
      case 'json': case 'yaml': case 'xml':
        for (const s of a.fileReferences || []) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'reference', s, c, false); }
        break;
      case 'document':
        for (const s of a.localLinks || []) { const [t, c] = resolveAsset(p, s, idx); if (t) add(p, t, 'reference', s, c, false); }
        break;
      default: break;
    }
  }
  // SQL table-level relationships between files: a file that creates a table and another that uses it.
  const creators = new Map();
  for (const f of files) for (const t of f.analysis?.tablesCreated || []) creators.set(t.toLowerCase(), f.path);
  for (const f of files) for (const t of f.analysis?.tablesReferenced || []) {
    const c = creators.get(t.toLowerCase());
    if (c && c !== f.path) add(f.path, c, 'uses-table', t, CONF.LIKELY, false);
  }
  return edges;
}

export const outgoing = (edges, p) => edges.filter((e) => e.source === p);
export const incoming = (edges, p) => edges.filter((e) => e.resolved && e.target === p);
