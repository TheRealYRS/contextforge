import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromDir, memEntries, SAMPLE, cfg } from './helpers.mjs';
import { analyze, buildPackage, exportFor } from '../src/core/pipeline.js';
import { flatName, planLayout, resolveLinks } from '../src/core/exporter.js';
import { validateExport } from '../src/core/validation.js';
import { sanitizeRelativePath, isSafeOutputPath, UnsafePathError, safePackageName, normalizeInputPath } from '../src/core/safety.js';

const config = cfg();
const project = await analyze(entriesFromDir(SAMPLE), config);
const preserve = await buildPackage(project, config, 'preserve');
const flat = await exportFor(project, preserve.generation, config, 'flat');

test('Flat Files: no nested directories', () => {
  assert.ok(flat.exportPlan.outputs.every((o) => !o.exportPath.includes('/')));
  assert.deepEqual(flat.exportPlan.outputs.map((o) => o.exportPath).sort(), ['PACKAGE_MANIFEST.json', 'PROJECT_OVERVIEW.md', 'context_DATA_AND_DOCUMENTS.md', 'context_PROJECT_CONTENTS.md', 'maps_PROJECT_MAP.md']);
  assert.ok(flat.validation.ok, JSON.stringify(flat.validation.checks.filter((c) => !c.ok)));
});

test('Preserve Folder Structure: intended directory layout kept', () => {
  const p = Object.fromEntries(preserve.exportPlan.outputs.map((o) => [o.id, o.exportPath]));
  assert.equal(p.contents, 'context/PROJECT_CONTENTS.md'); assert.equal(p.map, 'maps/PROJECT_MAP.md'); assert.equal(p.overview, 'PROJECT_OVERVIEW.md');
  assert.ok(preserve.validation.checks.find((c) => c.name === 'Folder structure preserved').ok);
});

test('both modes carry equivalent logical information and every file is accounted for', () => {
  const ids = (x) => x.exportPlan.outputs.map((o) => o.id).sort();
  assert.deepEqual(ids(flat), ids(preserve));
  for (const x of [flat, preserve]) {
    const listed = x.exportPlan.manifest.export.files.map((f) => f.exportPath).sort();
    assert.deepEqual(listed, x.exportPlan.outputs.map((o) => o.exportPath).sort());
    assert.equal(x.exportPlan.manifest.export.fileCount, x.exportPlan.outputs.length);
  }
  assert.equal(flat.exportPlan.manifest.inputs.length, preserve.exportPlan.manifest.inputs.length);
});

test('download filenames match the manifest; internal links follow the layout', () => {
  for (const x of [flat, preserve]) for (const o of x.exportPlan.outputs) {
    const m = x.exportPlan.manifest.export.files.find((f) => f.id === o.id);
    assert.equal(m.exportName, o.exportName); assert.equal(m.exportPath, o.exportPath);
  }
  assert.match(flat.exportPlan.outputs.find((o) => o.id === 'overview').content, /\]\(context_PROJECT_CONTENTS\.md\)/);
  assert.match(preserve.exportPlan.outputs.find((o) => o.id === 'map').content, /\]\(\.\.\/context\/PROJECT_CONTENTS\.md\)/);
  assert.equal(flat.exportPlan.manifest.inputs.find((i) => i.path === 'src/app.js').outputFile, 'context_PROJECT_CONTENTS.md');
  assert.equal(preserve.exportPlan.manifest.inputs.find((i) => i.path === 'src/app.js').outputFile, 'context/PROJECT_CONTENTS.md');
});

test('original source paths remain available in manifest and content in both modes', () => {
  for (const x of [flat, preserve]) {
    assert.ok(x.exportPlan.manifest.inputs.some((i) => i.path === 'services/go/main.go' && i.sha256));
    assert.ok(x.exportPlan.outputs.find((o) => o.id === 'contents').content.includes('### `services/go/main.go`'));
  }
});

test('filename collisions never cause data loss (flat mode)', () => {
  const taken = new Set();
  const names = ['src/config.json', 'tests/config.json', 'src_config.json', 'src/config.json'].map((p) => flatName(p, taken));
  assert.deepEqual(names, ['src_config.json', 'tests_config.json', 'src_config__2.json', 'src_config__3.json']);
  const files = [{ id: 'a', path: 'a/b.md' }, { id: 'b', path: 'a_b.md' }, { id: 'c', path: 'A/B.md' }];
  const flatMap = planLayout(files, 'flat');
  assert.equal(new Set([...flatMap.values()].map((v) => v.toLowerCase())).size, 3);
  const pres = planLayout(files, 'preserve');
  assert.equal(new Set([...pres.values()].map((v) => v.toLowerCase())).size, 3, 'case-insensitive collisions resolved');
});

