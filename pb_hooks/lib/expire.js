var env = require(`${__hooks}/lib/env.js`);

function isEmptyDate(v) {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (typeof v === "object" && v && typeof v.unix === "function") {
    try {
      return v.unix() <= 0;
    } catch (e) {
      return true;
    }
  }
  var s = String(v);
  if (!s || s === "[object Object]") return true;
  if (s.indexOf("0001-01-01") >= 0) return true;
  return false;
}

function dateMs(v) {
  if (isEmptyDate(v)) return 0;
  try {
    if (typeof v === "object" && v && typeof v.unix === "function") {
      var u = v.unix();
      if (u <= 0) return 0;
      return u * 1000;
    }
  } catch (e) {}
  var s = String(v);
  if (!s || s.indexOf("0001-01-01") >= 0) return 0;
  var t = Date.parse(s.replace(" ", "T"));
  return isNaN(t) ? 0 : t;
}

module.exports = {
  isEmptyDate: isEmptyDate,
  isDeleted: function (rec) {
    return !isEmptyDate(rec.get("deleted_at"));
  },
  run: function (app) {
    var records = app.findAllRecords("points");
    var now = Date.now();
    var ttlH = Number(env.get("POTRZEBA_TTL_H", "72")) || 72;
    if (ttlH < 0) ttlH = 72;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.get("category") !== "potrzeba") continue;
      if (module.exports.isDeleted(r)) continue;
      var expMs = dateMs(r.get("expires_at"));
      if (!expMs) {
        var createdMs = dateMs(r.get("created"));
        if (!createdMs) continue;
        expMs = createdMs + ttlH * 3600 * 1000;
      }
      try {
        if (now >= expMs && r.get("status") !== "expired") {
          r.set("status", "expired");
          app.save(r);
        }
        if (now >= expMs + 7 * 86400000 && !r.getBool("ttl_purged")) {
          r.set("description", "");
          r.set("contact_public", "");
          r.set("contact_operator", "");
          r.set("title", "Zgłoszenie usunięte");
          r.set("ttl_purged", true);
          app.save(r);
        }
      } catch (err) {
        console.log("expire_fail", r.id, String(err));
      }
    }
    var logs = app.findRecordsByFilter("sync_log", "", "-at", 5000, 0);
    if (logs.length > 2000) {
      for (var j = 2000; j < logs.length; j++) {
        try {
          app.delete(logs[j]);
        } catch (e) {}
      }
    }
  },
};
