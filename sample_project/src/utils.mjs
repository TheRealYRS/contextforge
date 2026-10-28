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
