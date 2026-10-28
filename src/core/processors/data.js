// JSON / YAML / XML / TOML / INI / ENV / CSV structural analysis.
import { uniq } from '../util.js';

const FILE_REF = /["']?([\w\-./\\]+\.(?:js|mjs|cjs|ts|py|sql|json|ya?ml|csv|xlsx?|html|css|md|txt|pdf|docx))["']?/gi;
const fileRefs = (t) => uniq([...t.matchAll(FILE_REF)].map((m) => m[1]).filter((r) => !/^\.\w+$/.test(r))).slice(0, 40);

function shape(v, depth = 0) {
  if (depth >= 3) return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  if (Array.isArray(v)) return v.length ? [`array[${v.length}] of`, shape(v[0], depth + 1)] : 'empty array';
  if (v && typeof v === 'object') {
    const out = {};
    const keys = Object.keys(v);
    for (const k of keys.slice(0, 30)) out[k] = shape(v[k], depth + 1);
    if (keys.length > 30) out['…'] = `${keys.length - 30} more keys`;
    return out;
  }
  return v === null ? 'null' : typeof v;
}

export const jsonProcessor = {
  name: 'json', priority: 55,
  match: (r) => ['.json', '.json5', '.jsonl', '.ndjson'].includes(r.ext),
  process({ record, text }) {
    if (record.ext === '.jsonl' || record.ext === '.ndjson') {
      const lines = text.split('\n').filter((l) => l.trim());
      let first = null; let bad = 0;
      lines.forEach((l, i) => { try { const v = JSON.parse(l); if (i === 0) first = v; } catch { bad++; } });
      return { kind: 'jsonl', recordCount: lines.length, invalidLines: bad, firstRecordShape: first ? shape(first) : null };
    }
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) {
      if (record.ext === '.json5' || /^\s*\/\//m.test(text)) return { kind: 'json', valid: null, note: 'JSON with comments / JSON5 — structure not parsed', fileReferences: fileRefs(text) };
      return { kind: 'json', valid: false, error: `invalid JSON: ${String(e.message).slice(0, 100)}` };
    }
    return {
      kind: 'json', valid: true,
      rootType: Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data,
      topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 60) : [],
      itemCount: data && typeof data === 'object' ? Object.keys(data).length : 1,
      shape: shape(data), fileReferences: fileRefs(text),
    };
  },
};

export const yamlProcessor = {
  name: 'yaml', priority: 55,
  match: (r) => ['.yaml', '.yml'].includes(r.ext),
  process({ text }) {
    const keys = uniq([...text.matchAll(/^([A-Za-z_][\w.\-]*)\s*:/gm)].map((m) => m[1]));
    const nested = {};
    let current = null;
    for (const line of text.split('\n')) {
      const top = line.match(/^([A-Za-z_][\w.\-]*)\s*:/);
      if (top) { current = top[1]; continue; }
      const child = line.match(/^ {2}([A-Za-z_][\w.\-]*)\s*:/);
      if (child && current) (nested[current] ||= []).push(child[1]);
    }
    const docs = text.split(/^---\s*$/m).filter((d) => d.trim()).length || 1;
    const ci = /(^|\n)(on|jobs|steps|stages|pipeline|trigger|services|workflow)\s*:/.test(text);
    return {
      kind: 'yaml', documentCount: docs, topLevelKeys: keys.slice(0, 60), nestedKeys: nested,
      looksLikeCI: ci, fileReferences: fileRefs(text),
      note: 'Keys detected by indentation scan (no YAML library is used, nothing is evaluated).',
    };
  },
};

