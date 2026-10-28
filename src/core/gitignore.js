// Dependency-free .gitignore matcher (ported). Used as an exclusion signal only.
function translate(p) {
  let out = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p.slice(i, i + 3) === '**/') { out += '(?:.*/)?'; i += 2; continue; }
      if (p[i + 1] === '*') { out += '.*'; i++; continue; }
      out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '[') { const j = p.indexOf(']', i); if (j < 0) out += '\\['; else { out += p.slice(i, j + 1); i = j; } }
    else out += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return out;
}

export class GitIgnore {
  constructor(rules = []) { this.rules = rules; }

  static fromText(text) {
    const rules = [];
    for (let raw of String(text).split(/\r?\n/)) {
      if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
      let line = raw;
      const negated = line.startsWith('!');
      if (negated) line = line.slice(1);
      line = line.trim();
      if (!line) continue;
      const dirOnly = line.endsWith('/');
      if (dirOnly) line = line.slice(0, -1);
      const anchored = line.startsWith('/') || line.includes('/');
      if (line.startsWith('/')) line = line.slice(1);
      const body = translate(line);
      const regex = new RegExp(anchored ? `^${body}(?:/.*)?$` : `^(?:.*/)?${body}(?:/.*)?$`);
      rules.push({ regex, negated, dirOnly });
    }
    return new GitIgnore(rules);
  }

  /** Is `path` ignored? Directory-only rules still ignore files beneath that directory. */
  match(path, isDir = false) {
    let ignored = false;
    for (const r of this.rules) {
      if (!r.regex.test(path)) continue;
      if (r.dirOnly && !isDir && !path.includes('/')) continue;
      if (r.dirOnly && !isDir) {
        // only matches if a parent directory matched, i.e. the path is beneath the dir
        const parents = path.split('/').slice(0, -1);
        let hit = false;
        for (let k = 1; k <= parents.length; k++) if (r.regex.test(parents.slice(0, k).join('/'))) hit = true;
        if (!hit) continue;
      }
      ignored = !r.negated;
    }
    return ignored;
  }

  get size() { return this.rules.length; }
}
