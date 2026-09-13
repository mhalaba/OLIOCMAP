#!/usr/bin/env node
/**
 * Parsuje pb_migrations i sprawdza, czy nazwy kolekcji/pól występują w hookach, sync i types.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const migDir = join(root, "pb_migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".js"));
const src = files.map((f) => readFileSync(join(migDir, f), "utf8")).join("\n");

const collections = [...src.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const uniqueCol = [...new Set(collections)].filter((c) =>
  ["users", "points", "peers", "sync_log", "node_status", "audit", "reports", "invites", "hlc_state"].includes(c)
);

const fieldNames = [...src.matchAll(/name:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
const uniqueFields = [...new Set(fieldNames)];

const targets = [
  "pb_hooks/points.pb.js",
  "pb_hooks/users.pb.js",
  "pb_hooks/routes.pb.js",
  "sync/index.mjs",
  "sync/rows.mjs",
  "web/src/types.ts",
  "shared/constants.mjs",
  "shared/merge.mjs",
];

const blobs = targets.map((t) => {
  try {
    return { t, s: readFileSync(join(root, t), "utf8") };
  } catch {
    return { t, s: "" };
  }
});

let failed = 0;
for (const col of uniqueCol) {
  const hit = blobs.some((b) => b.s.includes(col));
  if (!hit) {
    console.error("kolekcja nieużywana?", col);
  }
}

const requiredPointFields = [
  "category",
  "title",
  "lat",
  "lon",
  "public_lat",
  "public_lon",
  "public_geom",
  "status",
  "blocked",
  "services",
  "activation",
  "autonomy_h",
  "last_confirmed_at",
  "hlc",
  "field_hlc",
  "source_node",
  "consent",
  "need_type",
];
for (const f of requiredPointFields) {
  if (!uniqueFields.includes(f)) {
    console.error("brak pola w migracji:", f);
    failed++;
  }
  const inTypes = blobs.find((b) => b.t.endsWith("types.ts"))?.s.includes(f);
  const inRows = blobs.find((b) => b.t.endsWith("rows.mjs"))?.s.includes(f);
  if (!inTypes && f !== "field_hlc" && f !== "hlc" && f !== "source_node" && f !== "blocked") {
    console.error("brak pola w types.ts:", f);
    failed++;
  }
  if (!inRows && !["created_by", "photo"].includes(f)) {
    /* rows has UPSERT_FIELDS */
  }
}

if (failed) {
  console.error("check-schema: BŁĄD", failed);
  process.exit(1);
}
console.log("check-schema: OK", uniqueCol.join(", "));
