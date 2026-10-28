# PROJECT CONTENTS

Original project content for **sample_project**, grouped by role. Every section heading is the file's original relative path. Content is verbatim unless a notice says it was truncated or redacted.

Start with [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) and [PROJECT_MAP.md](maps_PROJECT_MAP.md).

**Files in this part**

- `index.html`
- `services/go/main.go`
- `src/app.js`
- `src/parser.py`
- `db/migrations/001_create_users.sql`
- `notebooks/analysis.ipynb`
- `scripts.sh`
- `services/java/UserService.java`
- `src/__init__.py`
- `src/api.js`
- `src/constants.mjs`
- `src/loader.py`
- `src/queries.sql`
- `src/scenario.ts`
- `src/types.ts`
- `src/utils.mjs`
- `styles.css`
- `theme.css`
- `tools.ps1`
- `tests/login.feature`
- `tests/test_data.py`
- `tests/test_login.mjs`
- `.env.example`
- `.gitignore`
- `config/config.json`
- `config/settings.yaml`
- `package.json`
- `requirements.txt`
- `docs/architecture.md`
- `docs/legacy_notes.txt`
- `docs/README.md`
- `README.md`
- `data/custom.xyz`

---
## Entry points

### `index.html`

<sub>Source Code · HTML · 14 lines · 301 B · sha256 4da86db6b7a1</sub>

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sample Test Framework</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="root"></div>
  <img src="assets/logo.png" alt="logo" />
  <script type="module" src="src/app.js"></script>
</body>
</html>
```
### `services/go/main.go`

<sub>Source Code · Go · 14 lines · 211 B · sha256 6d277616b8b3</sub>

```go
package main

import (
	"fmt"
	"net/http"
)

func health(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "ok") }

func main() {
	http.HandleFunc("/health", health)
	http.ListenAndServe(":8080", nil)
}
```
### `src/app.js`

<sub>Source Code · JavaScript · 13 lines · 321 B · sha256 a4a1621e2e67</sub>

```javascript
// Sample application entry point.
import { readConfig, normalizeData } from "./utils.mjs";
import { fetchUsers } from "./api.js";

const config = readConfig("../config/config.json");

export async function main() {
  const users = await fetchUsers(config.apiBase);
  return normalizeData(users);
}

export default main;
```
### `src/parser.py`

<sub>Source Code · Python · 29 lines · 574 B · sha256 e7de31c35df2</sub>

```python
"""Parses scenario spreadsheets into normalized records."""
import csv
import json
from pathlib import Path

from .loader import load_rows


class ScenarioParser:
    """Parses scenario rows into dictionaries."""

    def __init__(self, source: str):
        self.source = source

    def parse(self):
        return [self._row(r) for r in load_rows(self.source)]

    def _row(self, row):
        return {"id": row[0], "title": row[1]}


def main():
    parser = ScenarioParser("data/data.csv")
    print(json.dumps(parser.parse()))


if __name__ == "__main__":
    main()
```
## Core source

### `db/migrations/001_create_users.sql`

<sub>Source Code · SQL · 12 lines · 310 B · sha256 3eeb86e3939c</sub>

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL
);
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    ended_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```
### `notebooks/analysis.ipynb`

<sub>Source Code · Jupyter Notebook · 2 lines · 306 B · sha256 eb8ba231a14e</sub>

_Jupyter notebook: 1 code cell(s), 1 markdown cell(s). Outputs omitted._

# Scenario analysis

```python
import pandas as pd
df = pd.read_csv('data/data.csv')
df.groupby('priority').size()
```
### `scripts.sh`

<sub>Source Code · Shell · 3 lines · 28 B · sha256 9435b1efd0b5</sub>

```bash
#!/bin/sh
echo "build step"
```
### `services/java/UserService.java`

<sub>Source Code · Java · 13 lines · 275 B · sha256 7c26116f0e4e</sub>

```java
package com.example.users;

import java.util.List;
import java.util.ArrayList;

public class UserService {
    private final List<String> users = new ArrayList<>();

    public void addUser(String name) { users.add(name); }

    public int count() { return users.size(); }
}
```
### `src/__init__.py`

