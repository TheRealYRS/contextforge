import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromDir, memEntries, SAMPLE, cfg } from './helpers.mjs';
import { analyzeProject, prepareEntries, verifyOriginals } from '../src/core/analysis.js';
import { classify, extensionOf, isTestPath, CAT } from '../src/core/registry.js';
import { detectEncoding, decode } from '../src/core/encoding.js';
import { GitIgnore } from '../src/core/gitignore.js';
import { analyze } from '../src/core/pipeline.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sample = await analyze(entriesFromDir(SAMPLE), cfg());
const get = (p) => sample.byPath.get(p);

test('recursive scan preserves relative paths and strips the selected root folder', () => {
  for (const p of ['src/app.js', 'src/utils.mjs', 'db/migrations/001_create_users.sql', 'services/java/UserService.java', 'tests/test_login.mjs', 'docs/test_plan.docx', 'data/scenarios.xlsx'])
    assert.ok(get(p), `missing ${p}`);
  assert.equal(sample.name, 'sample_project');
  assert.ok(sample.files.every((r) => !r.path.startsWith('sample_project/') && !r.path.includes('\\')));
});

test('classification covers languages and categories', () => {
  const cases = { 'src/app.js': ['JavaScript', CAT.SOURCE], 'src/utils.mjs': ['JavaScript ES Module', CAT.SOURCE], 'src/types.ts': ['TypeScript', CAT.SOURCE], 'src/parser.py': ['Python', CAT.SOURCE],
    'services/java/UserService.java': ['Java', CAT.SOURCE], 'services/go/main.go': ['Go', CAT.SOURCE], 'tools.ps1': ['PowerShell', CAT.SOURCE], 'config/settings.yaml': ['YAML', CAT.CONFIG],
    'package.json': ['JSON', CAT.DEPENDENCY], 'data/data.csv': ['CSV', CAT.DATA], 'data/scenarios.xlsx': ['Excel Workbook', CAT.SPREADSHEET], 'docs/test_plan.docx': ['Word Document', CAT.OFFICE],
    'docs/overview.pptx': ['PowerPoint', CAT.OFFICE], 'docs/requirements.pdf': ['PDF', CAT.PDF], 'assets/logo.png': ['PNG Image', CAT.IMAGE], 'tests/test_data.py': ['Python', CAT.TEST], 'tests/login.feature': ['Gherkin', CAT.TEST] };
  for (const [p, [lang, cat]] of Object.entries(cases)) { assert.equal(get(p).language, lang, p); assert.equal(get(p).category, cat, p); }
  for (const ext of ['.cjs', '.jsx', '.tsx', '.cs', '.c', '.cpp', '.rs', '.php', '.rb', '.kt', '.swift', '.dart', '.sh', '.scss', '.sass', '.less', '.toml', '.ini', '.cfg', '.config', '.properties', '.jsonl', '.tsv', '.xls', '.xlsm', '.doc', '.ppt', '.svg', '.webp', '.tiff', '.rst'])
    assert.equal(classify(`x/file${ext}`).unknown, false, ext);
});

test('extension parsing handles dotfiles and multi-dot names', () => {
  assert.equal(extensionOf('app.test.mjs'), '.mjs');
  assert.equal(extensionOf('.gitignore'), '');
  assert.equal(extensionOf('Makefile'), '');
  assert.ok(isTestPath('src/login.spec.ts')[0]);
  assert.ok(!isTestPath('src/latest.py')[0]);
});

test('unknown extensions are reported, not discarded', () => {
  const text = get('data/custom.xyz');
  assert.equal(text.unknown, true); assert.equal(text.binary, false); assert.equal(text.included, true);
  const bin = get('data/recording.qqq');
  assert.equal(bin.unknown, true); assert.equal(bin.binary, true); assert.equal(bin.included, false);
  assert.match(bin.reason, /unknown binary/);
});

test('exclusion rules: dependency/build/cache folders are skipped without reading', () => {
  for (const p of ['node_modules/left-pad/index.js', 'build/bundle.js', '__pycache__/parser.cpython-312.pyc']) {
    assert.equal(get(p).status, 'skipped', p); assert.equal(get(p).sha256, '', `${p} must not be read`);
  }
  assert.match(get('app.log').reason, /\*\.log/);
  assert.ok(sample.skippedDirs.some((d) => d.dir === 'node_modules'));
});

