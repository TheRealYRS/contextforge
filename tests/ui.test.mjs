// Renders every UI page against a minimal DOM shim with a real analysed project.
// This catches runtime errors (undefined references, bad data access) in the UI layer.
// It is not a substitute for testing in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromDir, SAMPLE } from './helpers.mjs';

class Node_ { constructor() { this.children = []; this.attributes = {}; this.listeners = {}; this.style = {}; this.className = ''; this.textContent = ''; }
  get classList() { const s = this; return { add: (c) => { s.className += ` ${c}`; }, remove: () => {}, toggle: () => {} }; }
  append(...n) { this.children.push(...n); } appendChild(n) { this.children.push(n); return n; } replaceChildren(...n) { this.children = n; }
  setAttribute(k, v) { this.attributes[k] = v; } addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } remove() {} click() {}
  get text() { return [this.textContent, ...this.children.map((c) => (c.text ?? c.data ?? ''))].join(' '); }
  find(pred) { if (pred(this)) return this; for (const c of this.children) { const r = c.find?.(pred); if (r) return r; } return null; }
  findAll(pred, acc = []) { if (pred(this)) acc.push(this); for (const c of this.children) c.findAll?.(pred, acc); return acc; }
}
class Text_ { constructor(d) { this.data = d; } }
globalThis.Node = Node_;
const root = new Node_();
globalThis.document = { createElement: (t) => Object.assign(new Node_(), { tagName: t }), createTextNode: (d) => new Text_(d), getElementById: (id) => (id === 'app' ? root : null), body: new Node_() };
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.confirm = () => true;

const { __test } = await import('../src/main.js');
const { analyzeProject } = await import('../src/core/analysis.js');
const { applyStrategy } = await import('../src/core/packager.js');
const { generateContextFiles } = await import('../src/core/generator.js');

test('home renders with branding and both selection actions', () => {
  const t = root.text;
  assert.match(t, /ContextForge/); assert.match(t, /Select Project/); assert.match(t, /Select Files/);
  assert.doesNotMatch(t, /Copilot/);
});

test('every workspace page renders with real data, including filters and previews', async () => {
  const s = __test.state;
  s.entries = entriesFromDir(SAMPLE);
  s.project = await analyzeProject(s.entries, { config: s.config });
  applyStrategy(s.project, 'smart');
  s.view = 'workspace';
  for (const page of ['overview', 'files', 'package', 'output']) { s.page = page; __test.render(); assert.ok(root.children.length === 2, page); }
  s.page = 'files';
  for (const status of ['all', 'included', 'excluded', 'unknown', 'large', 'failed', 'sensitive', 'skipped']) { s.filesUi.status = status; __test.render(); }
  s.filesUi = { q: 'login', cat: '', status: 'all', selected: 'data/scenarios.xlsx', contentSearch: true, page: 0 }; __test.render();
  assert.match(root.text, /tests\/test_login\.mjs/);
  s.filesUi.selected = 'src/app.js'; s.filesUi.contentSearch = false; s.filesUi.q = ''; __test.render();
  assert.match(root.text, /readConfig/);
  s.generation = generateContextFiles(s.project, s.config);
  await __test.runExport('flat', false);
  s.page = 'output'; __test.render();
  assert.match(root.text, /context_PROJECT_CONTENTS\.md/); assert.match(root.text, /Flat Files/);
  await __test.runExport('preserve', false); __test.render();
  assert.match(root.text, /context\//);
  s.previewOutput = s.exportResult.exportPlan.outputs[0]; __test.render();
  assert.match(root.text, /PROJECT OVERVIEW/);
});
