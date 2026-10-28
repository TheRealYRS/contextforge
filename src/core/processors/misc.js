// Markdown/text, notebooks, images, generic source, and the unknown-format fallback.
import { detectFrameworks } from '../registry.js';
import { uniq } from '../util.js';

export const markdownProcessor = {
  name: 'markdown', priority: 50,
  match: (r) => ['.md', '.markdown', '.mdx', '.rst', '.txt', '.adoc', '.rtf'].includes(r.ext) || ['readme', 'license', 'changelog'].includes(r.name.toLowerCase()),
  process({ text }) {
    const headings = [...text.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim().slice(0, 160) }));
    const links = uniq([...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((l) => !/^(https?:|#|mailto:)/.test(l)));
    const firstParagraph = (text.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('```') && !p.startsWith('![')) || '').slice(0, 500);
    return { kind: 'document', headings: headings.slice(0, 80), localLinks: links.slice(0, 40), firstParagraph, wordCount: (text.match(/\S+/g) || []).length };
  },
};

export const notebookProcessor = {
  name: 'notebook', priority: 70,
  match: (r) => r.ext === '.ipynb',
  process({ text }) {
    let nb;
    try { nb = JSON.parse(text); } catch (e) { return { kind: 'notebook', error: 'invalid notebook JSON' }; }
    const cells = Array.isArray(nb.cells) ? nb.cells : [];
    const src = (c) => (Array.isArray(c.source) ? c.source.join('') : String(c.source || ''));
    const code = cells.filter((c) => c.cell_type === 'code').map(src);
    const md = cells.filter((c) => c.cell_type === 'markdown').map(src);
    const extractedText = cells.map((c) => (c.cell_type === 'code' ? `\`\`\`python\n${src(c)}\n\`\`\`` : src(c))).join('\n\n');
    const imports = uniq(code.join('\n').match(/^\s*(?:import|from)\s+[\w.]+/gm)?.map((l) => l.trim().split(/\s+/)[1]) || []);
    return { kind: 'notebook', codeCells: code.length, markdownCells: md.length, imports, extractedText, note: 'Cell outputs are not included.' };
  },
};

function imageDims(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (b[0] === 0x89 && b[1] === 0x50 && b.length >= 24) return [dv.getUint32(16), dv.getUint32(20)];
    if (b[0] === 0x47 && b[1] === 0x49 && b.length >= 10) return [dv.getUint16(6, true), dv.getUint16(8, true)];
    if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) return [dv.getInt32(18, true), Math.abs(dv.getInt32(22, true))];
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) break;
        const marker = b[o + 1];
        if (marker >= 0xc0 && marker <= 0xc3) return [dv.getUint16(o + 7), dv.getUint16(o + 5)];
        o += 2 + dv.getUint16(o + 2);
      }
    }
    if (b.length > 30 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
      const chunk = String.fromCharCode(...b.subarray(12, 16));
      if (chunk === 'VP8X') return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
    }
  } catch { /* fall through */ }
  return [0, 0];
}

export const imageProcessor = {
  name: 'image', priority: 60,
  match: (r) => ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.ico', '.svg'].includes(r.ext),
  process({ record, bytes, text }) {
    if (record.ext === '.svg') {
      const g = (re) => (text.match(re) || [])[1] || '';
      return { kind: 'image', format: 'SVG', vector: true, width: g(/<svg[^>]*\bwidth="([^"]+)"/), height: g(/<svg[^>]*\bheight="([^"]+)"/), viewBox: g(/viewBox="([^"]+)"/), title: g(/<title>([^<]*)<\/title>/), note: 'Image content is not interpreted.' };
    }
    const [width, height] = imageDims(bytes);
    return { kind: 'image', format: record.ext.slice(1).toUpperCase(), width, height, note: 'Image content is not interpreted — no description is generated.' };
  },
};

const GENERIC_IMPORTS = [
  /^\s*import\s+(?:static\s+)?([\w.*]+);/gm,              // Java/Kotlin/Scala
  /^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm,               // C#
  /^\s*import\s+(?:\w+\s+)?"([\w./\-]+)"/gm,                 // Go single
  /^\s*"([\w./\-]+)"\s*$/gm,                                  // Go block entries
  /^\s*use\s+([\w:]+)/gm,                                     // Rust/PHP
  /^\s*#\s*include\s+[<"]([^>"]+)[>"]/gm,                     // C/C++
  /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g,  // PHP
  /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm,           // Ruby
  /^\s*(?:source|\.)\s+([\w./\-${}]+\.(?:sh|bash))/gm,        // shell
  /^\s*\.\s+([\w.\\/:\-]+\.ps1)/gmi,                          // PowerShell dot-source
  /^\s*Import-Module\s+([\w.\\/:\-]+)/gmi,
  /^\s*import\s+['"]package:([^'"]+)['"]/gm,                  // Dart
  /^\s*import\s+(\w+)\s*$/gm,                                  // Swift
];
const DEF = /^\s*(?:(?:public|private|protected|internal|static|final|abstract|override|async|virtual|export|pub(?:\(crate\))?|open)\s+)*(?:func|fn|def|function|sub|fun|void|int|string|bool|[A-Z][\w<>\[\],]*)\s+([A-Za-z_]\w*)\s*\(/gm;
const TYPE = /^\s*(?:(?:public|private|internal|abstract|final|sealed|static|data|open|pub|export)\s+)*(?:class|struct|interface|enum|trait|object|record|impl|module)\s+([A-Za-z_]\w*)/gm;

export const genericSourceProcessor = {
  name: 'generic-source', priority: 40,
  match: (r) => r.category === 'Source Code' || r.category === 'Test',
  process({ text }) {
    const imports = [];
    for (const re of GENERIC_IMPORTS) for (const m of text.matchAll(re)) imports.push(m[1]);
    return {
      kind: 'source', imports: uniq(imports).slice(0, 100),
      functions: uniq([...text.matchAll(DEF)].map((m) => m[1]).filter((n) => !['if', 'for', 'while', 'switch', 'return', 'catch'].includes(n))).slice(0, 80),
      types: uniq([...text.matchAll(TYPE)].map((m) => m[1])).slice(0, 50),
      testFrameworks: detectFrameworks(text),
    };
  },
};

export const unknownProcessor = {
  name: 'unknown', priority: 1,
  match: () => true,
  process({ record, text }) {
    if (record.binary) return { kind: 'unknown-binary', note: 'Unrecognised binary format. Metadata retained; content cannot be represented as text.', limitation: true };
    const trimmed = (text || '').trimStart();
    const structure = /^[{[]/.test(trimmed) ? 'possibly JSON-like' : /^</.test(trimmed) ? 'possibly XML/markup' : /^[\w.-]+\s*[=:]/m.test(trimmed) ? 'possibly key/value configuration' : 'plain text';
    return { kind: 'unknown-text', structure, note: 'Unrecognised extension detected as text; content included as plain text.' };
  },
};
