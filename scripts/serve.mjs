// Minimal static server for local development and previewing dist/. Serves files only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const useDist = process.argv.includes('--dist');
const bases = useDist ? [join(root, 'dist')] : [root, join(root, 'public')];
const port = Number(process.env.PORT) || (useDist ? 4174 : 5173);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown' };

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
  for (const base of bases) {
    const file = join(base, rel);
    if (!file.startsWith(base)) break;
    try {
      if ((await stat(file)).isFile()) {
        res.writeHead(200, { 'Content-Type': `${TYPES[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
        return res.end(await readFile(file));
      }
    } catch { /* try next base */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
}).listen(port, () => console.log(`ContextForge ${useDist ? '(dist preview)' : '(dev)'} → http://localhost:${port}`));
