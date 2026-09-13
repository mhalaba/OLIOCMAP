import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateDatedUrls,
  parseBuildsPage,
  isUsableSourceConfig,
  resolvePmtilesSource,
  FALLBACK_SOURCE,
} from "../../shared/pmtiles_source.mjs";

test("isUsableSourceConfig odrzuca auto i puste", () => {
  assert.equal(isUsableSourceConfig(""), false);
  assert.equal(isUsableSourceConfig("auto"), false);
  assert.equal(isUsableSourceConfig("AUTO"), false);
  assert.equal(isUsableSourceConfig("https://build.protomaps.com/20260913.pmtiles"), true);
});

test("candidateDatedUrls idzie wstecz od UTC", () => {
  const urls = candidateDatedUrls(new Date("2026-09-13T12:00:00Z"), 3);
  assert.deepEqual(urls, [
    "https://build.protomaps.com/20260913.pmtiles",
    "https://build.protomaps.com/20260912.pmtiles",
    "https://build.protomaps.com/20260911.pmtiles",
  ]);
});

test("parseBuildsPage wyciąga unikalne URL-e w kolejności strony", () => {
  const html = `
    <a href="https://build.protomaps.com/20260913.pmtiles">pobierz</a>
    <a href="https://build.protomaps.com/20260913.pmtiles">mapa</a>
    <a href="https://build.protomaps.com/20260912.pmtiles">wczoraj</a>
  `;
  assert.deepEqual(parseBuildsPage(html), [
    "https://build.protomaps.com/20260913.pmtiles",
    "https://build.protomaps.com/20260912.pmtiles",
  ]);
});

test("resolve używa przypiętego URL gdy HEAD 200", async () => {
  const pinned = "https://example.test/region.pmtiles";
  const fetchFn = async (url, opts) => {
    if (url === pinned && opts?.method === "HEAD") return { ok: true, status: 200 };
    return { ok: false, status: 500 };
  };
  const url = await resolvePmtilesSource({ configured: pinned, fetchFn });
  assert.equal(url, pinned);
});

test("resolve pomija martwy dated URL i bierze wpis z listy buildów", async () => {
  const dead = "https://build.protomaps.com/20260904.pmtiles";
  const live = "https://build.protomaps.com/20260913.pmtiles";
  const fetchFn = async (url, opts) => {
    if (url === dead) return { ok: false, status: 404 };
    if (String(url).includes("maps.protomaps.com/builds") && opts?.method === "GET") {
      return {
        ok: true,
        status: 200,
        text: async () => `<a href="${live}">download</a>`,
      };
    }
    if (url === live && opts?.method === "HEAD") return { ok: true, status: 200 };
    return { ok: false, status: 404 };
  };
  const url = await resolvePmtilesSource({
    configured: dead,
    fetchFn,
    now: new Date("2026-09-13T12:00:00Z"),
  });
  assert.equal(url, live);
});

test("resolve pada na fallback gdy nic nie odpowiada", async () => {
  const fetchFn = async () => ({ ok: false, status: 404 });
  await assert.rejects(
    () => resolvePmtilesSource({ configured: "auto", fetchFn, now: new Date("2026-09-13T12:00:00Z") }),
    /Nie znaleziono dziennego buildu/
  );
});

test("FALLBACK_SOURCE to source.coop v4", () => {
  assert.match(FALLBACK_SOURCE, /source\.coop.*v4\.pmtiles/);
});
