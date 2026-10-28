# ContextForge

**Turn any project into a compact, structured collection of files that AI assistants can understand and work with.**

ContextForge runs entirely in your browser. You select a project folder. It analyses the project's
structure and turns it into a few readable files: an overview, the verbatim contents, a project
map, extracted data and documents, and a manifest. You review what goes in, choose a layout, and
download those files.

It does **not** copy your project, create a ZIP, or upload anything. It also does not get around
any AI assistant's limits. It reorganises project information into a structured, compact form
that is easier to give to an assistant.

```
Select project → Analyze → Review → Package → Validate → Download
```

---

## What you get

| File | When | Contains |
| --- | --- | --- |
| `PROJECT_OVERVIEW.md` | always | Project identity, detected type (with evidence), description from README/manifest, major directories, entry points, dependencies, configuration, testing, limitations, everything that was left out and why. **Start here.** |
| `context/PROJECT_CONTENTS.md` | always | Verbatim content of the selected source, tests, config and docs, grouped as entry points → core source → tests → configuration → documentation. Every section is headed by the file's original relative path. Splits into `PROJECT_CONTENTS_part2.md`… above a configurable size. |
| `maps/PROJECT_MAP.md` | larger projects | Directory tree, most-referenced files, relationships with confidence, unresolved references, tests → code they reference, SQL objects, assets. Each file links to the section that holds its content. For small projects, this goes inside the overview instead. |
| `context/DATA_AND_DOCUMENTS.md` | only if relevant | Spreadsheet structure (sheets, dimensions, headers, samples, formulas, named ranges), CSV schemas with inferred types and sample rows, extracted PDF/Word/PowerPoint text. |
| `PACKAGE_MANIFEST.json` | always | Format version, every input path with category, size, SHA-256, inclusion decision and reason. Also which output file holds each input, truncation, redactions, extraction limitations, relationships, the export mapping and the validation results. |

On the bundled sample project (47 files in 8 languages, plus docs, data and a `node_modules`
folder), the output is **5 files, about 60 KB**.

---

## Quick start

Requires Node.js 20+ for the dev server, build and tests. The app has **zero runtime
dependencies** — `npm install` installs nothing.

```bash
npm run dev       # http://localhost:5173 — serves the source directly
npm test          # 66 automated tests (node:test)
npm run build     # production build to dist/ (verified)
npm run preview   # serve dist/ at http://localhost:4174
```

There is no bundler. The app uses native ES modules, so the source tree is the app. The build
copies it to `dist/` and then **verifies** it:

- every relative import resolves;
- every named import is actually exported by its target;
- no module imports from a remote URL or a bare package name;
- every module parses.

If any check fails, the build fails.

---

## Deploying to Netlify

`netlify.toml` is included. It builds with `npm run build`, publishes `dist/`, and sets security
headers.

**From Git:**

1. Push this folder to a GitHub/GitLab/Bitbucket repository.
2. In Netlify: **Add new site → Import an existing project** and select the repository.
3. Netlify reads `netlify.toml`, so leave the build settings as detected:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Click **Deploy**.

**Without Git (drag and drop):**

1. Run `npm run build`.
2. Open **app.netlify.com/drop** and drop the `dist/` folder.

> Drag-and-drop deploys do not read `netlify.toml`, so the CSP and other headers are **not**
> applied. To keep the no-network CSP, deploy from Git or with the Netlify CLI:
> `npx netlify-cli deploy --prod --dir=dist`.

**No SPA redirect is needed.** ContextForge is one page with no client-side routes.

**Content-Security-Policy** includes `connect-src 'none'`. The deployed page cannot make network
requests at all, so project content cannot leave the browser even through a bug.

---

## How packaging works

1. **Read.** Files are read locally through the File System Access API or the browser's folder
   input. Excluded folders (`node_modules`, `.git`, `dist`, `build`, `.venv`, caches…) are listed
   but not read.
2. **Classify.** Each file gets a language and category from a registry of 130+ extensions. Files
   in test folders, or with test filenames or test-framework imports, become **Test**. Manifests
   become **Dependency Metadata**. Encoding is detected (UTF-8, UTF-8 BOM, UTF-16, Windows-1252),
   and binary files are recognised by their bytes.
