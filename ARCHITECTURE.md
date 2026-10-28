# Architecture

## Why the stack changed

The original **Copilot Project Packager** was a Python and Streamlit application. It read the
local filesystem with `os.scandir`, stored history in SQLite, and wrote a full copy of the
project (`source/`, `tests/`…) plus an optional ZIP. A static Netlify site can't run any of that:
it has no Python process, no server, and no filesystem access.

ContextForge therefore runs as a **static, client-side application**:

| Concern | Before (Python) | Now (browser) |
| --- | --- | --- |
| UI | Streamlit, 9 tabs | Vanilla ES modules: Home → workspace (Overview, Review files, Package, Output) |
| File access | `os.scandir` on a path | File System Access API, `<input webkitdirectory>`, drag-and-drop |
| Python analysis | `ast.parse` | Line-oriented static parser (no Python runtime in the browser) |
| Excel / Word | openpyxl, python-docx | Built-in read-only ZIP reader + Office XML parsing (`DecompressionStream`) |
| PDF | PyMuPDF | Best-effort extractor for Flate/uncompressed text streams |
| Hashing | `hashlib` | `crypto.subtle.digest('SHA-256')` |
| Output | Full project copy + 8 docs + optional ZIP | 2–5 generated context files (plus content parts if large), no copy, no archive |
| Layout | Fixed bucket folders | Export layer: Preserve Folder Structure or Flat Files |
| History | SQLite | None. Only settings are kept, in `localStorage`. |
| Tests | pytest + Streamlit AppTest | `node:test` on the same core modules, plus a DOM-shim render test |

No framework or bundler was added. The core is plain ES modules that run unchanged in the
browser and in Node, so the tests exercise exactly the code that ships.

## What was reused

Most of the logic was **ported**, not reinvented:

- **Extension registry** — the 118 original entries, extended with `.ipynb`, `.feature`, `.robot`,
  `.prisma`, `.tf` and more.
- **Classification**, including category assignment, test-path and test-framework detection, and
  entry-point names.
- **Exclusion defaults** — directories and patterns.
- **The `.gitignore` matcher.**
- **Duplicate detection** with the "keeper" ranking. Copies in backup, old or vendor folders lose.
- **The dependency resolver** and its confidence model (Direct/Likely/Unknown, external modules
  never invented as files). It now also links SQL files that use tables created by migrations.
- **Each processor's extraction targets** (imports, exports, SQL objects, CSV headers, sheet
  structure…).
- **Path sanitisation**: traversal, drive letters, Windows-illegal characters, reserved names.
- **The "detected vs inferred" labelling discipline.**
- **The sample project**, extended with TypeScript, Java, Go, a SQL migration, a notebook, a
  Gherkin feature, PPTX, JSONL, a secret, a `.env` file and a binary unknown format.

## What was removed, and why

| Removed | Why |
| --- | --- |
| Full project copy (`source/`, `tests/`, `config/`…) | The output must be the context files themselves, not a duplicate of the project |
| ZIP export | Forbidden by the new requirements |
| `PROJECT_INDEX.md`, `PROJECT_CONTEXT.md`, `DEPENDENCY_GRAPH.md`, `EXCLUSIONS.md`, `CODE_SUMMARIES.md`, `FILE_MANIFEST.csv`, `COPILOT_PROMPTS.md` | Merged into fewer, denser files: the overview, the map and the JSON manifest. Per-file summaries were redundant next to the verbatim source. The prompt file was provider-specific. |
| SQLite project history, incremental diff packs, multi-package split | They need persistent storage of project metadata. The content-split into parts covers large projects within a single package. |
| CLI | Not applicable to a static web app. The core can still be driven from Node, as the tests do. |
| Copilot branding | The product is now provider-independent |

## Data flow

```
entries [{path, size, read()}]        ← sources.js (browser) / tests/helpers.mjs (Node)
   │ prepareEntries: normalise paths, strip chosen root folder, disambiguate duplicates
   ▼
analysis.js
   1 read     excluded dirs skipped unread · hash · encoding · decode
   2 process  processors/* → analysis{} · secret scan
   ·          test refinement · duplicate grouping
   3 graph    dependencies.js → relationships[]
   ·          entry points · rule reasons (noise, sensitive, lock files, unknown binary, large)
   ▼
packager.js  applyStrategy (overrides win) · planContent (tiers + budget → full|truncated|summary|omitted)
   ▼
generator.js  logical files: overview, contents(+parts), map?, data?   ← built ONCE
   ▼
exporter.js   layout → export paths · resolve {{link:id}} · manifest
   ▼
validation.js 14 checks on the export plan (+ originals re-hash in the UI)
   ▼
download.js   individual download · Download All to Folder
```

### Separating packaging from layout

The generator writes cross-file links as `{{link:<id>}}` tokens and never decides final
filenames. `exporter.planLayout(files, layout)` maps logical ids to export paths deterministically,
handling collisions case-insensitively. `resolveLinks` then rewrites the tokens relative to each
file's own export location.

`pipeline.exportFor(project, generation, config, layout)` re-exports an existing generation. The
UI calls it when you flip the layout toggle, so analysis and generation never re-run. A test
confirms the generated content is identical across layouts apart from link targets.

### Manifest and validation ordering

The manifest needs the export filenames and the validation results, but validation also checks
the manifest. `exportFor` resolves this in three steps:

1. Build a draft export (manifest without results) and validate it.
2. Rebuild the export with those results embedded.
3. Validate the final export again, including re-parsing the manifest.

The manifest states that its embedded results come from the pre-finalisation pass.

### Responsiveness

Analysis yields to the event loop every 10 files and reports real counts per stage. Cancel sets a
flag that is checked between files. The File System Access walker doesn't descend into excluded
folders.
