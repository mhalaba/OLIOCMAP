/// <reference path="../pb_data/types.d.ts" />

cronAdd("expire", "* * * * *", () => {
  require(`${__hooks}/lib/expire.js`).run($app);
});

cronAdd("counts", "*/2 * * * *", () => {
  var env = require(`${__hooks}/lib/env.js`);
  var expire = require(`${__hooks}/lib/expire.js`);
  try {
    var rec = $app.findRecordById("node_status", env.SELF_ID);
    var points = $app.findAllRecords("points");
    var by_category = {};
    var by_status = {};
    for (var i = 0; i < points.length; i++) {
      var r = points[i];
      if (expire.isDeleted(r)) continue;
      var c = r.get("category") || "inne";
      var s = r.get("status") || "pending";
      by_category[c] = (by_category[c] || 0) + 1;
      by_status[s] = (by_status[s] || 0) + 1;
    }
    rec.set("counts", { by_category: by_category, by_status: by_status });
    rec.set("node_id", env.get("NODE_ID", "bytom-01"));
    $app.save(rec);
  } catch (e) {}
});
