import test from "node:test";
import assert from "node:assert/strict";
import { formatPercent } from "../src/format.js";

test("formatPercent keeps tiny non-zero shares distinct from zero", () => {
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(0.0017), "<1%");
  assert.equal(formatPercent(0.25), "25%");
});