<sub>Source Code · Python · 0 B · sha256 e3b0c44298fc</sub>

```python

```
### `src/api.js`

<sub>Source Code · JavaScript · 9 lines · 209 B · sha256 0d61e8152ba2</sub>

```javascript
const https = require("https");
const { DEFAULTS } = require("./constants.mjs");

function fetchUsers(base) {
  return Promise.resolve([{ id: 1, name: "Ada " }]);
}

module.exports = { fetchUsers, DEFAULTS };
```
### `src/constants.mjs`

<sub>Source Code · JavaScript ES Module · 2 lines · 74 B · sha256 24eda7258761</sub>

```javascript
export const DEFAULTS = { apiBase: "http://localhost:3000", retries: 3 };
```
### `src/loader.py`

<sub>Source Code · Python · 8 lines · 152 B · sha256 030567095aa0</sub>

```python
import csv
from pathlib import Path


def load_rows(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.reader(fh))
```
### `src/queries.sql`

<sub>Source Code · SQL · 16 lines · 459 B · sha256 3e61c549ebe0</sub>

```sql
-- Reporting queries for the scenario database.
CREATE VIEW active_users AS
SELECT u.id, u.name
FROM users u
INNER JOIN sessions s ON s.user_id = u.id
WHERE s.ended_at IS NULL;

INSERT INTO users (name, email) VALUES ('Ada', 'ada@example.com');
UPDATE users SET name = 'Ada L' WHERE id = 1;
DELETE FROM sessions WHERE ended_at < '2020-01-01';

SELECT u.name, COUNT(s.id) AS session_count
FROM users u
LEFT JOIN sessions s ON s.user_id = u.id
GROUP BY u.name;
```
### `src/scenario.ts`

<sub>Source Code · TypeScript · 2 lines · 74 B · sha256 00ba73a0bf2f</sub>

```typescript
export interface Scenario { id: number; title: string; priority: string }
```
### `src/types.ts`

<sub>Source Code · TypeScript · 6 lines · 208 B · sha256 085c9eaf8335</sub>

```typescript
import type { Scenario } from "./scenario";

export interface User { id: number; name: string }
export type Priority = "High" | "Medium" | "Low";
export const isHigh = (p: Priority): boolean => p === "High";
```
### `src/utils.mjs`

<sub>Source Code · JavaScript ES Module · 13 lines · 350 B · sha256 8fdf6c2bd7f8</sub>

```javascript
// Utility module used by the application.
import fs from "fs";
import { DEFAULTS } from "./constants.mjs";

export function readConfig(path) {
  const raw = fs.readFileSync(path, "utf-8");
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

export function normalizeData(rows) {
  return rows.map((r) => ({ id: r.id, name: String(r.name).trim() }));
}
```
### `styles.css`

<sub>Source Code · CSS · 6 lines · 166 B · sha256 8b15a3dbec40</sub>

```css
@import "theme.css";

:root { --brand: #7c5cff; }
body { font-family: system-ui, sans-serif; }
#root { padding: 24px; background: url("assets/logo.png") no-repeat; }
```
### `theme.css`

<sub>Source Code · CSS · 2 lines · 31 B · sha256 1c7cf8d45709</sub>

```css
.dark { background: #0d1117; }
```
### `tools.ps1`

<sub>Source Code · PowerShell · 4 lines · 67 B · sha256 67a95860924c</sub>

```powershell
# PowerShell helper
Import-Module ./tools.psm1
Write-Output "done"
```
## Tests

### `tests/login.feature`

<sub>Test · Gherkin · 6 lines · 156 B · sha256 e10a949eaf99</sub>

```gherkin
Feature: Login
  Scenario: Valid credentials
    Given the user is on the login page
    When they submit valid credentials
    Then they see the dashboard
```
### `tests/test_data.py`

<sub>Test · Python · 17 lines · 282 B · sha256 a5cdad3b5387</sub>

