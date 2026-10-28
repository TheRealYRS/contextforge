// Minimal, read-only ZIP reader used to open Office Open XML containers (.xlsx/.docx/.pptx).
// It never writes archives. Decompression uses the platform DecompressionStream.
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export class ZipError extends Error {}

export function listEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('not a ZIP container (no end-of-central-directory record)');
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (off + 46 > bytes.length || view.getUint32(off, true) !== 0x02014b50) throw new ZipError('corrupt central directory');
    const method = view.getUint16(off + 10, true);
    const csize = view.getUint32(off + 20, true);
    const usize = view.getUint32(off + 24, true);
    const nlen = view.getUint16(off + 28, true);
    const xlen = view.getUint16(off + 30, true);
    const clen = view.getUint16(off + 32, true);
    const local = view.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nlen));
    entries.set(name, { name, method, csize, usize, local });
    off += 46 + nlen + xlen + clen;
  }
  return entries;
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY_BYTES) { await reader.cancel(); throw new ZipError('entry exceeds safe decompression limit'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

export async function readEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = entry.local;
  if (view.getUint32(o, true) !== 0x04034b50) throw new ZipError(`bad local header for ${entry.name}`);
  const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
  const data = bytes.subarray(start, start + entry.csize);
  if (entry.usize > MAX_ENTRY_BYTES) throw new ZipError('entry exceeds safe decompression limit');
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new ZipError(`unsupported compression method ${entry.method}`);
}

export async function openZip(bytes) {
  const entries = listEntries(bytes);
  const dec = new TextDecoder();
  return {
    names: () => [...entries.keys()],
    has: (n) => entries.has(n),
    async text(n) { const e = entries.get(n); return e ? dec.decode(await readEntry(bytes, e)) : null; },
  };
}

// --- tiny XML helpers (regex-based; Office XML is machine-generated and regular) ---
export function xmlUnescape(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}
export function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? xmlUnescape(m[1]) : null;
}
