// In-memory project search over paths, text content and extracted document text.
export function searchProject(project, query, { regex = false, caseSensitive = false, maxPerFile = 6, maxFiles = 200 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  let re;
  try { re = new RegExp(regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i'); }
  catch { re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i'); }
  const results = [];
  for (const r of project.files) {
    if (results.length >= maxFiles) break;
    const hits = [];
    if (re.test(r.path)) hits.push({ line: 0, text: r.path, kind: 'path' });
    const body = r.text ?? r.analysis?.extractedText ?? '';
    if (body) {
      const lines = body.split('\n');
      for (let i = 0; i < lines.length && hits.length < maxPerFile; i++) {
        const m = lines[i].match(re);
        if (!m) continue;
        const start = Math.max(0, m.index - 60);
        hits.push({ line: i + 1, text: (start ? '…' : '') + lines[i].slice(start, m.index + m[0].length + 80).trim(), kind: 'content' });
      }
    }
    if (hits.length) results.push({ path: r.path, category: r.category, included: r.included, hits });
  }
  return results;
}
