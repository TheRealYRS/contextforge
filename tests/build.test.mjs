import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('production build succeeds and is self-contained', () => {
  const out = execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { encoding: 'utf8' });
  assert.match(out, /all imports resolve/);
  const dist = join(root, 'dist');
  for (const f of ['index.html', 'favicon.svg', 'src/main.js', 'src/styles.css', 'src/core/pipeline.js']) assert.ok(existsSync(join(dist, f)), f);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(html, /<title>ContextForge/); assert.match(html, /src="\.\/src\/main\.js"/);
  assert.doesNotMatch(html, /https?:\/\//, 'no remote assets');
});

test('Netlify config publishes dist with a strict no-network CSP', () => {
  const t = readFileSync(join(root, 'netlify.toml'), 'utf8');
  assert.match(t, /command = "npm run build"/); assert.match(t, /publish = "dist"/);
  assert.match(t, /connect-src 'none'/);
  assert.doesNotMatch(t, /\[\[redirects\]\]/, 'no SPA redirect needed');
});

test('no provider branding, no ZIP generation, no network or eval in shipped code', () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
  walk(join(root, 'src'));
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /\bfetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|\beval\(|new Function\(/, f);
    assert.doesNotMatch(s, /(?<!De)CompressionStream\(|JSZip|application\/zip/, `${f} must not create archives`);
    assert.doesNotMatch(s, /Copilot/i, f);
    assert.doesNotMatch(s, /\.innerHTML\s*=/, `${f}: file content must not be rendered as HTML`);
  }
});
