var env = require(`${__hooks}/lib/env.js`);
var expire = require(`${__hooks}/lib/expire.js`);

var feedCache = { at: 0, body: "", etag: "" };

function getenv(key, fallback) {
  try {
    var v = $os.getenv(key);
    if (v === null || v === undefined || v === "") return fallback;
    return String(v);
  } catch (err) {
    return fallback;
  }
}

function asJson(v, fallback) {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }
  if (Array.isArray(v) && v.length && typeof v[0] === "number") {
    try {
      var s = "";
      for (var i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
      return JSON.parse(s);
    } catch (e2) {
      return fallback;
    }
  }
  if (typeof v === "object") return v;
  return fallback;
}

function isEmptyDate(v) {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (typeof v === "object" && v && typeof v.unix === "function") {
    try { return v.unix() <= 0; } catch (e) { return true; }
  }
  var s = String(v);
  if (!s || s.indexOf("0001-01-01") >= 0) return true;
  return false;
}

function isDeleted(rec) {
  return !isEmptyDate(rec.get("deleted_at"));
}

function headerGet(req, name) {
  try {
    if (!req) return "";
    var h = typeof req.header === "function" ? req.header() : req.header;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(name) || "";
    return "";
  } catch (err) {
    return "";
  }
}

function setHeader(e, key, val) {
  try {
    if (typeof e.set === "function") {
      /* pocketbase router helper */
    }
    var resp = e.response;
    var h = resp && (typeof resp.header === "function" ? resp.header() : resp.header);
    if (h && typeof h.set === "function") h.set(key, val);
  } catch (err) {}
}

function staleOf(rec, nowMs) {
  try {
    var last = rec.getDateTime("last_confirmed_at");
    var days = rec.getInt("confirm_interval_days") || Number(getenv("CONFIRM_INTERVAL_DAYS", "14")) || 14;
    if (!last || last.unix() <= 0) return true;
    return nowMs - last.unix() * 1000 > days * 86400000;
  } catch (err) {
    return true;
  }
}

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
    if (c === "potrzeba" && s !== "expired" && isEmptyDate(r.get("resolved_at"))) potrzeba_open += 1;
  }
  return { by_category: by_category, by_status: by_status, potrzeba_open: potrzeba_open };
}

module.exports.feed = function(e) {
  try {
    var inm = headerGet(e.request, "If-None-Match");
    if (feedCache.body && Date.now() - feedCache.at < 30000 && inm && inm === feedCache.etag) {
      setHeader(e, "ETag", feedCache.etag);
      setHeader(e, "Cache-Control", "public, max-age=30");
      return e.noContent(304);
    }
    if (feedCache.body && Date.now() - feedCache.at < 30000) {
      setHeader(e, "ETag", feedCache.etag);
      setHeader(e, "Cache-Control", "public, max-age=30");
      setHeader(e, "Content-Type", "application/geo+json; charset=utf-8");
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
      if (typeof services === "string") {
        try { services = JSON.parse(services); } catch (err2) { services = []; }
      }
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
          hours: r.get("hours") || "",
          activation: r.get("activation") || "",
          activation_hours: r.getInt("activation_hours"),
          autonomy_h: r.get("autonomy_h"),
          capacity: r.get("capacity"),
          status: r.get("status"),
          source_node: r.get("source_node"),
          last_confirmed_at: String(r.get("last_confirmed_at") || ""),
          verified_at: String(r.get("verified_at") || ""),
          verified_by_name: r.get("verified_by_name") || "",
          confirmed_by_name: r.get("confirmed_by_name") || "",
          stale: staleOf(r, now),
          public_geom: r.get("public_geom"),
        },
      });
    }
    var fc = { type: "FeatureCollection", features: features };
    var body = JSON.stringify(fc);
    var etag = '"' + $security.md5(body) + '"';
    feedCache = { at: Date.now(), body: body, etag: etag };
    setHeader(e, "ETag", etag);
    setHeader(e, "Cache-Control", "public, max-age=30");
    setHeader(e, "Content-Type", "application/geo+json; charset=utf-8");
    return e.string(200, body);
  } catch (err) {
    return e.json(500, { blad: String(err) });
  }
};

module.exports.status = function(e) {
  try {
    try { expire.run(e.app); } catch (err) {}
    var rec = null;
    try {
      rec = e.app.findRecordById("node_status", env.SELF_ID);
    } catch (err2) {
      rec = null;
    }
    var counts = collectCounts(e.app);
    var peers = [];
    if (rec) {
      try {
        var rawPeers = rec.get("peers");
        peers = asJson(rawPeers, []);
        if (!Array.isArray(peers)) peers = [];
      } catch (err3) {
        peers = [];
      }
    }
    var mode = "wyspa";
    try { if (rec) mode = rec.get("mode") || "wyspa"; } catch (err4) {}
    var body = {
      node_id: getenv("NODE_ID", "bytom-01"),
      node_name: getenv("NODE_NAME", ""),
      role: getenv("NODE_ROLE", "node"),
      gmina: getenv("NODE_GMINA_NAME", ""),
      gmina_teryt: getenv("NODE_GMINA_TERYT", ""),
      operator_name: getenv("NODE_OPERATOR_NAME", ""),
      registration_mode: getenv("REGISTRATION_MODE", "open"),
      mode: mode,
      last_pull: rec ? String(rec.get("last_pull") || "") : "",
      last_push: rec ? String(rec.get("last_push") || "") : "",
      last_error: rec ? String(rec.get("last_error") || "") : "",
      peers: peers,
      counts: { by_category: counts.by_category, by_status: counts.by_status },
      potrzeba_open: counts.potrzeba_open,
      version: getenv("APP_VERSION", "0.1.0"),
      tls_mode: getenv("TLS_MODE", "off"),
      public_key: rec ? String(rec.get("public_key") || "") : "",
    };
    e.json(200, JSON.parse(JSON.stringify(body)));
  } catch (err) {
    e.json(500, { blad: String(err) });
  }
};

module.exports.config = function(e) {
  try {
    e.json(200, {
      node_id: getenv("NODE_ID", "bytom-01"),
      node_name: getenv("NODE_NAME", ""),
      gmina: getenv("NODE_GMINA_NAME", ""),
      role: getenv("NODE_ROLE", "node"),
      registration_mode: getenv("REGISTRATION_MODE", "open"),
      operator_name: getenv("NODE_OPERATOR_NAME", ""),
      confirm_interval_days: Number(getenv("CONFIRM_INTERVAL_DAYS", "14")) || 14,
      tls_mode: getenv("TLS_MODE", "off"),
    });
  } catch (err) {
    e.json(500, { blad: String(err) });
  }
};
