// HTML / CSS reference extraction. Content is never rendered and scripts are never evaluated.
import { uniq } from '../util.js';

const local = (vals) => uniq(vals.map((v) => v.trim())).filter((v) => v && !/^(?:[a-z]+:|\/\/|#|\{\{|\$\{)/i.test(v));
const grab = (re, t) => [...t.matchAll(re)].map((m) => m[1]);

export const htmlProcessor = {
  name: 'html', priority: 60,
  match: (r) => ['.html', '.htm', '.xhtml'].includes(r.ext),
  process({ text }) {
    const links = grab(/<link\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"]/gi, text);
    const stylesheets = local(links.filter((l) => /\.(css|scss|less)(\?|$)/i.test(l)));
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      kind: 'html',
      title: title ? title[1].trim().slice(0, 200) : '',
      scripts: local(grab(/<script\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi, text)),
      stylesheets,
      otherLinks: local(links).filter((l) => !stylesheets.includes(l)),
      images: local(grab(/<img\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi, text)),
      anchors: local(grab(/<a\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"]/gi, text)).slice(0, 40),
      forms: local(grab(/<form\b[^>]*\baction\s*=\s*['"]([^'"]+)['"]/gi, text)).slice(0, 20),
      inlineScripts: (text.match(/<script\b(?![^>]*\bsrc=)[^>]*>/gi) || []).length,
      moduleScripts: (text.match(/<script\b[^>]*type\s*=\s*['"]module['"]/gi) || []).length,
    };
  },
};

export const cssProcessor = {
  name: 'css', priority: 60,
  match: (r) => ['.css', '.scss', '.sass', '.less'].includes(r.ext),
  process({ text }) {
    const imports = local([...grab(/@(?:import|use|forward)\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gi, text)]);
    const urls = local(grab(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, text)).filter((u) => !imports.includes(u));
    return {
      kind: 'css', imports, urls: urls.slice(0, 40),
      ruleBlocks: (text.match(/\{/g) || []).length,
      customProperties: uniq(grab(/(--[\w-]+)\s*:/g, text)).slice(0, 60),
    };
  },
};
