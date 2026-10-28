// Production build: copies the static app into dist/ and verifies it.
// No bundler is needed — the app is native ES modules with zero runtime dependencies.
// Verification: every relative import resolves, no remote imports, every module parses.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'index.html'), join(dist, 'index.html'));
cpSync(join(root, 'src'), join(dist, 'src'), { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });

const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(dist);

const errors = [];
const html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) if (!existsSync(join(dist, m[1]))) errors.push(`index.html references missing ${m[1]}`);
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (/^(https?:)?\/\//.test(spec)) errors.push(`${relative(dist, f)} imports a remote module: ${spec}`);
    else if (spec.startsWith('.')) { if (!existsSync(join(dirname(f), spec))) errors.push(`${relative(dist, f)}: unresolved import ${spec}`); }
    else errors.push(`${relative(dist, f)}: bare import '${spec}' cannot load in a browser without a bundler`);
  }
  // named imports must exist as exports in the target module
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const target = join(dirname(f), m[2]);
    if (!existsSync(target)) continue;
    const exported = exportsOf(readFileSync(target, 'utf8'));
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name && !exported.has(name)) errors.push(`${relative(dist, f)}: '${name}' is not exported by ${m[2]}`);
    }
  }
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { errors.push(`${relative(dist, f)}: syntax error\n${e.stderr}`); }
}
function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  return names;
}
if (errors.length) { console.error('Build verification failed:\n' + errors.map((e) => `  ✗ ${e}`).join('\n')); process.exit(1); }

const total = files.reduce((s, f) => s + statSync(f).size, 0);
writeFileSync(join(dist, 'build-info.json'), JSON.stringify({ app: 'ContextForge', builtAt: new Date().toISOString(), files: files.length, bytes: total }, null, 2));
console.log(`✓ dist/ built: ${files.length} files, ${(total / 1024).toFixed(1)} KB, all imports resolve, all modules parse`);
