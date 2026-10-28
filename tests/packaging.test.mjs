import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromDir, memEntries, SAMPLE, cfg } from './helpers.mjs';
import { analyze, buildPackage, exportFor } from '../src/core/pipeline.js';
import { applyStrategy, planContent } from '../src/core/packager.js';
import { generateContextFiles } from '../src/core/generator.js';
import { findSecrets, redact, isSensitiveFile } from '../src/core/secrets.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = cfg();
const project = await analyze(entriesFromDir(SAMPLE), config);
const { generation, exportPlan, validation } = await buildPackage(project, config, 'preserve');
const out = (id) => exportPlan.outputs.find((o) => o.id === id);

test('generates a small, adaptive set of context files — not a project copy', () => {
  assert.deepEqual(exportPlan.outputs.map((o) => o.exportPath).sort(), ['PACKAGE_MANIFEST.json', 'PROJECT_OVERVIEW.md', 'context/DATA_AND_DOCUMENTS.md', 'context/PROJECT_CONTENTS.md', 'maps/PROJECT_MAP.md']);
  assert.ok(exportPlan.outputs.length < project.files.length / 5);
  assert.ok(!exportPlan.outputs.some((o) => /\.(js|py|zip)$/.test(o.exportPath)), 'no source files or archives emitted');
});

