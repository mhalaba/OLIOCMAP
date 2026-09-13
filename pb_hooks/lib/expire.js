module.exports = {
  isDeleted: function (rec) {
    var d = rec.get("deleted_at");
    return d && String(d) !== "" && String(d) !== "0001-01-01 00:00:00.000Z";
  },
  run: function (app) {
    var records = app.findAllRecords("points");
    var now = Date.now();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.get("category") !== "potrzeba") continue;
      if (module.exports.isDeleted(r)) continue;
      var exp = r.getDateTime("expires_at");
      if (!exp || exp.unix() <= 0) continue;
      var expMs = exp.unix() * 1000;
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
    }
    var logs = app.findRecordsByFilter("sync_log", "", "-created", 5000, 0);
    if (logs.length > 2000) {
      for (var j = 2000; j < logs.length; j++) {
        try { app.delete(logs[j]); } catch (e) {}
      }
    }
  },
};
