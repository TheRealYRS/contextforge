// Office Open XML extraction (.xlsx/.xlsm, .docx, .pptx) using the built-in ZIP reader.
// Macros are never extracted or executed. Legacy binary formats (.xls/.doc/.ppt) are metadata-only.
import { openZip, xmlUnescape, attr } from '../zipreader.js';

const MAX_SAMPLE_COLS = 40;

function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlUnescape(t[1])).join(''));
}

function readRows(xml, shared, wantRows) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1]; const inner = cm[2] || '';
      const ref = attr(`<c ${a}>`, 'r') || '';
      const idx = ref ? colIndex(ref) : row.length;
      if (idx >= MAX_SAMPLE_COLS) continue;
      const t = attr(`<c ${a}>`, 't');
      const f = inner.match(/<f[^>]*>([\s\S]*?)<\/f>/);
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      const is = inner.match(/<is>([\s\S]*?)<\/is>/);
      let val = '';
      if (f) val = `=${xmlUnescape(f[1])}`;
      else if (t === 's' && v) val = shared[+v[1]] ?? '';
      else if (t === 'inlineStr' && is) val = [...is[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlUnescape(x[1])).join('');
      else if (v) val = xmlUnescape(v[1]);
      row[idx] = String(val).replace(/\s+/g, ' ').slice(0, 120);
    }
    rows.push(Array.from(row, (x) => x ?? ''));
    if (rows.length >= wantRows) break;
  }
  return rows;
}

export const xlsxProcessor = {
  name: 'spreadsheet', priority: 60,
  match: (r) => ['.xlsx', '.xlsm', '.xltx', '.xltm'].includes(r.ext),
  async process({ record, bytes, config }) {
    let zip;
    try { zip = await openZip(bytes); } catch (e) { return { kind: 'spreadsheet', error: `workbook could not be opened (${e.message})` }; }
    const wb = await zip.text('xl/workbook.xml');
    if (!wb) return { kind: 'spreadsheet', error: 'xl/workbook.xml missing — not a valid workbook' };
    const rels = (await zip.text('xl/_rels/workbook.xml.rels')) || '';
    const relMap = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
    const shared = parseSharedStrings(await zip.text('xl/sharedStrings.xml'));
    const definedNames = [...wb.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)]
      .map((m) => ({ name: attr(`<x ${m[1]}>`, 'name'), ref: xmlUnescape(m[2]) })).filter((d) => !String(d.name).startsWith('_xlnm')).slice(0, 40);
    const sheets = [];
    let totalFormulas = 0;
    for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
      const name = attr(m[0], 'name');
      const rid = attr(m[0], 'r:id');
      const state = attr(m[0], 'state') || 'visible';
      let target = relMap[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      const xml = await zip.text(target);
      if (!xml) { sheets.push({ name, state, error: 'sheet part missing' }); continue; }
      const dim = (xml.match(/<dimension\s+ref="([^"]+)"/) || [])[1] || '';
      const rowCount = (xml.match(/<row\b/g) || []).length;
      const formulas = (xml.match(/<f[\s>]/g) || []).length;
      totalFormulas += formulas;
      const rows = readRows(xml, shared, config.csvSampleRows + 1);
      const sampleFormulas = [...xml.matchAll(/<c\b[^>]*r="([A-Z]+\d+)"[^>]*>\s*<f[^>]*>([\s\S]*?)<\/f>/g)].slice(0, 8).map((x) => `${x[1]}: =${xmlUnescape(x[2])}`);
      const headers = rows[0] || [];
      sheets.push({ name, state, dimension: dim, rows: rowCount, columns: Math.max(0, ...rows.map((r) => r.length)), headers, sampleRows: rows.slice(1), formulaCount: formulas, sampleFormulas });
    }
    return {
      kind: 'spreadsheet', sheetCount: sheets.length, sheets, totalFormulas, definedNames,
      hasMacros: zip.has('xl/vbaProject.bin'),
      note: 'Structural summary only (sheet names, dimensions, headers, sample rows, formulas). Macros are never executed.',
    };
  },
};

