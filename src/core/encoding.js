// Encoding detection and safe decoding (browser + Node, WHATWG TextDecoder).
const BOMS = [
  [[0xef, 0xbb, 0xbf], 'utf-8-bom'],
  [[0xff, 0xfe], 'utf-16le'],
  [[0xfe, 0xff], 'utf-16be'],
];

export function detectBom(bytes) {
  for (const [sig, name] of BOMS) if (sig.every((b, i) => bytes[i] === b)) return name;
  return null;
}

export function looksBinary(bytes) {
  if (!bytes.length || detectBom(bytes)) return false;
  let odd = 0;
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 7 || (b > 13 && b < 32 && b !== 27)) odd++;
  }
  return odd / n > 0.1;
}

/** Return {encoding, binary}. Sample = first bytes of the file. */
export function detectEncoding(sample) {
  if (!sample.length) return { encoding: 'utf-8', binary: false };
  const bom = detectBom(sample);
  if (bom) return { encoding: bom, binary: false };
  if (looksBinary(sample)) return { encoding: '', binary: true };
  try {
    // A sample may cut a multi-byte char at the end; trim up to 3 trailing bytes.
    new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, trimUtf8Tail(sample)));
    return { encoding: 'utf-8', binary: false };
  } catch {
    return { encoding: 'windows-1252', binary: false };
  }
}

function trimUtf8Tail(b) {
  let end = b.length;
  for (let k = 1; k <= 3 && end - k >= 0; k++) {
    const c = b[end - k];
    if ((c & 0xc0) === 0x80) continue;
    if ((c & 0xc0) === 0xc0) return end - k; // lead byte of a possibly incomplete sequence
    break;
  }
  return end;
}

/** Decode bytes with the detected encoding. Never throws. */
export function decode(bytes, encoding) {
  const label = encoding === 'utf-8-bom' ? 'utf-8' : (encoding || 'utf-8');
  try {
    return { text: new TextDecoder(label, { fatal: true }).decode(bytes), lossy: false };
  } catch {
    try { return { text: new TextDecoder('windows-1252').decode(bytes), lossy: label !== 'windows-1252' }; }
    catch { return { text: new TextDecoder('utf-8').decode(bytes), lossy: true }; }
  }
}
