import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aedRecordId, featureToPoint, geojsonToPoints, parseBbox } from "../../shared/openaedmap.mjs";

test("aedRecordId ma 15–40 znaków [a-z0-9]", () => {
  const id = aedRecordId(9476518000);
  assert.equal(id, "aed009476518000");
  assert.ok(id.length >= 15 && id.length <= 40);
  assert.match(id, /^[a-z0-9]+$/);
});

test("featureToPoint z OpenAEDMap", () => {
  const fc = JSON.parse(readFileSync(new URL("../fixtures/openaedmap-sample.geojson", import.meta.url), "utf8"));
  const rec = featureToPoint(fc.features[0], { gminaName: "Bytom" });
  assert.ok(rec);
  assert.equal(rec.category, "aed");
  assert.equal(rec.status, "verified");
  assert.equal(rec.public_geom, "precise");
  assert.ok(rec.title.length >= 3);
  assert.ok(rec.external_ref.startsWith("osm:"));
  assert.match(rec.description, /OpenAEDMap/);
});

test("geojsonToPoints filtruje bbox", () => {
  const fc = JSON.parse(readFileSync(new URL("../fixtures/openaedmap-sample.geojson", import.meta.url), "utf8"));
  const none = geojsonToPoints(fc, { bbox: parseBbox("0,0,1,1") });
  assert.equal(none.length, 0);
  const all = geojsonToPoints(fc, {});
  assert.ok(all.length >= 1);
});

test("parseBbox odrzuca śmieci", () => {
  assert.equal(parseBbox(""), null);
  assert.equal(parseBbox("1,2,3"), null);
  assert.deepEqual(parseBbox("18.8,50.3,19.0,50.4"), { minLon: 18.8, minLat: 50.3, maxLon: 19, maxLat: 50.4 });
});
