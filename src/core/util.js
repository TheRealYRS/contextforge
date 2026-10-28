export function humanSize(n) {
  let v = Number(n) || 0;
  for (const u of ['B', 'KB', 'MB', 'GB']) {
    if (v < 1024 || u === 'GB') return u === 'B' ? `${Math.round(v)} B` : `${v.toFixed(1)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(1)} TB`;
}

export async function sha256Hex(buffer) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const textEncoder = new TextEncoder();
export const byteLength = (s) => textEncoder.encode(s).length;

/** Yield to the event loop so the UI stays responsive during long loops. */
export const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

export class CancelledError extends Error {
  constructor() { super('Operation cancelled'); this.name = 'CancelledError'; }
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') re += glob[i + 1] === '*' ? (i++, '.*') : '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

export function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

export function fence(text) {
  // pick a code fence longer than any backtick run inside the content
  const runs = text.match(/`{3,}/g) || [];
  const max = runs.reduce((m, r) => Math.max(m, r.length), 2);
  return '`'.repeat(max + 1);
}
