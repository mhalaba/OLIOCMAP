/// <reference path="../pb_data/types.d.ts" />

var env = require(`${__hooks}/lib/env.js`);
var denylist = require(`${__hooks}/lib/denylist.js`);
var publicGeom = require(`${__hooks}/lib/publicGeom.js`);
var hlcLib = require(`${__hooks}/lib/hlc.js`);
var uuidLib = require(`${__hooks}/lib/uuidv7.js`);
var exif = require(`${__hooks}/lib/exif.js`);

var SYNC_FIELDS = [
  "category", "title", "description", "lat", "lon", "public_lat", "public_lon", "public_geom",
  "gmina_teryt", "gmina_name", "address", "status", "blocked", "host_type", "services",
  "link_type", "capability", "capacity", "activation", "activation_hours", "autonomy_h",
  "hours", "opening_hours", "contact_public", "consent", "civilians_ok", "verified_by_node",
  "verified_at", "last_confirmed_at", "confirm_interval_days", "expires_at", "ttl_purged",
  "external_ref", "need_type", "people", "urgency", "resolved_at", "deleted_at", "photo_sha256",
];

function nodeId() {
  return env.get("NODE_ID", "bytom-01");
}

function nextHlc(app) {
  var rec;
  try {
    rec = app.findRecordById("hlc_state", env.SELF_ID);
  } catch (e) {
    var col = app.findCollectionByNameOrId("hlc_state");
    rec = new Record(col);
    rec.id = env.SELF_ID;
    rec.set("last_ms", 0);
    rec.set("counter", 0);
  }
  var t = hlcLib.tickHlc(
    { lastMs: rec.getInt("last_ms"), counter: rec.getInt("counter") },
    nodeId(),
    Date.now()
  );
  rec.set("last_ms", t.lastMs);
  rec.set("counter", t.counter);
  app.save(rec);
  return t.hlc;
}

function jsonVal(record, field) {
  var v = record.get(field);
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v;
  try {
    if (typeof v === "string") return JSON.parse(v);
  } catch (e) {}
  return v;
}

function writeAudit(app, actorId, action, pointId, before, after) {
  try {
    var col = app.findCollectionByNameOrId("audit");
    var rec = new Record(col);
    if (actorId) rec.set("actor", actorId);
    rec.set("action", action);
    rec.set("point_id", pointId);
    rec.set("before", before || {});
    rec.set("after", after || {});
    rec.set("at", new DateTime());
    app.save(rec);
  } catch (e) {
    console.log("audit_fail", e);
  }
}

function applyPublic(record) {
  var category = record.get("category");
  var host = record.get("host_type");
  var envMode = env.get("PUBLIC_GEOM_MODE", "gmina");
  var geom = record.get("public_geom");
  if (category === "potrzeba") {
    geom = "hidden";
  }
  geom = publicGeom.defaultPublicGeom(category, host, envMode, geom);
  record.set("public_geom", geom);
  var coords = publicGeom.publicCoords(
    record.id,
    record.get("lat"),
    record.get("lon"),
    geom,
    $security.sha256(String(record.id))
  );
  if (coords.public_lat === null) {
    record.set("public_lat", 0);
    record.set("public_lon", 0);
  } else {
    record.set("public_lat", coords.public_lat);
    record.set("public_lon", coords.public_lon);
  }
}

