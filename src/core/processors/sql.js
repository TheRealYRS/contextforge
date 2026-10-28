// SQL static analysis. SQL is parsed as text and never executed.
import { uniq } from '../util.js';

const ID = '([`"\\[\\]\\w.]+)';
const RE = {
  table: new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}`, 'gi'),
  view: new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}`, 'gi'),
  proc: new RegExp(`\\bCREATE\\s+(?:OR\\s+(?:REPLACE|ALTER)\\s+)?(?:PROCEDURE|PROC|FUNCTION|TRIGGER)\\s+${ID}`, 'gi'),
  index: new RegExp(`\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}`, 'gi'),
  alter: new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${ID}`, 'gi'),
  from: new RegExp(`\\bFROM\\s+${ID}`, 'gi'),
  join: new RegExp(`\\b((?:INNER|LEFT|RIGHT|FULL|CROSS)?\\s*(?:OUTER\\s+)?JOIN)\\s+${ID}`, 'gi'),
  insert: new RegExp(`\\bINSERT\\s+INTO\\s+${ID}`, 'gi'),
  update: new RegExp(`\\bUPDATE\\s+${ID}`, 'gi'),
  del: new RegExp(`\\bDELETE\\s+FROM\\s+${ID}`, 'gi'),
  references: new RegExp(`\\bREFERENCES\\s+${ID}`, 'gi'),
};
const KEYWORDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'MERGE', 'GRANT', 'WITH'];
const DIALECTS = [
  ['T-SQL (SQL Server)', /\b(?:GO|NVARCHAR|IDENTITY\s*\(|TOP\s+\d+|ISNULL\s*\()|\[dbo\]/gi],
  ['PL/SQL (Oracle)', /\b(?:VARCHAR2|NUMBER\s*\(|SYSDATE|DUAL)\b/gi],
  ['PostgreSQL', /\b(?:SERIAL|BIGSERIAL|RETURNING|ILIKE|JSONB)\b|::\w+/gi],
  ['MySQL/MariaDB', /\b(?:AUTO_INCREMENT|ENGINE\s*=)|`\w+`/gi],
  ['SQLite', /\b(?:AUTOINCREMENT|PRAGMA|sqlite_master)\b/gi],
];
const clean = (s) => s.replace(/[`"[\]]/g, '').trim();
const grab = (re, t, g = 1) => [...t.matchAll(re)].map((m) => clean(m[g]));

export const sqlProcessor = {
  name: 'sql', priority: 60,
  match: (r) => ['.sql', '.ddl', '.psql'].includes(r.ext),
  process({ record, text }) {
    const s = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
    const joins = [...s.matchAll(RE.join)].map((m) => ({ type: m[1].replace(/\s+/g, ' ').trim().toUpperCase() || 'JOIN', table: clean(m[2]) }));
    const referenced = uniq([...grab(RE.from, s), ...joins.map((j) => j.table), ...grab(RE.insert, s), ...grab(RE.update, s), ...grab(RE.del, s), ...grab(RE.references, s)])
      .filter((t) => t && !/^\(/.test(t) && !/^(select|set|where|lateral)$/i.test(t)).sort();
    const counts = {};
    for (const k of KEYWORDS) { const n = (s.match(new RegExp(`\\b${k}\\b`, 'gi')) || []).length; if (n) counts[k] = n; }
    const scores = DIALECTS.map(([n, re]) => [n, (s.match(re) || []).length]).sort((a, b) => b[1] - a[1]);
    const [dialect, score] = scores[0];
    const isMigration = /(^|\/)(migrations?|db\/migrate|flyway|liquibase|alembic)(\/|$)/i.test(record.path) || /^V\d+(_\d+)*__/.test(record.name) || /^\d{3,}[_-]/.test(record.name);
    return {
      kind: 'sql',
      dialect: score > 0 ? dialect : 'Unknown', dialectConfidence: score >= 2 ? 'Likely' : 'Unknown',
      tablesCreated: uniq(grab(RE.table, s)).sort(), views: uniq(grab(RE.view, s)).sort(),
      procedures: uniq(grab(RE.proc, s)).sort(), indexes: uniq(grab(RE.index, s)).sort(),
      tablesAltered: uniq(grab(RE.alter, s)).sort(),
      tablesReferenced: referenced.slice(0, 150), joins: joins.slice(0, 80),
      statementCounts: counts, isMigration,
      sqlFileReferences: uniq([...text.matchAll(/(?:^|[\s@:'"])([\w\-/\\.]+\.sql)\b/gi)].map((m) => m[1]).filter((f) => f.toLowerCase() !== record.name.toLowerCase())).slice(0, 20),
    };
  },
};
