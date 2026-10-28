// Output-path safety. Generated filenames must never escape the output folder,
// and must be valid on Windows, macOS and Linux.
const ILLEGAL = /[<>:"|?*\x00-\x1f]/g;
const RESERVED = new Set(['con', 'prn', 'aux', 'nul', ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`)]);

export class UnsafePathError extends Error {}

export function sanitizeComponent(part) {
  let p = String(part).replace(ILLEGAL, '_').trim().replace(/[. ]+$/, '');
  if (!p || p === '.' || p === '..') return '';
  if (RESERVED.has(p.split('.')[0].toLowerCase())) p = `_${p}`;
  return p.slice(0, 150);
}

/** Normalise any relative path into a safe, contained POSIX path. */
export function sanitizeRelativePath(raw) {
  if (raw == null) throw new UnsafePathError('empty path');
  const text = String(raw).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/^\/+/, '');
  const parts = [];
  for (const seg of text.split('/')) {
    if (!seg || seg === '.' || seg === '..') continue;
    const s = sanitizeComponent(seg);
    if (s) parts.push(s);
  }
  if (!parts.length) throw new UnsafePathError(`path resolves to nothing safe: ${raw}`);
  return parts.join('/');
}

export function isSafeOutputPath(p) {
  try { return sanitizeRelativePath(p) === p; } catch { return false; }
}

export function safePackageName(name) {
  return sanitizeComponent(String(name || '').replace(/[\\/]/g, '_')) || 'project';
}

/** Normalise an input path coming from the browser (webkitRelativePath, handle walk). */
export function normalizeInputPath(p) {
  return String(p).replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
}
