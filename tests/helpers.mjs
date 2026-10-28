// Node adapter mirroring the browser's <input webkitdirectory>: every file, with the
// chosen folder name as the first path segment. Read-only.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConfig } from '../src/core/config.js';

export const SAMPLE = fileURLToPath(new URL('../sample_project', import.meta.url));

export function entriesFromDir(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name); const r = `${rel}/${name}`;
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs, r);
      else out.push({ path: r, size: st.size, lastModified: st.mtimeMs, read: async () => new Uint8Array(readFileSync(abs)) });
    }
  };
  walk(root, basename(root));
  return out;
}

/** In-memory entries from a {path: string|Uint8Array} map. */
export function memEntries(files, root = 'proj') {
  return Object.entries(files).map(([p, c]) => {
    const bytes = typeof c === 'string' ? new TextEncoder().encode(c) : c;
    return { path: `${root}/${p}`, size: bytes.length, lastModified: 0, read: async () => bytes };
  });
}

export const cfg = (o = {}) => makeConfig(o);