test('small project: map merged into overview, no data file', async () => {
  const p = await analyze(memEntries({ 'main.py': 'print(1)\n', 'README.md': '# Tiny\n\nA tiny tool.\n' }), config);
  const r = await buildPackage(p, config, 'preserve');
  assert.deepEqual(r.exportPlan.outputs.map((o) => o.logicalName).sort(), ['PACKAGE_MANIFEST.json', 'PROJECT_CONTENTS.md', 'PROJECT_OVERVIEW.md']);
  assert.match(r.exportPlan.outputs.find((o) => o.id === 'overview').content, /## Project map/);
  assert.ok(r.validation.ok, JSON.stringify(r.validation.checks.filter((c) => !c.ok)));
});

test('source content is preserved verbatim with original paths', () => {
  const c = out('contents').content;
  for (const path of ['src/utils.mjs', 'src/parser.py', 'src/queries.sql', 'services/java/UserService.java']) {
    const original = readFileSync(join(SAMPLE, path), 'utf8').replace(/\n$/, '');
    assert.ok(c.includes(`### \`${path}\``), `heading for ${path}`);
    assert.ok(c.includes(original), `verbatim content for ${path}`);
  }
  assert.match(c, /```javascript\n\/\/ Utility module used by the application\./);
});

test('overview: identity, detected type, entry points, deps, config, tests, limitations', () => {
  const o = out('overview').content;
  for (const s of ['# sample_project — PROJECT OVERVIEW', 'Detected project type', 'Entry points', 'Dependencies', 'Configuration', 'Testing', 'Known limitations', 'Not included'])
    assert.ok(o.includes(s), s);
  assert.match(o, /_\(detected from source\)_/); assert.match(o, /_\(inferred from project structure\)_/);
  assert.match(o, /`src\/app\.js`/); assert.match(o, /dotenv, jest \(dev\)/);
  assert.doesNotMatch(o, /Copilot/);
});

test('map: relationships, test→source links, SQL objects, references to contents', () => {
  const m = out('map').content;
  assert.match(m, /### Relationships/); assert.match(m, /### Tests → code they reference/); assert.match(m, /### SQL objects/);
  assert.match(m, /\[`src\/utils\.mjs`\]\(\.\.\/context\/PROJECT_CONTENTS\.md\)/);
});

test('data and documents: schemas and samples, not dumps', () => {
  const d = out('data').content;
  assert.match(d, /#### Sheet: Scenarios/); assert.match(d, /\| ID \| Scenario \| Expected \| Priority \|/);
  assert.match(d, /COUNTA/); assert.match(d, /\| id \| integer \|/);
  assert.match(d, /password reset/); assert.match(d, /Release Overview/); assert.match(d, /Test Plan/);
});

test('secrets: detected, redacted in output, sensitive files excluded by default', () => {
  assert.equal(project.byPath.get('.env').included, false);
  assert.match(project.byPath.get('.env').reason, /sensitive/);
  assert.equal(project.byPath.get('.env.example').included, true, 'templates are not treated as sensitive');
  const all = exportPlan.outputs.map((o) => o.content).join('\n');
  assert.ok(!all.includes('Sup3rS3cretValue!'), 'secret value must not appear');
  assert.ok(!all.includes('hunter2hunter2'));
  assert.match(out('contents').content, /\[REDACTED: Credential assignment\]/);
  assert.match(out('overview').content, /redacted/i);
  const m = exportPlan.manifest.inputs.find((i) => i.path === 'config/settings.yaml');
  assert.equal(m.secretsRedacted, 1);
  assert.ok(isSensitiveFile('keys/id_rsa') && isSensitiveFile('.env.production') && !isSensitiveFile('.env.example'));
  const t = 'aws = "AKIAABCDEFGHIJKLMNOP"\npassword: ${DB_PASS}\n-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----';
  const f = findSecrets(t);
  assert.deepEqual(f.map((x) => x.type).sort(), ['AWS access key ID', 'Private key']);
  assert.ok(!redact(t, f).text.includes('AKIAABCDEFGHIJKLMNOP'));
});

test('secrets can be included when the user opts out of redaction', async () => {
  const c2 = cfg({ redactSecrets: false });
  const r = await buildPackage(await analyze(entriesFromDir(SAMPLE), c2), c2, 'preserve');
  assert.ok(r.exportPlan.outputs.find((o) => o.id === 'contents').content.includes('Sup3rS3cretValue!'));
});

test('strategies change actual package contents', async () => {
  const sizes = {};
  const paths = {};
  for (const s of ['minimal', 'smart', 'complete']) {
    const c = cfg({ strategy: s });
    const p = await analyze(entriesFromDir(SAMPLE), c);
    const r = await buildPackage(p, c, 'preserve');
    assert.ok(r.validation.ok, s);
    sizes[s] = r.exportPlan.totalBytes;
    paths[s] = new Set(p.files.filter((f) => f.included).map((f) => f.path));
  }
  assert.ok(paths.minimal.size < paths.smart.size, 'minimal is smaller');
  assert.ok(!paths.minimal.has('docs/legacy_notes.txt') && paths.smart.has('docs/legacy_notes.txt'));
  assert.ok(paths.minimal.has('src/app.js') && paths.minimal.has('package.json'));
  assert.ok(sizes.minimal < sizes.smart);
  // complete includes full small datasets, smart summarises them
  const c = cfg({ strategy: 'complete' });
  const pc = await analyze(entriesFromDir(SAMPLE), c);
  const rc = await buildPackage(pc, c);
  assert.match(rc.exportPlan.outputs.find((o) => o.id === 'data').content, /4,Session timeout,redirect,Low/);
  assert.doesNotMatch(out('data').content, /4,Session timeout,redirect,Low/);
});

test('user overrides beat the strategy', async () => {
  const p = await analyze(entriesFromDir(SAMPLE), cfg({ strategy: 'minimal' }));
  p.byPath.get('docs/legacy_notes.txt').override = true;
  p.byPath.get('src/app.js').override = false;
  applyStrategy(p, 'minimal');
  assert.equal(p.byPath.get('docs/legacy_notes.txt').included, true);
  assert.equal(p.byPath.get('src/app.js').included, false);
  assert.equal(p.byPath.get('src/app.js').reason, 'excluded by you');
});

test('budget: truncation and omission are explicit, priorities respected', async () => {
  const files = { 'main.py': 'def main():\n    pass\n', 'big.py': Array.from({ length: 6000 }, (_, i) => `x${i} = ${i}`).join('\n'), 'docs/guide.md': '# Guide\n' + 'word '.repeat(30000) };
  const c = cfg({ maxOutputMB: 0.05 });
  const p = await analyze(memEntries(files), c);
  const r = await buildPackage(p, c);
  const plan = planContent(p, c).plan;
  assert.equal(plan.find((x) => x.record.path === 'main.py').mode, 'full', 'entry point first');
  assert.equal(plan.find((x) => x.record.path === 'big.py').mode, 'truncated');
  assert.equal(plan.find((x) => x.record.path === 'docs/guide.md').mode, 'omitted');
  const contents = r.exportPlan.outputs.find((o) => o.id === 'contents').content;
  assert.match(contents, /TRUNCATED\*\* — showing lines 1–\d+ of 6000/);
  const ov = r.exportPlan.outputs.find((o) => o.id === 'overview').content;
  assert.match(ov, /\*\*Truncated\*\*.*big\.py/); assert.match(ov, /\*\*Omitted\*\*.*docs\/guide\.md/);
  assert.deepEqual(r.exportPlan.manifest.omittedForBudget, ['docs/guide.md']);
  assert.equal(r.exportPlan.manifest.truncation[0].path, 'big.py');
  assert.ok(r.validation.ok);
});

test('contents file splits into parts above the configured size, links intact', async () => {
  const files = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`src/m${i}.py`, `# module ${i}\n` + 'v = 1\n'.repeat(4000)]));
  const c = cfg({ maxContentsFileMB: 0.05 });
  const r = await buildPackage(await analyze(memEntries(files), c), c, 'preserve');
  const parts = r.exportPlan.outputs.filter((o) => o.id.startsWith('contents'));
  assert.ok(parts.length > 1);
  assert.ok(r.validation.ok, JSON.stringify(r.validation.checks.filter((x) => !x.ok)));
});

test('duplicate content is not repeated', () => {
  const c = out('contents').content;
  assert.equal(c.split('"apiBase": "https://api.example.com"').length - 1, 1);
  assert.match(c, /Identical content also exists at: `backup\/config\.json`/);
});

test('code fences survive files that contain backticks', async () => {
  const p = await analyze(memEntries({ 'README.md': '# Doc\n\n```js\nconst a = 1;\n```\n\n````\nnested\n````\n' }), config);
  const r = await buildPackage(p, config);
  assert.ok(r.validation.ok, JSON.stringify(r.validation.checks.filter((x) => !x.ok)));
});

test('re-exporting changes layout without regenerating content', async () => {
  const flat = await exportFor(project, generation, config, 'flat');
  const strip = (s) => s.replace(/\]\([^)]*\)/g, ']()');
  for (const o of exportPlan.outputs.filter((x) => x.id !== 'manifest')) {
    const f = flat.exportPlan.outputs.find((x) => x.id === o.id);
    assert.equal(strip(f.content), strip(o.content), `${o.id} content identical apart from link targets`);
  }
});

test('production validation passes on the sample', () => {
  assert.ok(validation.ok, JSON.stringify(validation.checks.filter((c) => !c.ok), null, 2));
  assert.ok(validation.checks.length >= 13);
});
