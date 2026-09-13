/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase ≥ 0.23: created/updated to zwykłe pola autodate.
 * Bez nich sort=-created zwraca 400 i UI (/moje, kolejka) pokazuje pustą listę.
 */
migrate((app) => {
  var names = ["points", "peers", "sync_log", "node_status", "audit", "reports", "invites", "hlc_state"];
  for (var i = 0; i < names.length; i++) {
    var c = app.findCollectionByNameOrId(names[i]);
    if (!c.fields.getByName("created")) {
      c.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
    }
    if (!c.fields.getByName("updated")) {
      c.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    }
    app.save(c);
  }
});