function paragraphText(p) {
  return [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((m) => (m[1] != null ? xmlUnescape(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n')).join('');
}

export const docxProcessor = {
  name: 'docx', priority: 60,
  match: (r) => ['.docx', '.docm', '.dotx'].includes(r.ext),
  async process({ bytes }) {
    let zip;
    try { zip = await openZip(bytes); } catch (e) { return { kind: 'docx', error: `document could not be opened (${e.message})` }; }
    const xml = await zip.text('word/document.xml');
    if (!xml) return { kind: 'docx', error: 'word/document.xml missing — not a valid Word document' };
    const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
    const lines = []; const headings = []; const tables = [];
    let paragraphs = 0;
    for (const block of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g)) {
      const b = block[0];
      if (b.startsWith('<w:tbl>')) {
        const rows = [...b.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((c) => [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paragraphText(p[0])).join(' ').replace(/\|/g, '\\|').trim()));
        if (!rows.length) continue;
        tables.push({ rows: rows.length, columns: rows[0].length, header: rows[0] });
        const width = Math.max(...rows.map((r) => r.length));
        const pad = (r) => [...r, ...Array(width - r.length).fill('')];
        lines.push('', `| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1, 60).map((r) => `| ${pad(r).join(' | ')} |`));
        if (rows.length > 60) lines.push(`_(table truncated: ${rows.length - 60} more rows)_`);
        lines.push('');
        continue;
      }
      const text = paragraphText(b).trim();
      if (!text) continue;
      paragraphs++;
      const style = (b.match(/<w:pStyle\s+w:val="([^"]+)"/) || [])[1] || '';
      const level = /^Title$/i.test(style) ? 1 : (style.match(/^Heading\s*(\d)/i) || [])[1];
      if (level) { headings.push({ level: +level, text }); lines.push(`${'#'.repeat(Math.min(+level + 3, 6))} ${text}`); }
      else lines.push(text);
    }
    const core = (await zip.text('docProps/core.xml')) || '';
    return {
      kind: 'docx', paragraphCount: paragraphs, tableCount: tables.length, headings: headings.slice(0, 80), tables: tables.slice(0, 30),
      title: xmlUnescape((core.match(/<dc:title>([\s\S]*?)<\/dc:title>/) || [, ''])[1]),
      extractedText: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      hasMacros: zip.has('word/vbaProject.bin'),
    };
  },
};

export const pptxProcessor = {
  name: 'pptx', priority: 60,
  match: (r) => ['.pptx', '.pptm'].includes(r.ext),
  async process({ bytes }) {
    let zip;
    try { zip = await openZip(bytes); } catch (e) { return { kind: 'pptx', error: `presentation could not be opened (${e.message})` }; }
    const slideNames = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
    if (!slideNames.length && !zip.has('ppt/presentation.xml')) return { kind: 'pptx', error: 'not a valid PowerPoint file' };
    const slides = [];
    for (const [i, n] of slideNames.entries()) {
      const xml = await zip.text(n);
      const paras = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((p) => [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => xmlUnescape(t[1])).join('')).filter((t) => t.trim());
      const notesXml = await zip.text(`ppt/notesSlides/notesSlide${n.match(/(\d+)\.xml/)[1]}.xml`);
      const notes = notesXml ? [...notesXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => xmlUnescape(t[1])).join(' ').trim() : '';
      slides.push({ index: i + 1, title: paras[0] || '', text: paras, notes: notes && !/^\d+$/.test(notes) ? notes : '' });
    }
    const extractedText = slides.map((s) => [`### Slide ${s.index}${s.title ? `: ${s.title}` : ''}`, ...s.text.slice(1).map((t) => `- ${t}`), s.notes ? `\n_Speaker notes:_ ${s.notes}` : ''].filter(Boolean).join('\n')).join('\n\n');
    return { kind: 'pptx', slideCount: slides.length, slides: slides.map(({ index, title }) => ({ index, title })), extractedText };
  },
};

export const legacyOfficeProcessor = {
  name: 'office-legacy', priority: 55,
  match: (r) => ['.xls', '.xlsb', '.doc', '.ppt'].includes(r.ext),
  process({ record }) {
    return {
      kind: 'office-legacy',
      note: `${record.ext} is a legacy binary Office format. Its text cannot be extracted in the browser without a dedicated parser; only metadata is recorded. Save it as ${record.ext === '.doc' ? '.docx' : record.ext === '.ppt' ? '.pptx' : '.xlsx'} to include its content.`,
      limitation: true,
    };
  },
};
