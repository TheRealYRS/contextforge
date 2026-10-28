# Security & privacy

ContextForge treats every selected file as **untrusted input**.

| Threat | Protection | Enforced by |
| --- | --- | --- |
| Project data leaving the machine | All processing runs in the browser tab. There is no server, analytics or API call. Production CSP sets `connect-src 'none'`. | `tests/build.test.mjs` forbids `fetch`/XHR/WebSocket/`sendBeacon` in shipped code and asserts the CSP |
| Executing project code | Regex and container parsing only. No `eval`, `new Function`, JS/Python/SQL/shell execution, package installs or macros. | `analysis.test.mjs` "project code is never executed"; build test forbids `eval`/`new Function` |
| Modifying originals | Inputs are only read. Included files are re-read and re-hashed after generation. | `verifyOriginals`; scanner test |
| Path traversal / unsafe output names | `sanitizeRelativePath` drops `..`, absolute paths and drive letters, replaces Windows-illegal characters and escapes reserved names. Validation re-checks every output path. | `export.test.mjs` |
| HTML/script injection from file content | The UI renders file content with `textContent` only | Build test forbids `.innerHTML =` |
| Leaking credentials into the package | Pattern-based detection. Values are redacted by default, every redaction is reported, and sensitive files are excluded by default. | `packaging.test.mjs` |
| Zip bombs / huge files | Per-entry decompression cap of 64 MB. Size limits apply for text, documents and hashing. Over-limit files are not read. | scanner tests |
| Persisting project content | Only settings go into `localStorage`. Project data lives in memory and is cleared when you close the project or the tab. | code review: `saveSettings` stores `state.config` only |

**Limits of these guarantees:**

- Secret detection is pattern-based and **cannot be complete**. Review the output before you share
  it.
- Deploying by drag-and-drop to Netlify skips `netlify.toml`, which drops the CSP header. Deploy
  from Git or with the CLI to keep it.
