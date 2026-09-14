import { test } from "node:test";
import assert from "node:assert/strict";
import { merge } from "../../shared/merge.mjs";
import { formatHlc } from "../../shared/hlc.mjs";

const now = 1700000000000;

function row(partial) {
  const hlc = partial.hlc || formatHlc(now, 1, partial.source_node || "a");
  return {
    id: "p1",
    source_node: "a",
    status: "verified",
    title: "A",
    hlc,
    field_hlc: { title: hlc, status: hlc },
    ...partial,
  };
}

test("per-field HLC bierze nowsze pole", () => {
  const local = row({
    title: "stary",
    description: "L",
    hlc: formatHlc(now, 1, "a"),
    field_hlc: { title: formatHlc(now, 1, "a"), description: formatHlc(now + 5000, 1, "a") },
  });
  const remote = row({
    source_node: "b",
    title: "nowy",
    description: "R",
    hlc: formatHlc(now + 1000, 1, "b"),
    field_hlc: { title: formatHlc(now + 2000, 1, "b"), description: formatHlc(now, 1, "b") },
  });
  const m = merge(local, remote, { nowMs: now + 10_000, localNodeId: "a" });
  assert.equal(m.record.title, "nowy");
  assert.equal(m.record.description, "L");
});

test("tombstone nie wstaje od starszej poprawki", () => {
  const local = row({
    deleted_at: "2024-01-02 00:00:00.000Z",
    hlc: formatHlc(now + 5000, 1, "a"),
    field_hlc: { deleted_at: formatHlc(now + 5000, 1, "a") },
  });
  const remote = row({
    deleted_at: "",
    title: "wskrzeszenie",
    hlc: formatHlc(now, 1, "b"),
    field_hlc: { title: formatHlc(now, 1, "b") },
  });
  const m = merge(local, remote, { nowMs: now + 10_000, localNodeId: "a" });
  assert.ok(m.record.deleted_at);
});

test("lokalny pending nie jest nadpisywany", () => {
  const local = row({ status: "pending", title: "moje" });
  const remote = row({ status: "verified", title: "cudze", source_node: "b" });
  const m = merge(local, remote, { nowMs: now + 10_000, localNodeId: "a" });
  assert.equal(m.action, "keep_local");
  assert.equal(m.record.title, "moje");
  assert.equal(m.conflict, true);
});

test("blocked z centrali zawsze wygrywa", () => {
  const local = row({ blocked: false, title: "ok" });
  const remote = row({
    blocked: true,
    source_node: "central-01",
    hlc: formatHlc(now - 10_000, 1, "central-01"),
    field_hlc: { blocked: formatHlc(now - 10_000, 1, "central-01") },
  });
  const m = merge(local, remote, {
    nowMs: now,
    localNodeId: "a",
    remotePeerRole: "central",
    remotePeerTrusted: true,
  });
  assert.equal(m.record.blocked, true);
});

test("odrzuca czas > 10 min w przyszłość", () => {
  const remote = row({ hlc: formatHlc(now + 20 * 60 * 1000, 1, "b") });
  const m = merge(null, remote, { nowMs: now, localNodeId: "a" });
  assert.equal(m.action, "quarantine");
});

test("remis pola rozstrzyga node_id leksykograficznie", () => {
  const h = formatHlc(now, 5, "aaa");
  const local = row({ title: "A", source_node: "aaa", hlc: h, field_hlc: { title: formatHlc(now, 5, "aaa") } });
  const remote = row({ title: "B", source_node: "bbb", hlc: h, field_hlc: { title: formatHlc(now, 5, "bbb") } });
  const m = merge(local, remote, { nowMs: now + 1000, localNodeId: "z" });
  assert.equal(m.record.title, "B");
});

test("insert gdy brak lokalnego", () => {
  const remote = row({ title: "N" });
  const m = merge(null, remote, { nowMs: now, localNodeId: "a" });
  assert.equal(m.action, "insert");
});
