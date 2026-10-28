// Best-effort PDF text extraction without a third-party library.
// Handles uncompressed and FlateDecode content streams and literal/hex string operators.
// Limitations (reported, never hidden): no OCR; encrypted PDFs, CID/Type0 fonts with custom
// encodings and exotic filters may yield little or no text.
const latin1 = new TextDecoder('latin1');

async function run(bytes, format) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** Inflate a FlateDecode stream; tolerate trailing bytes and raw (headerless) deflate. */
async function inflate(bytes) {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--;
  const data = bytes.subarray(0, end);
  for (const [fmt, buf] of [['deflate', bytes], ['deflate', data], ['deflate-raw', data], ['deflate-raw', data.subarray(2)]]) {
    try { return await run(buf, fmt); } catch { /* try next */ }
  }
  throw new Error('inflate failed');
}

function unescapeLiteral(s) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return { n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c] ?? '';
  });
}

function hexToText(h) {
  const clean = h.replace(/\s/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16));
  // two-byte glyph ids usually decode to control chars: drop them rather than emit noise
  return /^[\x09\x0a\x0d\x20-\x7e\xa0-\xff]*$/.test(out) ? out : '';
}

function textFromContent(content) {
  const out = [];
  for (const bt of content.matchAll(/BT([\s\S]*?)ET/g)) {
    const seg = bt[1];
    let line = '';
    for (const m of seg.matchAll(/\[((?:\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|(T\*|Td|TD|Tm)/g)) {
      if (m[4]) { if (line.trim()) out.push(line); line = ''; continue; }
      if (m[2] != null) line += unescapeLiteral(m[2]);
      else if (m[3] != null) line += hexToText(m[3]);
      else if (m[1] != null) {
        for (const part of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]*)>|(-?\d+(?:\.\d+)?)/g)) {
          if (part[1] != null) line += unescapeLiteral(part[1]);
          else if (part[2] != null) line += hexToText(part[2]);
          else if (part[3] && +part[3] < -200) line += ' ';
        }
      }
    }
    if (line.trim()) out.push(line);
  }
  return out.join('\n');
}

export const pdfProcessor = {
  name: 'pdf', priority: 60,
  match: (r) => r.ext === '.pdf',
  async process({ bytes, config }) {
    const raw = latin1.decode(bytes);
    if (!raw.startsWith('%PDF-')) return { kind: 'pdf', error: 'not a PDF (missing %PDF header) or the file is corrupted' };
    const pageCount = (raw.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
    const encrypted = /\/Encrypt\b/.test(raw);
    const title = (raw.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/) || [])[1];
    const texts = [];
    let failedStreams = 0;
    let streams = 0;
    if (!encrypted) {
      const re = /<<((?:(?!>>)[\s\S]){0,800}?)>>\s*stream\r?\n/g;
      let m;
      while ((m = re.exec(raw)) && streams < 2000) {
        const dict = m[1];
        const start = m.index + m[0].length;
        const end = raw.indexOf('endstream', start);
        if (end < 0) break;
        re.lastIndex = end;
        if (/\/Subtype\s*\/Image|\/Type\s*\/(XObject|Metadata|XRef|ObjStm)|\/FontFile/.test(dict)) continue;
        streams++;
        const len = +(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/) || [])[1];
        let data = bytes.subarray(start, Number.isFinite(len) && len > 0 && start + len <= end ? start + len : end);
        try {
          if (/\/FlateDecode/.test(dict)) data = await inflate(data);
          else if (/\/Filter/.test(dict)) { failedStreams++; continue; }
          const t = textFromContent(latin1.decode(data));
          if (t.trim()) texts.push(t);
        } catch (e) { failedStreams++; }
        if (texts.length >= config.pdfMaxPages * 4) break;
      }
    }
    const text = texts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
    const limitations = [];
    if (encrypted) limitations.push('PDF is encrypted — text was not extracted.');
    if (!encrypted && !text) limitations.push('No extractable text layer found. The PDF may be scanned or use font encodings this extractor cannot map. OCR was NOT performed.');
    if (failedStreams) limitations.push(`${failedStreams} content stream(s) used unsupported filters or were malformed and were skipped.`);
    return {
      kind: 'pdf', pageCount, encrypted, title: title ? unescapeLiteral(title).slice(0, 200) : '',
      hasText: !!text, extractedText: text, limitations, extraction: 'best-effort',
    };
  },
};
