# PROJECT MAP

Structure, entry points and relationships for **sample_project**. Links point to the section of the generated file that holds each file's content.

### Directory structure

```text
sample_project/
├── assets/
│   └── logo.png  ·excluded
├── backup/
│   └── config.json  ·excluded
├── config/
│   ├── config.json
│   └── settings.yaml
├── data/
│   ├── custom.xyz
│   ├── data.csv
│   ├── events.jsonl
│   ├── recording.qqq  ·excluded
│   └── scenarios.xlsx
├── db/
│   └── migrations/
│       └── 001_create_users.sql
├── docs/
│   ├── architecture.md
│   ├── legacy_notes.txt
│   ├── overview.pptx
│   ├── README.md
│   ├── requirements.pdf
│   └── test_plan.docx
├── notebooks/
│   └── analysis.ipynb
├── services/
│   ├── go/
│   │   └── main.go
│   └── java/
│       └── UserService.java
├── src/
│   ├── __init__.py
│   ├── api.js
│   ├── app.js
│   ├── constants.mjs
│   ├── loader.py
│   ├── parser.py
│   ├── queries.sql
│   ├── scenario.ts
│   ├── types.ts
│   └── utils.mjs
├── tests/
│   ├── login.feature
│   ├── test_data.py
│   └── test_login.mjs
├── .env  ·excluded
├── .env.example
├── .gitignore
├── app.log  ·excluded
├── index.html
├── package.json
├── README.md
├── requirements.txt
├── scripts.sh
├── styles.css
├── theme.css
└── tools.ps1
```

### Most-referenced files _(inferred from project structure)_

| File | Referenced by |
| --- | --- |
| [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) | 5 file(s) |
| [`src/app.js`](../context/PROJECT_CONTENTS.md) | 2 file(s) |
| `assets/logo.png` | 2 file(s) |
| [`src/constants.mjs`](../context/PROJECT_CONTENTS.md) | 2 file(s) |
| [`src/utils.mjs`](../context/PROJECT_CONTENTS.md) | 2 file(s) |
| [`db/migrations/001_create_users.sql`](../context/PROJECT_CONTENTS.md) | 2 file(s) |
| [`docs/architecture.md`](../context/PROJECT_CONTENTS.md) | 1 file(s) |
| [`styles.css`](../context/PROJECT_CONTENTS.md) | 1 file(s) |
| [`src/api.js`](../context/PROJECT_CONTENTS.md) | 1 file(s) |
| [`config/config.json`](../context/PROJECT_CONTENTS.md) | 1 file(s) |
| [`src/loader.py`](../context/PROJECT_CONTENTS.md) | 1 file(s) |
| [`src/scenario.ts`](../context/PROJECT_CONTENTS.md) | 1 file(s) |

### Relationships

| From | Kind | To | Confidence |
| --- | --- | --- | --- |
| `backup/config.json` | reference | [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) | Direct |
| [`config/config.json`](../context/PROJECT_CONTENTS.md) | reference | [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) | Direct |
| [`config/settings.yaml`](../context/PROJECT_CONTENTS.md) | reference | [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) | Direct |
| [`docs/README.md`](../context/PROJECT_CONTENTS.md) | reference | [`docs/architecture.md`](../context/PROJECT_CONTENTS.md) | Direct |
| [`index.html`](../context/PROJECT_CONTENTS.md) | script | [`src/app.js`](../context/PROJECT_CONTENTS.md) | Direct |
| [`index.html`](../context/PROJECT_CONTENTS.md) | stylesheet | [`styles.css`](../context/PROJECT_CONTENTS.md) | Direct |
| [`index.html`](../context/PROJECT_CONTENTS.md) | link | `assets/logo.png` | Direct |
| [`src/api.js`](../context/PROJECT_CONTENTS.md) | require | [`src/constants.mjs`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/app.js`](../context/PROJECT_CONTENTS.md) | import | [`src/utils.mjs`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/app.js`](../context/PROJECT_CONTENTS.md) | import | [`src/api.js`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/app.js`](../context/PROJECT_CONTENTS.md) | reads | [`config/config.json`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/parser.py`](../context/PROJECT_CONTENTS.md) | import | [`src/loader.py`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/parser.py`](../context/PROJECT_CONTENTS.md) | reads | [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) | Direct |
| [`src/types.ts`](../context/PROJECT_CONTENTS.md) | import | [`src/scenario.ts`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/utils.mjs`](../context/PROJECT_CONTENTS.md) | import | [`src/constants.mjs`](../context/PROJECT_CONTENTS.md) | Direct |
| [`styles.css`](../context/PROJECT_CONTENTS.md) | import | [`theme.css`](../context/PROJECT_CONTENTS.md) | Direct |
| [`styles.css`](../context/PROJECT_CONTENTS.md) | asset | `assets/logo.png` | Direct |
| [`tests/test_data.py`](../context/PROJECT_CONTENTS.md) | import | [`src/parser.py`](../context/PROJECT_CONTENTS.md) | Direct |
| [`tests/test_data.py`](../context/PROJECT_CONTENTS.md) | reads | [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) | Direct |
| [`tests/test_login.mjs`](../context/PROJECT_CONTENTS.md) | import | [`src/app.js`](../context/PROJECT_CONTENTS.md) | Direct |
| [`tests/test_login.mjs`](../context/PROJECT_CONTENTS.md) | import | [`src/utils.mjs`](../context/PROJECT_CONTENTS.md) | Direct |
| [`src/queries.sql`](../context/PROJECT_CONTENTS.md) | uses-table | [`db/migrations/001_create_users.sql`](../context/PROJECT_CONTENTS.md) | Likely |
| [`src/queries.sql`](../context/PROJECT_CONTENTS.md) | uses-table | [`db/migrations/001_create_users.sql`](../context/PROJECT_CONTENTS.md) | Likely |

### Tests → code they reference

| Test | References |
| --- | --- |
| [`tests/test_data.py`](../context/PROJECT_CONTENTS.md) | [`src/parser.py`](../context/PROJECT_CONTENTS.md), [`data/data.csv`](../context/DATA_AND_DOCUMENTS.md) |
| [`tests/test_login.mjs`](../context/PROJECT_CONTENTS.md) | [`src/app.js`](../context/PROJECT_CONTENTS.md), [`src/utils.mjs`](../context/PROJECT_CONTENTS.md) |

### SQL objects

| File | Creates | Views/procs | Uses | Migration |
| --- | --- | --- | --- | --- |
| [`db/migrations/001_create_users.sql`](../context/PROJECT_CONTENTS.md) | sessions, users |  | users | yes |
| [`src/queries.sql`](../context/PROJECT_CONTENTS.md) |  | active_users | sessions, users |  |

### Assets (not interpreted)

| File | Format | Dimensions |
| --- | --- | --- |
| `assets/logo.png` | PNG | 24×16 |
