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
    return app.findAuthRecordByEmail("users", email);
  } catch (e) {}
  var users = app.findCollectionByNameOrId("users");
  var rec = new Record(users);
  rec.set("email", email);
  rec.set("password", password);
  rec.set("name", name);
  rec.set("role", role);
  rec.set("verified", true);
  rec.set("node_id", env("NODE_ID", "bytom-01"));
  app.save(rec);
  return rec;
}

function upsertPoint(app, data) {
  try {
    var existing = app.findRecordById("points", data.id);
    return existing;
  } catch (e) {}
  var col = app.findCollectionByNameOrId("points");
  var rec = new Record(col);
  rec.id = data.id;
  Object.keys(data).forEach(function (k) {
    if (k === "id") return;
    rec.set(k, data[k]);
  });
  app.save(rec);
  return rec;
}

migrate((app) => {
  var nodeId = env("NODE_ID", "bytom-01");
  var gmina = env("NODE_GMINA_NAME", "Bytom");
  var teryt = env("NODE_GMINA_TERYT", "2462011");
  var now = new DateTime();
  var confirmDays = Number(env("CONFIRM_INTERVAL_DAYS", "14")) || 14;
  var ttlH = Number(env("POTRZEBA_TTL_H", "72")) || 72;
  if (ttlH < 0) ttlH = 72;
  var expIso = new Date(Date.now() + ttlH * 3600 * 1000).toISOString();
  var expires = new DateTime(expIso);

  var operator = ensureUser(app, "operator@demo.local", "demo12345", "Operator demo", "operator");
  var citizen = ensureUser(app, "mieszkaniec@demo.local", "demo12345", "Mieszkaniec demo", "citizen");

  if (env("NODE_ROLE", "node") === "central") {
    return;
  }

  var hlcN = 1;
  function envelope() {
    var h = seedHlc(nodeId, hlcN);
    hlcN += 1;
    return {
      source_node: nodeId,
      schema_version: 2,
      conflict: false,
      consent: true,
      civilians_ok: true,
      blocked: false,
      gmina_name: gmina,
      gmina_teryt: teryt,
      confirm_interval_days: confirmDays,
      sig: "",
      hlc: h,
      field_hlc: { title: h, status: h, category: h },
      updated_at: now,
    };
  }

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 1),
    category: "odpornosc",
    title: "Punkt Odporności — remiza OSP",
    description: "Remiza OSP. Ładowanie telefonów, ogrzewanie, woda, internet, informacja.",
    lat: 50.2945,
    lon: 18.6712,
    public_geom: "precise",
    public_lat: 50.2945,
    public_lon: 18.6712,
    address: "ul. Warszawska 1, Gliwice",
    status: "verified",
    host_type: "osp",
    services: ["ladowanie", "ogrzewanie", "woda", "internet", "informacja"],
    activation: "po_alarmie",
    autonomy_h: 24,
    capacity: 80,
    hours: "po ogłoszeniu alarmu — 24 h",
    verified_by_node: nodeId,
    verified_at: now,
    last_confirmed_at: now,
    created_by: operator.id,
  }));

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 2),
    category: "aed",
    title: "AED — hala sportowa",
    description: "Defibrylator przy portierni hali.",
    lat: 50.3481,
    lon: 18.9234,
    public_geom: "precise",
    public_lat: 50.3481,
    public_lon: 18.9234,
    address: "Hala sportowa, Bytom",
    status: "verified",
    host_type: "gmina",
    hours: "całodobowo, przy portierni",
    verified_by_node: nodeId,
    verified_at: now,
    last_confirmed_at: now,
    created_by: operator.id,
  }));

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 3),
    category: "lacznosc",
    title: "Starlink — punkt łączności",
    description: "Publiczny Wi-Fi z terminala satelitarnego. Dokładna lokalizacja anteny nie jest publikowana.",
    lat: 50.3512,
    lon: 18.9101,
    public_geom: "gmina",
    public_lat: 50.35,
    public_lon: 18.91,
    address: "Bytom",
    status: "verified",
    host_type: "osp",
    link_type: ["starlink", "wifi_publiczne"],
    services: ["internet", "ladowanie", "informacja"],
    civilians_ok: true,
    verified_by_node: nodeId,
    verified_at: now,
    last_confirmed_at: now,
    created_by: operator.id,
  }));

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 4),
    category: "odpornosc",
    title: "Punkt Odporności — szkoła podstawowa",
    description: "Otwierany po godzinach bez prądu.",
    lat: 50.355,
    lon: 18.93,
    public_geom: "precise",
    public_lat: 50.355,
    public_lon: 18.93,
    address: "Szkoła podstawowa, Bytom",
    status: "verified",
    host_type: "szkola",
    services: ["ogrzewanie", "woda", "ladowanie", "informacja"],
    activation: "po_godzinach_bez_pradu",
    activation_hours: 6,
    autonomy_h: 12,
    capacity: 120,
    verified_by_node: nodeId,
    verified_at: now,
    last_confirmed_at: now,
    created_by: operator.id,
  }));

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 5),
    category: "woda",
    title: "Punkt wody — studnia głębinowa OSP",
    description: "Studnia na terenie remizy. Woda pitna po przegotowaniu.",
    lat: 50.3492,
    lon: 18.9188,
    public_geom: "precise",
    public_lat: 50.3492,
    public_lon: 18.9188,
    address: "Remiza OSP, Bytom",
    status: "verified",
    host_type: "osp",
    services: ["woda"],
    activation: "stale",
    verified_by_node: nodeId,
    verified_at: now,
    last_confirmed_at: now,
    created_by: operator.id,
  }));

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 6),
    category: "potrzeba",
    title: "Brak wody pitnej — 3 osoby",
    description: "Rodzina bez wody od rana. Tylko operatorzy widzą to zgłoszenie.",
    lat: 50.347,
    lon: 18.925,
    public_geom: "hidden",
    public_lat: 0,
    public_lon: 0,
    status: "pending",
    need_type: "woda",
    people: 3,
    urgency: "srednia",
    created_by: citizen.id,
    ttl_purged: false,
    expires_at: expires,
  }));

  upsertPoint(app, Object.assign({}, envelope(), {
    id: seedPointId(nodeId, 7),
    category: "aed",
    title: "AED — apteka przy rynku",
    description: "Zgłoszenie mieszkańca, oczekuje na weryfikację.",
    lat: 50.3401,
    lon: 18.9155,
    public_geom: "precise",
    public_lat: 50.3401,
    public_lon: 18.9155,
    address: "Rynek, Bytom",
    status: "pending",
    host_type: "firma",
    hours: "godziny otwarcia apteki",
    created_by: citizen.id,
  }));
});
