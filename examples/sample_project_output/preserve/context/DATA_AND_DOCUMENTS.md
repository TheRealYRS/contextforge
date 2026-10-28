# DATA AND DOCUMENTS

Structured information extracted from datasets, spreadsheets and documents in **sample_project**. Datasets are summarised (schema + samples) rather than dumped; document text is extracted where the format allows.

See [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) for context.

---

### `docs/test_plan.docx`

<sub>Office Document · Word Document · 36.0 KB · sha256 b8d817df85fa</sub>

Word document · 4 paragraph(s) · 1 table(s) _(detected from source)_

<details open><summary>Extracted text</summary>

#### Test Plan
Scope of the sample test framework.
#### Approach
Automated regression across login flows.

| Area | Owner |
| --- | --- |
| Login | QA |

</details>

### `data/data.csv`

<sub>Data · CSV · 186 B · sha256 1c20d2337ce4</sub>

Delimited data · delimiter `,` · 4 column(s) · 4 data row(s) _(detected from source)_

| Column | Inferred type |
| --- | --- |
| id | integer |
| scenario | text |
| expected | text |
| priority | text |

Sample rows:

| id | scenario | expected | priority |
| --- | --- | --- | --- |
| 1 | Login with valid credentials | success | High |
| 2 | Login with invalid password | error | High |
| 3 | Password reset flow | email sent | Medium |
| 4 | Session timeout | redirect | Low |

_Summary only — the full dataset is not included (Smart/Minimal strategy). Use Complete Context or include it manually for full rows._

### `data/events.jsonl`

<sub>Data · JSON Lines · 48 B · sha256 f9210392c3a0</sub>

JSON Lines dataset · 2 record(s).

First record shape:

```json
{
  "id": "number",
  "step": "string"
}
```

### `data/scenarios.xlsx`

<sub>Spreadsheet · Excel Workbook · 5.4 KB · sha256 7d4989ce29fb</sub>

Workbook with **2** sheet(s), **1** formula cell(s). _(detected from source)_

**Named ranges:** `ScenarioIds` → `Scenarios!$A$2:$A$4`

#### Sheet: Scenarios

Dimension `A1:D4` · 4 row(s) · 0 formula(s)

| ID | Scenario | Expected | Priority |
| --- | --- | --- | --- |
| 1 | Login valid | success | High |
| 2 | Login invalid | error | High |
| 3 | Reset | email | Medium |

#### Sheet: Summary

Dimension `A1:B2` · 2 row(s) · 1 formula(s)

| Metric | Value |
| --- | --- |
| Total | =COUNTA(Scenarios!A2:A100) |

Sample formulas:
- `B2: =COUNTA(Scenarios!A2:A100)`

### `docs/overview.pptx`

<sub>Office Document · PowerPoint · 32.2 KB · sha256 dbfe4cd206cd</sub>

PowerPoint · 1 slide(s) _(detected from source)_

<details open><summary>Extracted text</summary>

### Slide 1: Release Overview
- Login regression complete
- Password reset in progress

_Speaker notes:_ Mention timeline risk.

</details>

### `docs/requirements.pdf`

<sub>PDF · PDF · 998 B · sha256 84203f0180fc</sub>

PDF · 1 page(s) · text extraction is best-effort _(detected from source)_

<details open><summary>Extracted text</summary>

Requirements Specification

The login module must support password reset.

</details>