function checkPhotoGps(e) {
  try {
    var files = e.findUploadedFiles("photo");
    if (!files || !files.length) return;
    var f = files[0];
    var bytes = null;
    if (f && typeof f.bytes === "function") bytes = f.bytes();
    if (!bytes && f && f.reader) {
      /* best effort */
    }
    if (bytes && exif.hasGpsExif(bytes)) {
      throw new BadRequestError("Zdjęcie zawiera metadane GPS. Usuń EXIF i wyślij ponownie.");
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }
}

function isOperator(auth) {
  if (!auth) return false;
  var r = auth.get("role");
  return r === "operator" || r === "admin";
}

module.exports.create = function(e) {
  try {
  var rec = e.record;
  var superuser = e.hasSuperuserAuth();

  if (!rec.id || String(rec.id).length < 8) {
    var rand = $security.randomStringWithAlphabet(20, "0123456789abcdef");
    rec.id = uuidLib.uuidv7(Date.now(), rand);
  }

  if (!superuser) {
    if (!rec.getBool("consent")) {
      throw new BadRequestError("Wymagana zgoda na przetwarzanie danych (RODO).");
    }
    rec.set("source_node", nodeId());
    rec.set("created_by", e.auth ? e.auth.id : "");
    rec.set("blocked", false);
    rec.set("schema_version", 2);

    var role = e.auth ? e.auth.get("role") : "citizen";
    rec.set("reporter_role", role || "citizen");
    var auto = env.get("AUTO_VERIFY_TRUSTED", "false") === "true" && role === "zaufany";
    rec.set("status", auto ? "verified" : "pending");
    if (auto) {
      rec.set("verified_by_node", nodeId());
      rec.set("verified_at", new DateTime());
      rec.set("last_confirmed_at", new DateTime());
    }
  }

  var category = rec.get("category");
  var allowed = ["odpornosc", "schron", "aed", "woda", "prad", "lacznosc", "przemysl", "potrzeba"];
  if (allowed.indexOf(category) < 0) {
    throw new BadRequestError("Nieznana kategoria.");
  }

  var deny = denylist.checkDenylist(rec.get("title"), rec.get("description"), category, rec.get("host_type"));
  if (deny.blocked && !superuser) {
    throw new BadRequestError(deny.message);
  }

  if (category === "potrzeba") {
    rec.set("public_geom", "hidden");
    var ttlH = Number(env.get("POTRZEBA_TTL_H", "72"));
    if (!ttlH || ttlH < 0) ttlH = 72;
    rec.set("expires_at", new DateTime(new Date(Date.now() + ttlH * 3600 * 1000).toISOString()));
  }

  if (category === "lacznosc") {
    rec.set("photo", []);
    var envMode = env.get("PUBLIC_GEOM_MODE", "gmina");
    var forcePrecise = isOperator(e.auth) && rec.get("public_geom") === "precise" && rec.getBool("civilians_ok");
    if (!forcePrecise) rec.set("public_geom", envMode === "precise" ? "gmina" : envMode);
  }
  if (category === "prad" && rec.get("host_type") === "prywatny") {
    var mode2 = env.get("PUBLIC_GEOM_MODE", "gmina");
    var force2 = isOperator(e.auth) && rec.get("public_geom") === "precise" && rec.getBool("civilians_ok");
    if (!force2 && rec.get("public_geom") !== "hidden") rec.set("public_geom", mode2);
  }

  var contact = String(rec.get("contact_public") || "");
  if (/\d{11}/.test(contact.replace(/\s/g, ""))) {
    throw new BadRequestError("Nie podawaj PESEL-u ani numeru dokumentu w kontakcie publicznym.");
  }

  if (rec.get("civilians_ok") === "" || rec.get("civilians_ok") === null) {
    rec.set("civilians_ok", true);
  }
  if (!rec.get("gmina_teryt")) rec.set("gmina_teryt", env.get("NODE_GMINA_TERYT", ""));
  if (!rec.get("gmina_name")) rec.set("gmina_name", env.get("NODE_GMINA_NAME", ""));
  if (!rec.getInt("confirm_interval_days")) {
    rec.set("confirm_interval_days", Number(env.get("CONFIRM_INTERVAL_DAYS", "14")) || 14);
  }

  if (!superuser || !rec.get("hlc")) {
    var h = nextHlc(e.app);
    rec.set("hlc", h);
    rec.set("updated_at", new DateTime());
    var fh = {};
    for (var i = 0; i < SYNC_FIELDS.length; i++) fh[SYNC_FIELDS[i]] = h;
    rec.set("field_hlc", fh);
  }

  applyPublic(rec);
  checkPhotoGps(e);

  if (superuser && rec.get("status") === "verified" && !rec.get("last_confirmed_at")) {
    rec.set("last_confirmed_at", new DateTime());
  }

  e.next();
  } catch (err) {
    if (err instanceof BadRequestError || err instanceof ForbiddenError) throw err;
    throw new BadRequestError("create: " + String(err));
  }
};

module.exports.update = function(e) {
  var rec = e.record;
  var orig = rec.original();
  var superuser = e.hasSuperuserAuth();
  var role = e.auth ? e.auth.get("role") : "";

  if (!superuser) {
    if (env.get("NODE_ROLE", "node") !== "central") {
      rec.set("blocked", orig.get("blocked"));
    }
    rec.set("source_node", orig.get("source_node"));
    rec.set("created_by", orig.get("created_by"));

    var newStatus = rec.get("status");
    var oldStatus = orig.get("status");
    if (newStatus !== oldStatus) {
      var ttlExpire = newStatus === "expired" && orig.get("category") === "potrzeba";
      if (ttlExpire) {
        /* automatyczne wygaszenie — nie wymaga operatora */
      } else if (!isOperator(e.auth)) {
        rec.set("status", oldStatus);
      } else if (newStatus === "verified" || newStatus === "rejected") {
        if (newStatus === "verified") {
          rec.set("verified_by_node", nodeId());
          rec.set("verified_at", new DateTime());
          rec.set("last_confirmed_at", new DateTime());
        }
        writeAudit(e.app, e.auth.id, newStatus === "verified" ? "verify" : "reject", rec.id, { status: oldStatus }, { status: newStatus });
      }
    }

    if (orig.get("status") === "pending" && !isOperator(e.auth)) {
      rec.set("status", "pending");
    }

    var deny = denylist.checkDenylist(rec.get("title"), rec.get("description"), rec.get("category"), rec.get("host_type"));
    if (deny.blocked) throw new BadRequestError(deny.message);

    var contact = String(rec.get("contact_public") || "");
    if (/\d{11}/.test(contact.replace(/\s/g, ""))) {
      throw new BadRequestError("Nie podawaj PESEL-u ani numeru dokumentu w kontakcie publicznym.");
    }

    if (rec.get("category") === "lacznosc") {
      rec.set("photo", orig.get("photo"));
    }

    if (rec.get("category") === "potrzeba") rec.set("public_geom", "hidden");

    var h = nextHlc(e.app);
    rec.set("hlc", h);
    rec.set("updated_at", new DateTime());
    var fh = orig.get("field_hlc") || {};
    if (typeof fh !== "object" || Array.isArray(fh)) fh = {};
    else fh = JSON.parse(JSON.stringify(fh));
    for (var i = 0; i < SYNC_FIELDS.length; i++) {
      var f = SYNC_FIELDS[i];
      try {
        if (JSON.stringify(rec.get(f)) !== JSON.stringify(orig.get(f))) fh[f] = h;
      } catch (err) {
        fh[f] = h;
      }
    }
    rec.set("field_hlc", fh);

    var lastConf = rec.get("last_confirmed_at");
    var origConf = orig.get("last_confirmed_at");
    if (String(lastConf) !== String(origConf) && isOperator(e.auth)) {
      writeAudit(e.app, e.auth.id, "confirm", rec.id, {}, {});
    }
  }

  applyPublic(rec);
  checkPhotoGps(e);
  e.next();
};

module.exports.remove = function(e) {
  if (!e.hasSuperuserAuth() && !isOperator(e.auth)) {
    throw new ForbiddenError("Brak uprawnień.");
  }
  var rec = e.record;
  var h = nextHlc(e.app);
  rec.set("deleted_at", new DateTime());
  rec.set("hlc", h);
  rec.set("updated_at", new DateTime());
  var fh = rec.get("field_hlc") || {};
  if (typeof fh !== "object") fh = {};
  else fh = JSON.parse(JSON.stringify(fh));
  fh.deleted_at = h;
  rec.set("field_hlc", fh);
  e.app.save(rec);
  if (e.auth) writeAudit(e.app, e.auth.id, "delete", rec.id, {}, { deleted_at: true });
  return e.noContent(204);
};

module.exports.enrich = function(e) {
  var rec = e.record;
  var info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
  var auth = info ? info.auth : null;
  var superuser = info && info.hasSuperuserAuth && info.hasSuperuserAuth();
  var op = superuser || (auth && (auth.get("role") === "operator" || auth.get("role") === "admin"));
  if (!op) {
    rec.hide("contact_operator");
    rec.hide("created_by");
    rec.hide("lat");
    rec.hide("lon");
    rec.hide("assigned_to");
    rec.hide("field_hlc");
    if (rec.get("public_geom") !== "precise") {
      /* public_lat/lon already rounded */
    }
    if (rec.get("category") === "potrzeba") {
      rec.hide("description");
      rec.hide("contact_public");
    }
  }
  e.next();
};