export const xmlProcessor = {
  name: 'xml', priority: 55,
  match: (r) => ['.xml', '.xsd', '.xsl', '.xslt', '.plist', '.csproj', '.vbproj', '.config'].includes(r.ext) || r.name.toLowerCase() === 'pom.xml',
  process({ record, text }) {
    if (record.ext === '.config' && !/^\s*</.test(text)) return iniProcessor.process({ record, text });
    const body = text.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    const root = body.match(/<([A-Za-z_][\w:.\-]*)/);
    if (!root) return { kind: 'xml', valid: false, error: 'no root element found' };
    const counts = {};
    let open = 0; let close = 0;
    for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.\-]*)[^>]*?(\/?)>/g)) {
      if (m[1]) { close++; continue; }
      counts[m[2]] = (counts[m[2]] || 0) + 1;
      if (!m[3]) open++;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
    return {
      kind: 'xml', valid: open === close ? true : null,
      balanced: open === close, rootTag: root[1],
      elementCount: Object.values(counts).reduce((a, b) => a + b, 0),
      topElements: top.map(([tag, count]) => ({ tag, count })),
      dependencies: record.name.toLowerCase() === 'pom.xml' ? [...text.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)].map((m) => m[1]).slice(1, 80) : [],
      fileReferences: fileRefs(text),
    };
  },
};

export const iniProcessor = {
  name: 'ini', priority: 50,
  match: (r) => ['.ini', '.cfg', '.conf', '.toml', '.properties', '.env', '.editorconfig'].includes(r.ext) || /^\.env(\.|$)/i.test(r.name) || ['.editorconfig', '.npmrc'].includes(r.name.toLowerCase()),
  process({ record, text }) {
    const sections = uniq([...text.matchAll(/^\s*\[\[?([^\]\n]+)\]\]?\s*$/gm)].map((m) => m[1].trim()));
    const keys = uniq([...text.matchAll(/^\s*([A-Za-z_][\w.\-]*)\s*[=:]/gm)].map((m) => m[1]));
    const fmt = record.ext === '.toml' ? 'toml' : /^\.env/i.test(record.name) || record.ext === '.env' ? 'dotenv' : record.ext === '.properties' ? 'properties' : 'ini';
    return { kind: 'config', format: fmt, sections: sections.slice(0, 60), keys: keys.slice(0, 120), keyCount: keys.length };
  },
};

// --- CSV ---
export function parseCsv(text, delimiter, maxRows = Infinity) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
      if (rows.length >= maxRows) return rows;
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function sniffDelimiter(sample, ext) {
  if (ext === '.tsv') return '\t';
  const first = sample.split('\n').slice(0, 5);
  let best = ','; let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = first.map((l) => l.split(d).length - 1);
    const score = counts[0] > 0 && counts.every((c) => c === counts[0]) ? counts[0] + 100 : counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function inferType(values) {
  const v = values.filter((x) => x !== '' && x != null);
  if (!v.length) return 'empty';
  if (v.every((x) => /^-?\d+$/.test(x))) return 'integer';
  if (v.every((x) => /^-?\d*[.,]?\d+(e[+-]?\d+)?$/i.test(x))) return 'number';
  if (v.every((x) => /^(true|false|yes|no|y|n|0|1)$/i.test(x))) return 'boolean';
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(x) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(x))) return 'date';
  return 'text';
}

export const csvProcessor = {
  name: 'csv', priority: 55,
  match: (r) => ['.csv', '.tsv'].includes(r.ext),
  process({ record, text, config }) {
    const sampleRows = config.csvSampleRows;
    const delimiter = sniffDelimiter(text.slice(0, 8192), record.ext);
    const rows = parseCsv(text, delimiter, 2000).filter((r) => r.length > 1 || r[0] !== '');
    const headers = (rows[0] || []).map((h) => h.trim());
    const body = rows.slice(1);
    const columns = headers.map((h, i) => ({ name: h || `column_${i + 1}`, type: inferType(body.slice(0, 500).map((r) => (r[i] ?? '').trim())) }));
    const totalRows = (text.match(/\n/g) || []).length + (text.endsWith('\n') ? 0 : 1) - 1;
    return {
      kind: 'csv', delimiter: delimiter === '\t' ? 'tab' : delimiter, columns, columnCount: headers.length,
      rowCount: Math.max(totalRows, 0), rowCountApproximate: /"[^"]*\n/.test(text),
      sampleRows: body.slice(0, sampleRows).map((r) => r.map((c) => c.slice(0, 80))),
    };
  },
};
