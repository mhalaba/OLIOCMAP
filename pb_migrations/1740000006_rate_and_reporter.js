/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var settings = app.settings();
  settings.rateLimits.enabled = true;
  // Wyspa OSP: mapa + baner + kolejka operatora nie mogą dostać 429 po kilku tapnięciach.
  // Rejestracja gości nadal ograniczona (spam).
  settings.rateLimits.rules = [
    { label: "users:create", duration: 60, maxRequests: 8, audience: "@guest" },
    { label: "points:create", duration: 60, maxRequests: 40, audience: "@auth" },
    { label: "/api/", duration: 5, maxRequests: 400, audience: "" },
  ];
  app.save(settings);

  var points = app.findCollectionByNameOrId("points");
  if (!points.fields.getByName("reporter_role")) {
    points.fields.add(new TextField({ name: "reporter_role", max: 20 }));
    app.save(points);
  }

  var all = app.findAllRecords("points");
  for (var i = 0; i < all.length; i++) {
    if (all[i].get("reporter_role")) continue;
    var uid = all[i].get("created_by");
    if (!uid) continue;
    try {
      var u = app.findRecordById("users", String(uid));
      all[i].set("reporter_role", u.get("role") || "citizen");
      app.save(all[i]);
    } catch (e) {}
  }
});
