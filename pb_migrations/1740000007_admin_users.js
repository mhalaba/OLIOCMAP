/// <reference path="../pb_data/types.d.ts" />

function env(key, fallback) {
  var v = $os.getenv(key);
  if (v === null || v === undefined || v === "") return fallback;
  return v;
}

function seedPointId(nodeId, n) {
  var slug = String(nodeId).toLowerCase().replace(/[^a-z0-9]/g, "");
  while (slug.length < 8) slug += "x";
  slug = slug.slice(0, 8);
  var num = String(n);
  while (num.length < 6) num = "0" + num;
  return ("p" + slug + num).slice(0, 15);
}

function seedHlc(nodeId, n) {
  var ms = String(Date.now());
  while (ms.length < 13) ms = "0" + ms;
  var c = n.toString(16);
  while (c.length < 4) c = "0" + c;
  return ms + "-" + c + "-" + nodeId;
}

function ensureUser(app, email, password, name, role) {
  try {
    var existing = app.findAuthRecordByEmail("users", email);
    existing.set("role", role);
    existing.set("name", name);
    existing.set("emailVisibility", true);
    existing.set("verified", true);
    app.save(existing);
    return existing;
  } catch (e) {}
  var users = app.findCollectionByNameOrId("users");
  var rec = new Record(users);
  rec.set("email", email);
  rec.set("password", password);
  rec.set("name", name);
  rec.set("role", role);
  rec.set("verified", true);
  rec.set("emailVisibility", true);
  rec.set("node_id", env("NODE_ID", "bytom-01"));
  rec.set("org_name", "OSP demo");
  app.save(rec);
  return rec;
}

migrate((app) => {
  var users = app.findCollectionByNameOrId("users");
  users.listRule = "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'";
  app.save(users);

  var all = app.findAllRecords("users");
  for (var i = 0; i < all.length; i++) {
    try {
      all[i].set("emailVisibility", true);
      app.save(all[i]);
    } catch (e) {}
  }

  var admin = ensureUser(app, "admin@demo.local", "demo12345", "Administrator demo", "admin");

  if (env("NODE_ROLE", "node") === "central") {
    return;
  }

  var nodeId = env("NODE_ID", "bytom-01");
  var gmina = env("NODE_GMINA_NAME", "Bytom");
  var teryt = env("NODE_GMINA_TERYT", "2462011");
  var now = new DateTime();
  var confirmDays = Number(env("CONFIRM_INTERVAL_DAYS", "14")) || 14;
  var pid = seedPointId(nodeId, 8);
  try {
    app.findRecordById("points", pid);
    return;
  } catch (e) {}

  var h = seedHlc(nodeId, 20);
  var col = app.findCollectionByNameOrId("points");
  var rec = new Record(col);
  rec.id = pid;
  rec.set("category", "przemysl");
  rec.set("title", "Warsztat OSP — zaplecze gminy");
  rec.set("description", "Spawanie, drobne naprawy, agregat. Nie jest to zakład krytyczny.");
  rec.set("lat", 50.3462);
  rec.set("lon", 18.921);
  rec.set("public_geom", "precise");
  rec.set("public_lat", 50.3462);
  rec.set("public_lon", 18.921);
  rec.set("address", "Remiza, Bytom");
  rec.set("status", "verified");
  rec.set("host_type", "osp");
  rec.set("capability", ["warsztat", "spawanie", "agregat"]);
  rec.set("services", ["ladowanie"]);
  rec.set("activation", "po_alarmie");
  rec.set("consent", true);
  rec.set("civilians_ok", true);
  rec.set("blocked", false);
  rec.set("conflict", false);
  rec.set("schema_version", 2);
  rec.set("source_node", nodeId);
  rec.set("gmina_name", gmina);
  rec.set("gmina_teryt", teryt);
  rec.set("confirm_interval_days", confirmDays);
  rec.set("verified_by_node", nodeId);
  rec.set("verified_at", now);
  rec.set("last_confirmed_at", now);
  rec.set("created_by", admin.id);
  rec.set("reporter_role", "admin");
  rec.set("hlc", h);
  rec.set("field_hlc", { title: h, status: h, category: h });
  rec.set("updated_at", now);
  rec.set("sig", "");
  app.save(rec);
});