3. **Analyse.** Static analysis only — see *Supported formats* below. Relationships between files
   are resolved into a graph.
4. **Select.** The strategy and your manual choices decide what is included. A text budget
   decides how much fits.
5. **Generate.** The context files are built **once**, as logical records (id, name, intended
   path, content, original source paths, content type).
6. **Export.** A separate layer applies the layout you choose, resolves cross-file links for that
   layout, and writes the manifest. Switching layouts never re-runs analysis or generation.
7. **Validate.** At least 14 checks run on the actual output (below). ContextForge also re-reads
   and re-hashes the original files to confirm they are unchanged.

### Strategies

| Strategy | Includes | Excludes |
| --- | --- | --- |
| **Smart** (default) | Source, tests, configuration, dependency manifests, documentation, extracted documents, dataset **summaries**, unknown text formats | Dependencies, caches, build output, logs, duplicates, binaries, images (listed in the map), lock files, sensitive files |
| **Complete Context** | Everything Smart does, plus **full contents of small datasets** (< 200 KB) and large unknown-format text files | Same noise as Smart. Complete never blindly includes caches, dependencies or binaries. |
| **Minimal Context** | Entry points, all core source, tests with framework or reference evidence, dependency manifests, top-level or referenced configuration, root README and architecture/design docs | Other docs, data, nested unreferenced config |

The strategy changes the real package contents; the test suite checks this. **Your manual
include/exclude choices always override the strategy.**

### Content preservation and truncation

- Included source is copied **verbatim**, in a code fence long enough not to be broken by
  backticks inside the file. It is never summarised.
- Identical files (same SHA-256) are included once. The copy names the other paths.
- The **text budget** (default 4 MB) is filled in this order: entry points → core source → tests →
  configuration → documentation → data. When it runs out:
  - a file is **truncated** at a line boundary, with a `⚠ TRUNCATED — showing lines 1–N of M`
    notice; or
  - it is **omitted**.
  
  Either way it is listed in the overview and in the manifest's `truncation` and
  `omittedForBudget` fields. Nothing is silently dropped. Validation fails if it would be.
- The budget is a size, not an AI-service limit. Assistants have different file-size, file-count
  and context limits, and ContextForge doesn't claim the output fits any particular one.

### The manifest maps everything back

Each entry in `inputs[]` records:

- the original `path`, `sha256`, `category`, `status` and `included`, plus the `reason` if it was
  excluded;
- `contentMode` (`full` / `truncated` / `summary` / `omitted`);
- `outputFile`, the exact export path of the generated file that holds it, in the current layout;
- `secretsDetected`, `secretsRedacted` and any extraction limitation.

`export.files[]` maps each generated file's `logicalPath` to its `exportPath` and `exportName`,
with byte size and SHA-256.

---

## Export layouts

Choose a layout on the **Output** page. Switching rebuilds the export plan instantly from the
same generated content.

**Preserve Folder Structure** (default):

```
sample_project_ContextForge/
├── PROJECT_OVERVIEW.md
├── PACKAGE_MANIFEST.json
├── context/
│   ├── PROJECT_CONTENTS.md
│   └── DATA_AND_DOCUMENTS.md
└── maps/
    └── PROJECT_MAP.md
```

**Flat Files:** every file at one level. Folder segments are joined with `_`:

```
sample_project_ContextForge/
├── PROJECT_OVERVIEW.md
├── PACKAGE_MANIFEST.json
├── context_PROJECT_CONTENTS.md
├── context_DATA_AND_DOCUMENTS.md
└── maps_PROJECT_MAP.md
```

**Collisions.** Flat names are deterministic. If a name is already taken (compared
case-insensitively), a stable suffix is added: `src_config.json`, then `src_config__2.json`. A file
is never overwritten or dropped.

**Links.** Links between generated files are resolved for the chosen layout:
`../context/PROJECT_CONTENTS.md` in Preserve mode, `context_PROJECT_CONTENTS.md` in Flat mode.
The manifest's `outputFile` values match too.

### Downloading

- **Download** (each file): available in every browser. Uses a normal browser download with the
  file's export name.
- **Download All to Folder**: available where the File System Access API exists (Chrome, Edge and
  other Chromium browsers). You pick a destination, and ContextForge creates
  `<project>_ContextForge/` there and writes each file using the selected layout.
  - A file is reported as written only after its write stream has closed.
  - Partial failures are listed per file.

