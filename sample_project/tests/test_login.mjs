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
