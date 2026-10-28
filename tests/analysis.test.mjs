import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromDir, memEntries, SAMPLE, cfg } from './helpers.mjs';
import { analyze } from '../src/core/pipeline.js';
import { registerProcessor, findProcessor } from '../src/core/processors/index.js';

const p = await analyze(entriesFromDir(SAMPLE), cfg());
const a = (path) => p.byPath.get(path).analysis;
const edge = (s, t, kind) => p.relationships.find((e) => e.source === s && e.target === t && (!kind || e.kind === kind));

test('MJS imports/exports and module kind', () => {
  const u = a('src/utils.mjs');
  assert.equal(u.moduleKind, 'ES Module (.mjs)');
  assert.deepEqual(u.imports.sort(), ['./constants.mjs', 'fs']);
  assert.ok(u.exports.includes('readConfig') && u.exports.includes('normalizeData'));
});

test('JS ESM + CommonJS require/module.exports', () => {
  assert.ok(a('src/app.js').imports.includes('./api.js'));
  assert.ok(a('src/app.js').exports.includes('default'));
  const api = a('src/api.js');
  assert.equal(api.moduleKind, 'CommonJS');
  assert.ok(api.requires.includes('./constants.mjs') && api.exports.includes('module.exports'));
});

test('JS/MJS/TS relationships resolve with Direct confidence', () => {
  assert.equal(edge('src/app.js', 'src/utils.mjs').confidence, 'Direct');
  assert.ok(edge('src/utils.mjs', 'src/constants.mjs'));
  assert.ok(edge('src/api.js', 'src/constants.mjs', 'require'));
  assert.ok(edge('tests/test_login.mjs', 'src/app.js'));
  assert.ok(edge('src/types.ts', 'src/scenario.ts'), 'extensionless TS import resolves');
  const fs = p.relationships.find((e) => e.source === 'src/utils.mjs' && e.specifier === 'fs');
  assert.equal(fs.external, true); assert.equal(fs.resolved, false);
});

test('unresolvable references are Unknown, never invented', async () => {
  const q = await analyze(memEntries({ 'a.mjs': 'import x from "./nowhere.mjs";\nimport y from "express";' }), cfg());
  const e = q.relationships.find((r) => r.specifier === './nowhere.mjs');
  assert.equal(e.resolved, false); assert.equal(e.confidence, 'Unknown');
  assert.equal(q.relationships.find((r) => r.specifier === 'express').external, true);
});

test('Python imports, classes, functions, entry point', () => {
  const py = a('src/parser.py');
  assert.ok(py.imports.includes('csv') && py.imports.includes('json'));
  assert.ok(py.relativeImports.includes('.loader'));
  assert.ok(py.classes.some((c) => c.name === 'ScenarioParser'));
  assert.ok(py.functions.some((f) => f.name === 'main'));
  assert.equal(py.hasMainGuard, true);
  assert.equal(edge('src/parser.py', 'src/loader.py').confidence, 'Direct');
  assert.ok(edge('tests/test_data.py', 'src/parser.py'), 'from src.parser import ...');
  assert.ok(p.byPath.get('src/parser.py').entryPoint);
  assert.deepEqual(a('requirements.txt').packages, ['pandas', 'openpyxl', 'pytest']);
  assert.ok(a('tests/test_data.py').testFrameworks.includes('pytest'));
});

test('SQL tables, views, statements, joins, migrations, cross-file tables', () => {
  const q = a('src/queries.sql');
  assert.deepEqual(q.views, ['active_users']);
  assert.ok(q.tablesReferenced.includes('users') && q.tablesReferenced.includes('sessions'));
  assert.equal(q.statementCounts.INSERT, 1); assert.equal(q.statementCounts.UPDATE, 1); assert.equal(q.statementCounts.DELETE, 1);
  assert.deepEqual(q.joins.map((j) => j.type).sort(), ['INNER JOIN', 'LEFT JOIN']);
  const m = a('db/migrations/001_create_users.sql');
  assert.deepEqual(m.tablesCreated, ['sessions', 'users']);
  assert.equal(m.isMigration, true);
  assert.ok(edge('src/queries.sql', 'db/migrations/001_create_users.sql', 'uses-table'), 'query uses tables created in migration');
});

test('SQL comments are ignored', async () => {
  const q = await analyze(memEntries({ 'c.sql': '-- CREATE TABLE ghost (id INT);\n/* FROM phantom */\nSELECT 1;' }), cfg());
  assert.deepEqual(q.byPath.get('c.sql').analysis.tablesCreated, []);
});

