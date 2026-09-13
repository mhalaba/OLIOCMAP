/// <reference path="../pb_data/types.d.ts" />

var env = require(`${__hooks}/lib/env.js`);
var expire = require(`${__hooks}/lib/expire.js`);

var feedCache = { at: 0, body: "", etag: "" };

function isDeleted(rec) {
  var d = rec.get("deleted_at");
  return d && String(d) !== "" && String(d) !== "0001-01-01 00:00:00.000Z";
}

function staleOf(rec, nowMs) {
  var last = rec.getDateTime("last_confirmed_at");
  var days = rec.getInt("confirm_interval_days") || Number(env.get("CONFIRM_INTERVAL_DAYS", "14")) || 14;
  if (!last || last.unix() <= 0) return true;
  return nowMs - last.unix() * 1000 > days * 86400000;
}

routerAdd("GET", "/api/feed.geojson", (e) => {
  var inm = e.request.header.get("If-None-Match");
  if (feedCache.body && Date.now() - feedCache.at < 30000 && inm && inm === feedCache.etag) {
    e.response.header().set("ETag", feedCache.etag);
    e.response.header().set("Cache-Control", "public, max-age=30");
    return e.noContent(304);
  }
  if (feedCache.body && Date.now() - feedCache.at < 30000 && (!inm || inm !== feedCache.etag)) {
    e.response.header().set("ETag", feedCache.etag);
    e.response.header().set("Cache-Control", "public, max-age=30");
    e.response.header().set("Content-Type", "application/geo+json; charset=utf-8");
    return e.string(200, feedCache.body);
  }

  var records = e.app.findAllRecords("points");
  var now = Date.now();
  var features = [];
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (r.get("status") !== "verified") continue;
    if (r.getBool("blocked")) continue;
    if (isDeleted(r)) continue;
    if (r.get("category") === "potrzeba") continue;
    if (r.get("public_geom") === "hidden") continue;
    var lat = r.getFloat("public_lat");
    var lon = r.getFloat("public_lon");
    if (!lat && !lon) continue;
    var services = r.get("services") || [];
    features.push({
      type: "Feature",
      id: r.id,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: r.id,
        category: r.get("category"),
        title: r.get("title"),
        services: services,
        host_type: r.get("host_type"),
        hours: r.get("hours"),
        activation: r.get("activation"),
        activation_hours: r.getInt("activation_hours"),
        autonomy_h: r.get("autonomy_h"),
        capacity: r.get("capacity"),
        status: r.get("status"),
        source_node: r.get("source_node"),
        last_confirmed_at: String(r.get("last_confirmed_at") || ""),
        stale: staleOf(r, now),
        public_geom: r.get("public_geom"),
      },
    });
  }
  var fc = { type: "FeatureCollection", features: features };
  var body = JSON.stringify(fc);
  var etag = '"' + $security.md5(body) + '"';
  feedCache = { at: Date.now(), body: body, etag: etag };
  e.response.header().set("ETag", etag);
  e.response.header().set("Cache-Control", "public, max-age=30");
  e.response.header().set("Content-Type", "application/geo+json; charset=utf-8");
  return e.string(200, body);
});

function collectCounts(app) {
  var records = app.findAllRecords("points");
  var by_category = {};
  var by_status = {};
  var potrzeba_open = 0;
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (isDeleted(r)) continue;
    var c = r.get("category") || "inne";
    var s = r.get("status") || "pending";
    by_category[c] = (by_category[c] || 0) + 1;
    by_status[s] = (by_status[s] || 0) + 1;
    if (c === "potrzeba" && s !== "expired" && !r.get("resolved_at")) potrzeba_open += 1;
  }
  return { by_category: by_category, by_status: by_status, potrzeba_open: potrzeba_open };
}

routerAdd("GET", "/api/status", (e) => {
  try { expire.run(e.app); } catch (err) {}
  var rec;
  try {
    rec = e.app.findRecordById("node_status", env.SELF_ID);
  } catch (err) {
    rec = null;
  }
  var counts = collectCounts(e.app);
  var peers = [];
  if (rec) {
    try {
      peers = rec.get("peers") || [];
    } catch (e2) {
      peers = [];
    }
  }
  var body = {
    node_id: env.get("NODE_ID", "bytom-01"),
    node_name: env.get("NODE_NAME", ""),
    role: env.get("NODE_ROLE", "node"),
    gmina: env.get("NODE_GMINA_NAME", ""),
    gmina_teryt: env.get("NODE_GMINA_TERYT", ""),
    operator_name: env.get("NODE_OPERATOR_NAME", ""),
    registration_mode: env.get("REGISTRATION_MODE", "open"),
    mode: rec ? rec.get("mode") || "wyspa" : "wyspa",
    last_pull: rec ? String(rec.get("last_pull") || "") : "",
    last_push: rec ? String(rec.get("last_push") || "") : "",
    last_error: rec ? rec.get("last_error") || "" : "",
    peers: peers,
    counts: { by_category: counts.by_category, by_status: counts.by_status },
    potrzeba_open: counts.potrzeba_open,
    version: env.get("APP_VERSION", "0.1.0"),
    tls_mode: env.get("TLS_MODE", "off"),
    public_key: rec ? rec.get("public_key") || "" : "",
  };
  return e.json(200, body);
});

routerAdd("GET", "/api/config", (e) => {
  return e.json(200, {
    node_id: env.get("NODE_ID", "bytom-01"),
    node_name: env.get("NODE_NAME", ""),
    gmina: env.get("NODE_GMINA_NAME", ""),
    role: env.get("NODE_ROLE", "node"),
    registration_mode: env.get("REGISTRATION_MODE", "open"),
    operator_name: env.get("NODE_OPERATOR_NAME", ""),
    confirm_interval_days: Number(env.get("CONFIRM_INTERVAL_DAYS", "14")) || 14,
    tls_mode: env.get("TLS_MODE", "off"),
  });
});