test('.gitignore is used as a signal', () => {
  const gi = GitIgnore.fromText('build/\n*.log\n!keep.log\n/root-only.txt\nsecret/**\n');
  assert.equal(gi.match('build/out.js'), true);
  assert.equal(gi.match('a/b.log'), true);
  assert.equal(gi.match('keep.log'), false);
  assert.equal(gi.match('root-only.txt'), true);
  assert.equal(gi.match('nested/root-only.txt'), false);
  assert.equal(gi.match('secret/x/y.txt'), true);
  assert.equal(gi.match('src/app.js'), false);
});

test('gitignored file is excluded by rule but still listed', async () => {
  const p = await analyze(memEntries({ '.gitignore': 'private/\n', 'private/notes.md': '# hi', 'a.py': 'x=1' }), cfg());
  assert.equal(p.byPath.get('private/notes.md').included, false);
  assert.match(p.byPath.get('private/notes.md').reason, /gitignore/);
});

test('encoding: UTF-8, BOM, UTF-16 and Windows-1252 decode losslessly', () => {
  assert.equal(detectEncoding(new TextEncoder().encode('plain')).encoding, 'utf-8');
  assert.equal(detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x68])).encoding, 'utf-8-bom');
  const u16 = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]);
  assert.equal(detectEncoding(u16).encoding, 'utf-16le');
  assert.equal(decode(u16.subarray(2), 'utf-16le').text, 'hé');
  const legacy = get('docs/legacy_notes.txt');
  assert.equal(legacy.encoding, 'windows-1252');
  assert.match(legacy.text, /Café notes – naïve/);
  assert.equal(detectEncoding(new Uint8Array([0, 1, 2, 3, 0])).binary, true);
});

test('duplicates are detected; the canonical copy is kept, original is untouched', () => {
  assert.equal(get('backup/config.json').duplicateOf, 'config/config.json');
  assert.equal(get('backup/config.json').included, false);
  assert.equal(get('config/config.json').included, true);
  assert.equal(get('backup/config.json').sha256, get('config/config.json').sha256);
});

test('large files become metadata-only and are not processed', async () => {
  const big = 'x'.repeat(3 * 1024 * 1024);
  const p = await analyze(memEntries({ 'big.py': big, 'small.py': 'y = 1' }), cfg({ maxFileSizeMB: 1 }));
  const r = p.byPath.get('big.py');
  assert.equal(r.large, true); assert.equal(r.status, 'metadata-only'); assert.equal(r.text, null); assert.equal(r.included, false);
  assert.ok(r.sha256, 'still hashed for the manifest');
  const huge = await analyze(memEntries({ 'huge.bin': new Uint8Array(3 * 1024 * 1024) }), cfg({ hashMaxMB: 1 }));
  assert.equal(huge.byPath.get('huge.bin').sha256, '', 'above read limit: not read at all');
});

test('unreadable and malformed files never abort the scan', async () => {
  const entries = [...memEntries({ 'ok.py': 'x = 1', 'bad.json': '{"a": ', 'bad.xlsx': 'PK not a zip', 'bad.pdf': '%PDF-1.4 junk', 'bad.docx': 'nope' }),
    { path: 'proj/locked.txt', size: 10, lastModified: 0, read: async () => { throw Object.assign(new Error('denied'), { name: 'NotReadableError' }); } }];
  const p = await analyze(entries, cfg());
  assert.equal(p.files.length, 6);
  assert.equal(p.byPath.get('ok.py').status, 'ok');
  assert.equal(p.byPath.get('locked.txt').status, 'failed');
  assert.equal(p.byPath.get('bad.json').status, 'failed');
  assert.equal(p.byPath.get('bad.xlsx').status, 'failed');
  assert.equal(p.byPath.get('bad.docx').status, 'failed');
  assert.ok(p.issues.length >= 4);
});

test('cancellation stops analysis', async () => {
  const signal = { cancelled: true };
  await assert.rejects(analyzeProject(memEntries({ 'a.py': 'x' }), { config: cfg(), signal }), /cancelled/i);
});

test('duplicate input paths are disambiguated, never dropped', () => {
  const { entries } = prepareEntries([{ path: 'a.txt', read: async () => new Uint8Array() }, { path: 'a.txt', read: async () => new Uint8Array() }]);
  assert.deepEqual(entries.map((e) => e.path), ['a.txt', 'a (2).txt']);
});

test('originals verified unchanged by re-reading and re-hashing', async () => {
  const entries = entriesFromDir(SAMPLE);
  const res = await verifyOriginals(sample, entries, sample.files.filter((r) => r.included).map((r) => r.path));
  assert.ok(res.checked > 20); assert.deepEqual(res.changed, []);
  const before = readFileSync(join(SAMPLE, 'src/app.js'));
  assert.deepEqual(readFileSync(join(SAMPLE, 'src/app.js')), before);
});