```python
import pytest

from src.parser import ScenarioParser


@pytest.fixture
def parser():
    return ScenarioParser("data/data.csv")


def test_parser_reads_rows(parser):
    assert parser.source == "data/data.csv"


def test_parser_class_exists():
    assert ScenarioParser is not None
```
### `tests/test_login.mjs`

<sub>Test · JavaScript ES Module · 13 lines · 360 B · sha256 4f658755f496</sub>

```javascript
import { test } from "node:test";
import assert from "node:assert";
import main from "../src/app.js";
import { normalizeData } from "../src/utils.mjs";

test("normalizeData trims names", () => {
  assert.equal(normalizeData([{ id: 1, name: " Ada " }])[0].name, "Ada");
});

test("main returns rows", async () => {
  assert.ok(Array.isArray(await main()));
});
```
## Configuration

### `.env.example`

<sub>Configuration · Dotenv · 2 lines · 26 B · sha256 ec9205453ac6</sub>

```
API_KEY=your-api-key-here
```
### `.gitignore`

<sub>Configuration · Git Ignore · 5 lines · 32 B · sha256 d65c8eb4a5f4</sub>

```
build/
*.log
__pycache__/
dist/
```
### `config/config.json`

<sub>Configuration · JSON · 7 lines · 140 B · sha256 bd13080d4dc9</sub>

```json
{
  "apiBase": "https://api.example.com",
  "retries": 5,
  "dataFile": "data/data.csv",
  "features": { "login": true, "export": false }
}
```

_Identical content also exists at: `backup/config.json` (not repeated)._
### `config/settings.yaml`

<sub>Configuration · YAML · 9 lines · 144 B · sha256 d1c4eabf4a9d</sub>

> 🔒 1 detected secret value(s) redacted (Credential assignment). The original file is unchanged.

```yaml
environment: staging
database:
  host: localhost
  port: 5432
  password: [REDACTED: Credential assignment]
artifacts:
  - data/data.csv
  - config/config.json
```
### `package.json`

<sub>Dependency Metadata · JSON · 11 lines · 326 B · sha256 48a5ed65b63f</sub>

```json
{
  "name": "sample-test-framework",
  "version": "1.2.0",
  "type": "module",
  "description": "Demonstration project for ContextForge.",
  "main": "src/app.js",
  "scripts": { "test": "node --test tests/", "start": "node src/app.js" },
  "dependencies": { "dotenv": "^16.0.0" },
  "devDependencies": { "jest": "^29.0.0" }
}
```
### `requirements.txt`

<sub>Dependency Metadata · Plain Text · 4 lines · 42 B · sha256 aa30883a343f</sub>

```
pandas>=2.0.0
openpyxl==3.1.5
pytest>=8.0
```
## Documentation

### `docs/architecture.md`

<sub>Documentation · Markdown · 5 lines · 164 B · sha256 badb91cf3673</sub>

```markdown
# Architecture

`src/app.js` is the entry point. It imports `src/utils.mjs` for helpers and
`src/api.js` for network access. Python components parse scenario data.
```
### `docs/legacy_notes.txt`

<sub>Documentation · Plain Text · 3 lines · 47 B · sha256 070d5380c829</sub>

```
Café notes – naïve encoding test
Second line
```
### `docs/README.md`

<sub>Documentation · Markdown · 12 lines · 250 B · sha256 9588d7e65798</sub>

```markdown
# Sample Test Framework

A small mixed-language demonstration project used to exercise ContextForge end to end.

## Layout

- `src/` - application source
- `tests/` - test suite
- `db/` - schema migrations

See [architecture notes](architecture.md).
```
### `README.md`

<sub>Documentation · Markdown · 4 lines · 69 B · sha256 623acf79ab75</sub>

```markdown
# Sample Test Framework

Root readme. See docs/README.md for detail.
```
## Other

### `data/custom.xyz`

<sub>Unknown · Unknown (text) · 3 lines · 30 B · sha256 90a09fc12342</sub>

```
weird custom payload
line two
```
