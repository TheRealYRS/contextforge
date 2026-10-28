// Python static analysis without executing code. A browser has no Python AST,
// so this is a line-oriented parser: imports, top-level/nested defs, classes, __main__ guard.
import { detectFrameworks } from '../registry.js';
import { uniq } from '../util.js';

export const pythonProcessor = {
  name: 'python', priority: 60,
  match: (r) => ['.py', '.pyw', '.pyi'].includes(r.ext),
  process({ text }) {
    const imports = [];
    const fromImports = [];
    const relative = [];
    const classes = [];
    const functions = [];
    let docstring = '';
    const doc = text.match(/^\s*(?:#[^\n]*\n|\s)*(?:'''|""")([\s\S]*?)(?:'''|""")/);
    if (doc) docstring = doc[1].trim().split('\n')[0].slice(0, 300);

    // Join backslash/paren continuations for import statements.
    const joined = text.replace(/\(\s*([^)]*?)\s*\)/gs, (m, inner) => (/import/.test(m) ? m : `(${inner.replace(/\n/g, ' ')})`));
    for (const raw of joined.split('\n')) {
      const line = raw.replace(/#.*$/, '');
      let m;
      if ((m = line.match(/^\s*import\s+(.+)$/))) {
        for (const part of m[1].split(',')) { const mod = part.trim().split(/\s+as\s+/)[0].trim(); if (/^[\w.]+$/.test(mod)) imports.push(mod); }
      } else if ((m = line.match(/^\s*from\s+(\.*)([\w.]*)\s+import\b/))) {
        if (m[1]) relative.push(m[1] + m[2]); else if (m[2]) fromImports.push(m[2]);
      } else if ((m = line.match(/^(\s*)class\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:/))) {
        classes.push({ name: m[2], bases: (m[3] || '').split(',').map((s) => s.trim()).filter(Boolean), indent: m[1].length });
      } else if ((m = line.match(/^(\s*)(async\s+)?def\s+([A-Za-z_]\w*)\s*\(/))) {
        functions.push({ name: m[3], async: !!m[2], indent: m[1].length });
      }
    }
    return {
      kind: 'python',
      imports: uniq(imports).sort(), fromImports: uniq(fromImports).sort(), relativeImports: uniq(relative).sort(),
      classes: classes.slice(0, 60), functions: functions.slice(0, 150),
      hasMainGuard: /^if\s+__name__\s*==\s*['"]__main__['"]\s*:/m.test(text),
      docstring,
      testFrameworks: detectFrameworks(text),
      dataReferences: uniq([...text.matchAll(/['"]([^'"\s]+\.(?:json|ya?ml|csv|tsv|xlsx?|xlsm|sql|txt|ini|toml|env|pdf|docx))['"]/g)].map((x) => x[1])).slice(0, 40),
    };
  },
};

export const requirementsProcessor = {
  name: 'python-requirements', priority: 85,
  match: (r) => /^requirements.*\.txt$/i.test(r.name) || ['pyproject.toml', 'pipfile', 'setup.cfg', 'environment.yml'].includes(r.name.toLowerCase()),
  process({ record, text }) {
    let packages = [];
    if (/^requirements/i.test(record.name)) {
      for (let line of text.split('\n')) {
        line = line.split('#')[0].trim();
        if (!line || line.startsWith('-')) continue;
        packages.push(line.split(/[<>=!~[;\s]/)[0].trim());
      }
    } else {
      packages = [...text.matchAll(/^\s*["']?([A-Za-z0-9_.\-]+)["']?\s*(?:[><=~^]=?|=\s*["'])/gm)].map((m) => m[1]);
    }
    packages = uniq(packages).slice(0, 300);
    return { kind: 'python-requirements', packages };
  },
};