test('the layout toggle changes real output and validation catches a broken layout', () => {
  assert.notDeepEqual(flat.exportPlan.outputs.map((o) => o.exportPath), preserve.exportPlan.outputs.map((o) => o.exportPath));
  const broken = { ...flat.exportPlan, outputs: flat.exportPlan.outputs.map((o, i) => (i === 1 ? { ...o, exportPath: `nested/${o.exportPath}` } : o)) };
  const v = validateExport(project, flat.generation, broken);
  assert.equal(v.checks.find((c) => c.name === 'Flat Files layout has no folders').ok, false);
});

test('validation detects tampering: missing manifest entry, bad sizes, duplicate paths, broken markdown', () => {
  const plan = preserve.exportPlan;
  const dup = { ...plan, outputs: plan.outputs.map((o) => (o.id === 'map' ? { ...o, exportPath: plan.outputs[0].exportPath } : o)) };
  assert.equal(validateExport(project, preserve.generation, dup).checks.find((c) => c.name === 'No duplicate output paths').ok, false);
  const badMd = { ...plan, outputs: plan.outputs.map((o) => (o.id === 'map' ? { ...o, content: `${o.content}\n\`\`\`js\nunterminated` } : o)) };
  assert.equal(validateExport(project, preserve.generation, badMd).checks.find((c) => c.name === 'Markdown is structurally valid').ok, false);
  const badSize = { ...plan, outputs: plan.outputs.map((o) => (o.id === 'overview' ? { ...o, content: `${o.content}x` } : o)) };
  assert.equal(validateExport(project, preserve.generation, badSize).checks.find((c) => c.name === 'File sizes and counts are accurate').ok, false);
  const badJson = { ...plan, outputs: plan.outputs.map((o) => (o.id === 'manifest' ? { ...o, content: '{' } : o)) };
  assert.equal(validateExport(project, preserve.generation, badJson).checks.find((c) => c.name === 'Manifest is valid JSON').ok, false);
});

test('no ZIP or other archive is generated in either mode', () => {
  for (const x of [flat, preserve]) {
    assert.ok(x.exportPlan.outputs.every((o) => ['text/markdown', 'application/json'].includes(o.contentType)));
    assert.ok(x.exportPlan.outputs.every((o) => !/\.(zip|tar|gz|7z)$/i.test(o.exportPath)));
  }
});

test('path traversal and unsafe output names are neutralised', () => {
  assert.equal(sanitizeRelativePath('../../etc/passwd'), 'etc/passwd');
  assert.equal(sanitizeRelativePath('C:\\Windows\\cmd.exe'), 'Windows/cmd.exe');
  assert.equal(sanitizeRelativePath('/abs/x.md'), 'abs/x.md');
  assert.equal(sanitizeRelativePath('CON.md'), '_CON.md');
  assert.equal(sanitizeRelativePath('a<b>|c.md'), 'a_b__c.md');
  assert.throws(() => sanitizeRelativePath('../..'), UnsafePathError);
  assert.equal(isSafeOutputPath('../x.md'), false); assert.equal(isSafeOutputPath('context/x.md'), true);
  assert.equal(normalizeInputPath('a/../../b\\c.txt'), 'a/b/c.txt');
  assert.ok(!safePackageName('../../evil').includes('/'));
  const hostile = planLayout([{ id: 'x', path: '../../../etc/evil.md' }], 'preserve');
  assert.equal(hostile.get('x'), 'etc/evil.md');
  assert.equal(planLayout([{ id: 'x', path: '../../../etc/evil.md' }], 'flat').get('x'), 'etc_evil.md');
});

test('hostile input filenames cannot escape through the scanner', async () => {
  const read = async () => new TextEncoder().encode('x = 1');
  const p = await analyze([{ path: '../../outside/../x.py', size: 5, lastModified: 0, read }, { path: 'ok/y.py', size: 5, lastModified: 0, read }], config);
  assert.deepEqual(p.files.map((f) => f.path), ['outside/x.py', 'ok/y.py']);
  const r = await buildPackage(p, config, 'flat');
  assert.ok(r.validation.ok);
});

test('unresolved link tokens are left visible and flagged, not silently dropped', () => {
  const s = resolveLinks('[a]({{link:missing}})', 'X.md', new Map());
  assert.equal(s, '[a]({{link:missing}})');
});

test('manifest records version, identity, hashes, limitations and validation', () => {
  const m = preserve.exportPlan.manifest;
  assert.equal(m.formatVersion, '1.0'); assert.equal(m.generator, 'ContextForge'); assert.equal(m.project.name, 'sample_project');
  assert.ok(m.inputs.find((i) => i.path === 'src/app.js').sha256.match(/^[0-9a-f]{64}$/));
  assert.ok(m.export.files.filter((f) => f.id !== 'manifest').every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  assert.ok(m.extractionLimitations.some((x) => x.path === 'data/recording.qqq'));
  assert.ok(m.validation.ok); assert.ok(m.validation.checks.length >= 13);
});