test('HTML and CSS references', () => {
  const html = a('index.html');
  assert.deepEqual(html.scripts, ['src/app.js']); assert.deepEqual(html.stylesheets, ['styles.css']); assert.equal(html.title, 'Sample Test Framework');
  assert.ok(edge('index.html', 'src/app.js', 'script')); assert.ok(edge('index.html', 'styles.css', 'stylesheet'));
  assert.ok(edge('styles.css', 'theme.css', 'import')); assert.ok(edge('styles.css', 'assets/logo.png', 'asset'));
});

test('configuration analysis', () => {
  assert.deepEqual(a('config/config.json').topLevelKeys, ['apiBase', 'retries', 'dataFile', 'features']);
  assert.ok(edge('config/config.json', 'data/data.csv'));
  assert.ok(a('config/settings.yaml').topLevelKeys.includes('database'));
  const pkg = a('package.json');
  assert.equal(pkg.packageName, 'sample-test-framework'); assert.deepEqual(pkg.entryPoints, ['src/app.js']); assert.deepEqual(pkg.testFrameworks, ['jest']);
});

test('other languages: generic static analysis', () => {
  assert.ok(a('services/java/UserService.java').imports.includes('java.util.List'));
  assert.ok(a('services/java/UserService.java').types.includes('UserService'));
  assert.ok(a('services/go/main.go').imports.includes('net/http'));
});

test('spreadsheet: sheets, dimensions, headers, sample rows, formulas, named ranges', () => {
  const x = a('data/scenarios.xlsx');
  assert.equal(x.sheetCount, 2);
  assert.deepEqual(x.sheets.map((s) => s.name), ['Scenarios', 'Summary']);
  assert.deepEqual(x.sheets[0].headers, ['ID', 'Scenario', 'Expected', 'Priority']);
  assert.equal(x.sheets[0].rows, 4); assert.equal(x.sheets[0].sampleRows.length, 3);
  assert.equal(x.totalFormulas, 1);
  assert.ok(x.sheets[1].sampleFormulas[0].includes('COUNTA'));
  assert.ok(x.definedNames.some((d) => d.name === 'ScenarioIds'));
});

test('CSV: headers, inferred types, row count, samples', () => {
  const c = a('data/data.csv');
  assert.deepEqual(c.columns.map((x) => x.name), ['id', 'scenario', 'expected', 'priority']);
  assert.equal(c.columns[0].type, 'integer'); assert.equal(c.rowCount, 4); assert.equal(c.sampleRows.length, 4);
});

test('PDF, Word and PowerPoint extraction', () => {
  assert.match(a('docs/requirements.pdf').extractedText, /password reset/);
  const d = a('docs/test_plan.docx');
  assert.deepEqual(d.headings.map((x) => x.text), ['Test Plan', 'Approach']);
  assert.equal(d.tableCount, 1); assert.match(d.extractedText, /\| Area \| Owner \|/);
  const s = a('docs/overview.pptx');
  assert.equal(s.slideCount, 1); assert.match(s.extractedText, /Release Overview/); assert.match(s.extractedText, /timeline risk/);
});

test('PDF without a text layer reports the OCR limitation honestly', async () => {
  const q = await analyze(memEntries({ 'scan.pdf': '%PDF-1.4\n1 0 obj<</Type/Page>>endobj\n%%EOF' }), cfg());
  const r = q.byPath.get('scan.pdf');
  assert.equal(r.status, 'partial'); assert.match(r.analysis.limitations[0], /OCR was NOT performed/);
});

test('notebook, JSONL, image metadata', () => {
  assert.ok(a('notebooks/analysis.ipynb').imports.includes('pandas'));
  assert.equal(a('data/events.jsonl').recordCount, 2);
  assert.deepEqual([a('assets/logo.png').width, a('assets/logo.png').height], [24, 16]);
});

test('test framework detection requires evidence', () => {
  assert.deepEqual(a('tests/test_login.mjs').testFrameworks, ['node:test']);
  assert.ok(!a('src/app.js').testFrameworks.length);
});

test('processor registry is extensible', async () => {
  registerProcessor({ name: 'proprietary-test', priority: 99, match: (r) => r.ext === '.qtest', process: ({ text }) => ({ kind: 'qtest', steps: text.split('\n').length }) });
  const q = await analyze(memEntries({ 'case.qtest': 'step 1\nstep 2' }), cfg());
  assert.equal(q.byPath.get('case.qtest').analysis.kind, 'qtest');
  assert.equal(findProcessor({ ext: '.qtest', name: 'x.qtest', category: 'Unknown' }).name, 'proprietary-test');
});

test('project code is never executed', async () => {
  globalThis.__cf_pwned = false;
  await analyze(memEntries({ 'evil.mjs': 'globalThis.__cf_pwned = true; export {}', 'evil.js': 'globalThis.__cf_pwned = true', 'evil.py': '__import__("os").system("touch /tmp/cf_pwned")', 'x.sql': 'DROP TABLE users;' }), cfg());
  assert.equal(globalThis.__cf_pwned, false);
});
