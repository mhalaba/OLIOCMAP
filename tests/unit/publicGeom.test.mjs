import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publicCoords, round2 } from "../../shared/publicGeom.mjs";

test("precise kopiuje, hidden zeruje, gmina jitter deterministyczny", () => {
  const id = "abc";
  const hash = createHash("sha256").update(id).digest("hex");
  const a = publicCoords(id, 50.35123, 18.91789, "gmina", hash);
  const b = publicCoords(id, 50.35123, 18.91789, "gmina", hash);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.public_lat - round2(50.35123)) <= 0.005 + 1e-12);
  assert.ok(Math.abs(a.public_lon - round2(18.91789)) <= 0.005 + 1e-12);
  const p = publicCoords(id, 50.35, 18.91, "precise", hash);
  assert.equal(p.public_lat, 50.35);
  const h = publicCoords(id, 50.35, 18.91, "hidden", hash);
  assert.equal(h.public_lat, null);
});
