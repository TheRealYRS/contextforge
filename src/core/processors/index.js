// Processor registry. Add a format by writing an object with
// { name, priority, match(record), process({record, bytes, text, config}) } and registering it.
import { javascriptProcessor, packageJsonProcessor } from './javascript.js';
import { pythonProcessor, requirementsProcessor } from './python.js';
import { sqlProcessor } from './sql.js';
import { htmlProcessor, cssProcessor } from './web.js';
import { jsonProcessor, yamlProcessor, xmlProcessor, iniProcessor, csvProcessor } from './data.js';
import { xlsxProcessor, docxProcessor, pptxProcessor, legacyOfficeProcessor } from './office.js';
import { pdfProcessor } from './pdf.js';
import { markdownProcessor, notebookProcessor, imageProcessor, genericSourceProcessor, unknownProcessor } from './misc.js';

const registry = [];
export function registerProcessor(p) {
  if (!p || typeof p.match !== 'function' || typeof p.process !== 'function' || !p.name) throw new Error('invalid processor');
  registry.push(p);
  registry.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
export const processors = () => [...registry];

[packageJsonProcessor, requirementsProcessor, notebookProcessor, javascriptProcessor, pythonProcessor, sqlProcessor,
  htmlProcessor, cssProcessor, xlsxProcessor, docxProcessor, pptxProcessor, pdfProcessor, imageProcessor,
  legacyOfficeProcessor, jsonProcessor, yamlProcessor, xmlProcessor, csvProcessor, markdownProcessor, iniProcessor,
  genericSourceProcessor, unknownProcessor].forEach(registerProcessor);

export function findProcessor(record) {
  for (const p of registry) { try { if (p.match(record)) return p; } catch { /* broken plugin must not break scans */ } }
  return null;
}
