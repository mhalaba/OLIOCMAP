import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNodeKeyPair, privateKeyFromB64, publicKeyFromB64, signRow, verifyRow } from "../../shared/sign.mjs";
import { canonicalJson } from "../../shared/canonical.mjs";

test("kanoniczny JSON + Ed25519 round-trip", () => {
  const keys = generateNodeKeyPair();
  const priv = privateKeyFromB64(keys.privateB64);
  const pub = publicKeyFromB64(keys.publicB64);
  const row = {
    id: "018f0a000000700080000000000001",
    source_node: "bytom-01",
    hlc: "1700000000000-0001-bytom-01",
    title: "AED",
    category: "aed",
    field_hlc: { title: "1700000000000-0001-bytom-01" },
  };
  const a = canonicalJson(row);
  const b = canonicalJson({ category: "aed", title: "AED", ...row });
  assert.equal(a, b);
  const sig = signRow(row, priv);
  assert.equal(verifyRow(row, pub, sig), true);
  assert.equal(verifyRow({ ...row, title: "X" }, pub, sig), false);
});