**Browser limitations:**

- A browser download cannot create sub-folders, so in Preserve mode each individual download is
  saved under its own filename. The intended folder is shown in the UI and recorded in the
  manifest. Use Download All to Folder, or Flat Files, if you need the layout on disk.
- Browsers may ask for permission, or block, when one page triggers many downloads. ContextForge
  never fires them all at once — each download starts from your click.
- ContextForge can't confirm that a standard browser download finished. It only reports that the
  download was handed to the browser.
- No ZIP or other archive is ever created.

---

## Supported formats

| Kind | Formats | What is extracted |
| --- | --- | --- |
| JavaScript / TypeScript | `.js .mjs .cjs .jsx .ts .tsx .mts .cts .vue .svelte` | imports, dynamic imports, re-exports, `require`, named/default exports, `module.exports`, functions, classes, data-file references, test frameworks. `.mjs` is treated as an ES module. |
| Python | `.py .pyw .pyi .ipynb` | imports, `from` and relative imports, classes, functions, `__main__` guard, docstring, data-file references. Notebook code and markdown cells (outputs omitted). |
| SQL | `.sql .ddl .psql` | tables created/altered, views, procedures/functions/triggers, indexes, referenced tables, joins, SELECT/INSERT/UPDATE/DELETE counts, likely dialect, migration detection, cross-file table usage |
| Web | `.html .htm .css .scss .sass .less` | scripts, stylesheets, images, links, forms, `@import` / `@use`, `url()` assets, custom properties |
| Other languages | Java, C#, C/C++, Go, Rust, PHP, Ruby, Kotlin, Swift, Dart, Scala, R, Lua, Perl, shell, PowerShell, Batch… | imports/includes/uses, functions, types. Content preserved verbatim. |
| Configuration | `.json .json5 .xml .yaml .yml .toml .ini .cfg .conf .config .env .properties`, Dockerfile, Makefile… | top-level keys, sections, structure, file references, Maven dependencies. `.env` contributes key **names** to the analysis. |
| Data | `.csv .tsv .jsonl .ndjson` | headers, inferred column types, row count, sample rows |
| Spreadsheets | `.xlsx .xlsm` | sheets and visibility, dimensions, headers, sample rows, formula counts and samples, named ranges, whether macros are present (never run) |
| Documents | `.docx .pptx .pdf .md .txt .rst` | Word headings, paragraphs and tables; PowerPoint slide text and speaker notes; PDF text (best-effort); Markdown headings and links |
| Images | `.png .jpg .gif .bmp .webp .svg …` | format and dimensions only. Image content is **not** interpreted, and no description is invented. |
| Legacy / binary | `.xls .doc .ppt`, archives, executables, databases | metadata only, with an explanation |
| **Unknown** | anything else | detected as text (included as plain text, flagged) or binary (listed with metadata, never silently dropped) |

You can add a format by registering a processor in `src/core/processors/index.js`. A processor is
an object with `name`, `priority`, `match(record)` and `process({record, bytes, text, config})`.

---

## Security and privacy

- **Local only.** Files are read in this browser tab. Nothing is uploaded, and there is no server,
  account, analytics or API key. The production CSP blocks all network connections.
- **Never executes anything.** Analysis uses regular expressions and container parsing only:
  - no JavaScript evaluation, no Python, no SQL;
  - no shell scripts, no package installs;
  - no Office macros (`vbaProject.bin` is detected, never opened).
  
  The test suite plants files that would set a flag if run, and confirms the flag is never set.
- **Read-only.** Original files are only read. After generation, the included files are re-read
  and re-hashed to confirm they are unchanged.
- **Safe output paths.** Every generated path is sanitised: no `..`, no absolute or drive paths,
  no characters that are illegal on Windows, and reserved names are escaped. Hostile input paths
  are normalised before use.
- **Safe rendering.** File contents are only ever shown with `textContent`. A build-time test
  forbids `innerHTML` assignments and `eval`/`new Function`.
