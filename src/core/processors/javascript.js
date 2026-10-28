import { detectFrameworks } from '../registry.js';
import { uniq } from '../util.js';

const RE = {
  importFrom: /^\s*import\s+[^;'"]*?from\s+['"]([^'"]+)['"]/gm,
  importBare: /^\s*import\s+['"]([^'"]+)['"]/gm,
  importDyn: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  exportFrom: /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm,
  require: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  namedExport: /^\s*export\s+(?:async\s+)?(?:default\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  exportList: /^\s*export\s*\{([^}]*)\}/gm,
  exportDefault: /^\s*export\s+default\b/m,
  moduleExports: /\bmodule\.exports\s*(?:\.([A-Za-z_$][\w$]*))?\s*=/g,
  exportsProp: /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
  functions: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
  arrow: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm,
  classes: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  dataRef: /['"`]([^'"`\s]+\.(?:json|ya?ml|csv|tsv|xlsx?|sql|txt|ini|toml|env|html|css))['"`]/g,
};
const all = (re, text, g = 1) => [...text.matchAll(re)].map((m) => m[g]);

function moduleKind(ext, text, esm, cjs) {
  if (ext === '.mjs' || ext === '.mts') return 'ES Module (.mjs)';
  if (ext === '.cjs' || ext === '.cts') return 'CommonJS (.cjs)';
  if (esm && cjs) return 'Mixed ESM/CommonJS';
  if (esm) return 'ES Module';
  if (cjs) return 'CommonJS';
  return 'Script';
}

export const javascriptProcessor = {
  name: 'javascript', priority: 60,
  match: (r) => ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte'].includes(r.ext),
  process({ record, text }) {
    const imports = uniq([...all(RE.importFrom, text), ...all(RE.importBare, text), ...all(RE.importDyn, text), ...all(RE.exportFrom, text)]);
    const requires = uniq(all(RE.require, text));
    const exports = [...all(RE.namedExport, text)];
    for (const block of all(RE.exportList, text)) for (const item of block.split(',')) { const t = item.trim(); if (t) exports.push(t.split(/\s+as\s+/).pop().trim()); }
    if (RE.exportDefault.test(text)) exports.push('default');
    for (const m of text.matchAll(RE.moduleExports)) exports.push(m[1] || 'module.exports');
    exports.push(...all(RE.exportsProp, text));
    const esm = /^\s*(?:import\s|import\{|export\s|export\{)/m.test(text);
    const cjs = requires.length > 0 || /module\.exports|exports\./.test(text);
    return {
      kind: 'javascript',
      moduleKind: moduleKind(record.ext, text, esm, cjs),
      imports, requires,
      exports: uniq(exports),
      functions: uniq([...all(RE.functions, text), ...all(RE.arrow, text)]).slice(0, 80),
      classes: uniq(all(RE.classes, text)).slice(0, 40),
      dataReferences: uniq(all(RE.dataRef, text)).filter((d) => !imports.includes(d) && !requires.includes(d)).slice(0, 40),
      testFrameworks: detectFrameworks(text),
    };
  },
};

const TEST_TOOLS = new Set(['jest', 'mocha', 'vitest', 'cypress', '@playwright/test', 'playwright', 'jasmine', 'ava', 'tape', 'karma', 'selenium-webdriver', 'webdriverio', '@wdio/cli']);

export const packageJsonProcessor = {
  name: 'npm-metadata', priority: 90,
  match: (r) => r.name.toLowerCase() === 'package.json',
  process({ text }) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { kind: 'npm-metadata', error: `invalid JSON (${e.message.slice(0, 80)})` }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'npm-metadata', error: 'package.json root is not an object' };
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const deps = Object.keys(obj(data.dependencies)).sort();
    const dev = Object.keys(obj(data.devDependencies)).sort();
    const bin = typeof data.bin === 'string' ? [data.bin] : Object.values(obj(data.bin));
    return {
      kind: 'npm-metadata',
      packageName: String(data.name || ''), version: String(data.version || ''),
      description: String(data.description || ''), type: String(data.type || ''),
      scripts: Object.fromEntries(Object.entries(obj(data.scripts)).map(([k, v]) => [k, String(v)])),
      dependencies: deps, devDependencies: dev,
      testFrameworks: [...deps, ...dev].filter((d) => TEST_TOOLS.has(d)).sort(),
      entryPoints: uniq([data.main, data.module, ...bin].filter((x) => typeof x === 'string')),
      packageManager: String(data.packageManager || ''),
    };
  },
};
