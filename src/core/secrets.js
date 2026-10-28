// Best-effort secret detection. This is NOT complete detection — it catches common,
// recognisable credential shapes. Detected values are redacted in generated output by default.
const RULES = [
  ['Private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, 0],
  ['AWS access key ID', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, 0],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, 0],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, 0],
  ['Stripe secret key', /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g, 0],
  ['Google API key', /\bAIza[0-9A-Za-z_\-]{35}\b/g, 0],
  ['OpenAI-style API key', /\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}\b/g, 0],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, 0],
  ['Connection string credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:([^\s@'"]{3,})@/gi, 1],
  // key = "value" assignments with sensitive key names; group 1 is the value
  ['Credential assignment',
    /(?:^|[\s,{;(])["']?(?:[A-Za-z0-9_.-]*?(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|token))["']?\s*[:=]\s*["']?([^\s"',;}{)]{6,})/gim, 1],
];

const PLACEHOLDER = /^(?:x{3,}|\*{3,}|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|%[A-Z_]+%|changeme|example|placeholder|dummy|redacted|null|none|true|false|your[_-].*|process\.env\..*|os\.environ.*|env\(.*)$/i;

export const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.[^/]+)?$/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)\.npmrc$/i, /(^|\/)\.pypirc$/i, /(^|\/)credentials(\.json)?$/i, /secrets?\.(json|ya?ml|toml)$/i, /\.kdbx$/i,
];

export function isSensitiveFile(path) {
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(path)) && !/\.(example|sample|template|dist)$/i.test(path);
}

/** Find secrets. Returns [{type, line, start, end}] where start/end bracket the secret value. */
export function findSecrets(text) {
  const found = [];
  for (const [type, re, group] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const value = group ? m[group] : m[0];
      if (!value || PLACEHOLDER.test(value.trim())) continue;
      const start = m.index + m[0].lastIndexOf(value);
      const end = start + value.length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      found.push({ type, start, end, line: text.slice(0, start).split('\n').length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Replace each detected value with a visible marker. Returns {text, count}. */
export function redact(text, findings) {
  if (!findings.length) return { text, count: 0 };
  let out = '';
  let pos = 0;
  for (const f of findings) {
    out += text.slice(pos, f.start) + `[REDACTED: ${f.type}]`;
    pos = f.end;
  }
  return { text: out + text.slice(pos), count: findings.length };
}
