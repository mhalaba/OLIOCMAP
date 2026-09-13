/// <reference path="../pb_data/types.d.ts" />

function env(key, fallback) {
  var v = $os.getenv(key);
  if (v === null || v === undefined || v === "") return fallback;
  return v;
}

function ensureSuperuser(app, email, password) {
  if (!email || !password) return;
  try {
    app.findAuthRecordByEmail("_superusers", email);
    return;
  } catch (e) {}
  var col = app.findCollectionByNameOrId("_superusers");
  var rec = new Record(col);
  rec.set("email", email);
  rec.set("password", password);
  app.save(rec);
}

migrate((app) => {
  ensureSuperuser(app, env("PB_SUPERUSER_EMAIL", "admin@node.local"), env("PB_SUPERUSER_PASSWORD", "change-me"));
  ensureSuperuser(app, env("SYNC_SUPERUSER_EMAIL", "sync@node.local"), env("SYNC_SUPERUSER_PASSWORD", "change-me-too"));

  var statusCol = app.findCollectionByNameOrId("node_status");
  try {
    app.findRecordById("node_status", "self");
  } catch (e) {
    var rec = new Record(statusCol);
    rec.id = "self";
    rec.set("node_id", env("NODE_ID", "bytom-01"));
    rec.set("mode", "wyspa");
    rec.set("counts", {});
    rec.set("peers", []);
    app.save(rec);
  }

  var hlcCol = app.findCollectionByNameOrId("hlc_state");
  try {
    app.findRecordById("hlc_state", "self");
  } catch (e2) {
    var h = new Record(hlcCol);
    h.id = "self";
    h.set("last_ms", 0);
    h.set("counter", 0);
    app.save(h);
  }
});
