/// <reference path="../pb_data/types.d.ts" />

/**
 * Historycznie ta nazwa sortuje się PRZED 1740000002_local.js ('5' < '_'),
 * więc tu łataj tylko to, co już istnieje (users, points).
 * Kolekcje lokalne dostają tę samą łatkę w 1740000002 po app.save().
 */
migrate((app) => {
  var names = ["points", "users", "peers", "sync_log", "node_status", "audit", "reports", "invites", "hlc_state"];
  for (var i = 0; i < names.length; i++) {
    try {
      var c = app.findCollectionByNameOrId(names[i]);
      var id = c.fields.getByName("id");
      if (!id) continue;
      id.min = 15;
      id.max = 40;
      id.pattern = "^[a-z0-9-]+$";
      id.autogeneratePattern = "[a-z0-9]{15}";
      app.save(c);
    } catch (e) {
      /* kolekcja jeszcze nie istnieje */
    }
  }
});
