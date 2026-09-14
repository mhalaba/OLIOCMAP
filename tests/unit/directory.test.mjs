import { test } from "node:test";
import assert from "node:assert/strict";
import { advertisedNodes, isVouchedOnly, mergeDirectory, originKeys } from "../../shared/directory.mjs";

test("ogłaszamy siebie i tylko zaufanych sąsiadów z kluczem", () => {
  const out = advertisedNodes({
    selfId: "a",
    publicKey: "KA",
    baseUrl: "http://a",
    role: "node",
    peers: [
      { node_id: "b", trusted: true, public_key: "KB", base_url: "http://b" },
      { node_id: "c", trusted: false, public_key: "KC" },
      { node_id: "d", trusted: true, public_key: "" },
    ],
  });
  assert.deepEqual(
    out.map((n) => n.node_id),
    ["a", "b"]
  );
});

test("nieznany węzeł trafia do peers jako niezaufany z kluczem i notatką", () => {
  const r = mergeDirectory([], [{ node_id: "c", public_key: "KC", base_url: "http://c" }], "b", "a");
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].trusted, false);
  assert.equal(r.inserts[0].public_key, "KC");
  assert.match(r.inserts[0].note, /poznany przez b/);
});

test("pomijamy siebie i ogłaszającego; zły node_id odpada", () => {
  const r = mergeDirectory([], [{ node_id: "a" }, { node_id: "b" }, { node_id: "../x" }], "b", "a");
  assert.equal(r.inserts.length, 0);
});

test("TOFU: inny klucz dla znanego węzła to alert, nie nadpisanie", () => {
  const local = [{ id: "1", node_id: "c", public_key: "KC", base_url: "" }];
  const r = mergeDirectory(local, [{ node_id: "c", public_key: "EVIL" }], "b", "a");
  assert.equal(r.updates.length, 0);
  assert.equal(r.alerts.length, 1);
});

test("brakujący klucz albo adres jest uzupełniany", () => {
  const local = [{ id: "1", node_id: "c", public_key: "", base_url: "" }];
  const r = mergeDirectory(local, [{ node_id: "c", public_key: "KC", base_url: "http://c" }], "b", "a");
  assert.deepEqual(r.updates, [{ id: "1", node_id: "c", public_key: "KC", base_url: "http://c" }]);
});

test("do weryfikacji pochodzenia bierzemy tylko klucze węzłów zaufanych wprost", () => {
  const peers = [
    { node_id: "b", trusted: true, public_key: "KB" },
    { node_id: "c", trusted: false, public_key: "KC-poreczony-przez-b" },
    { node_id: "d", trusted: true, public_key: "" },
  ];
  const keys = originKeys(peers, "a", "KA");
  assert.equal(keys.get("b"), "KB");
  assert.equal(keys.get("a"), "KA");
  assert.equal(keys.has("c"), false, "poręczony, ale niezaufany nie może podpisywać rekordów");
  assert.equal(keys.has("d"), false, "zaufany bez klucza nic nie wnosi");
});

test("węzeł znany tylko z katalogu daje czytelny powód odrzucenia", () => {
  const peers = [
    { node_id: "c", trusted: false, public_key: "KC" },
    { node_id: "b", trusted: true, public_key: "KB" },
    { node_id: "e", trusted: false, public_key: "" },
  ];
  assert.equal(isVouchedOnly(peers, "c"), true);
  assert.equal(isVouchedOnly(peers, "b"), false, "zaufany to nie jest przypadek poręczenia");
  assert.equal(isVouchedOnly(peers, "e"), false, "bez klucza nie ma czego zaufać");
  assert.equal(isVouchedOnly(peers, "nieznany"), false);
});