- **Secrets.** Common credential shapes are detected:
  - private keys;
  - AWS, GitHub, Slack, Stripe, Google and `sk-` keys;
  - JWTs;
  - passwords in connection strings;
  - `password` / `secret` / `token` / `api_key` assignments.
  
  By default, detected values are replaced with `[REDACTED: type]` in the generated files, and
  every redaction is reported in the overview and manifest. The original file is unchanged.
  Sensitive files (`.env*`, keys, credential files) are excluded by default, but `.env.example` is
  not. Both behaviours can be switched off in Settings. **Detection is pattern-based and cannot be
  guaranteed complete — review the output before sharing it.**
- **Storage.** Only *settings* are stored, in `localStorage`. Project content stays in memory and
  is discarded when you close the project or the tab.
- **Resource limits.** Per-file size limits apply to source and to documents. Files over the hash
  limit are not read at all. ZIP decompression is capped per entry (zip-bomb guard).

---

## Validation

These checks are computed from the generated output — results are never assumed:

| Check | Fails when |
| --- | --- |
| Output filenames are safe | any path would traverse, is absolute, or contains illegal characters |
| No duplicate output paths | two outputs collide (case-insensitive) |
| Flat Files layout has no folders / Folder structure preserved | the layout was not applied |
| Manifest is valid JSON | the manifest doesn't parse |
| Every generated file is in the manifest | a file is missing or unknown |
| File sizes and counts are accurate | recorded bytes ≠ actual bytes |
| Manifest maps every input to its output | an input is missing or points at a non-existent file |
| Markdown is structurally valid | there is no heading, a code fence is unclosed, or a link token is unresolved |
| Every referenced output exists | an internal link is broken |
| No source content duplicated | a source section appears twice |
| Source references are consistent | an included file's section is missing from its output file |
| Truncation and omissions are reported | a truncated or omitted file is missing from the overview or manifest |
| Extraction failures are reported | a failed file is missing from the manifest |
| Every exclusion has a reason | an excluded file has no reason |
| Original files unchanged (UI) | re-reading an included file gives a different hash |

---

## Known limitations

- **Static analysis.** Relationships come from patterns, not a full parser for each language.
  Unusual import styles, build-tool aliases and dynamic loading may show up as *Unknown*, or not
  at all. Python is parsed line by line, because no Python AST is available in the browser.
- **PDF extraction is best-effort.** It handles uncompressed and Flate-compressed text streams.
  Encrypted PDFs, scanned PDFs (no OCR) and some CID/Type0 font encodings give little or no text.
  This is reported as a limitation, never hidden.
- **Legacy Office files** (`.xls`, `.doc`, `.ppt`) are recorded as metadata only. Save them as
  `.xlsx` / `.docx` / `.pptx` to include their content.
- **YAML** keys are found by an indentation scan, so anchors and complex YAML structures are not
  interpreted.
- **Browser support.** Selecting a folder needs Chromium (File System Access) or a browser that
  supports `<input webkitdirectory>` (current Firefox and Safari). Other browsers can only select
  individual files.
- **Large selections.** With `<input webkitdirectory>`, the browser lists every file — including
  inside `node_modules` — before ContextForge can skip them. The File System Access path skips
  excluded folders without listing them.
- **Secret detection is not complete**, and the UI says so.

---

## Project layout

```
index.html              app shell
public/favicon.svg      wordmark icon
src/main.js             UI (vanilla JS, textContent-only rendering)
src/styles.css          dark theme
src/core/
  registry.js           extension → language/category, test & entry-point detection
  encoding.js           BOM/UTF-8/UTF-16/Windows-1252 detection, binary sniffing
  gitignore.js          .gitignore matcher (exclusion signal)
  analysis.js           scan pipeline: read, hash, classify, process, duplicates, entry points
  processors/           pluggable per-format static analysers
  zipreader.js          read-only OOXML container reader
  dependencies.js       relationship graph with Direct/Likely/Unknown confidence
  secrets.js            credential detection and redaction
  packager.js           strategies, overrides, budget planning
  generator.js          builds the logical context files once
  exporter.js           Preserve/Flat layouts, link resolution, manifest
  validation.js         output validation
  search.js             in-memory search
  sources.js            browser folder/file/drag-drop adapters
  download.js           individual downloads, Download All to Folder
scripts/build.mjs       verified production build
scripts/serve.mjs       local static server (dev / dist preview)
tests/                  node:test suites + helpers
sample_project/         synthetic multi-language test project (never executed)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design notes and what changed from the original
Python application.
