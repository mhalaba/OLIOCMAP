import { test } from "node:test";
import assert from "node:assert/strict";
import { tickHlc, compareHlc, parseHlc, formatHlc } from "../../shared/hlc.mjs";

test("HLC monotoniczny przy cofnięciu zegara", () => {
  let s = { lastMs: 2000, counter: 3 };
  const a = tickHlc(s, "n1", 1000);
  assert.equal(a.lastMs, 2000);
  assert.equal(a.counter, 4);
  const b = tickHlc({ lastMs: a.lastMs, counter: a.counter }, "n1", 500);
  assert.ok(compareHlc(a.hlc, b.hlc) < 0);
});

test("HLC idzie do przodu z zegarem", () => {
  const a = tickHlc({ lastMs: 100, counter: 9 }, "n1", 5000);
  assert.equal(a.lastMs, 5000);
  assert.equal(a.counter, 0);
  assert.ok(parseHlc(a.hlc));
  assert.equal(formatHlc(1, 1, "x").length > 10, true);
});
