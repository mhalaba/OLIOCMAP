/// <reference path="../pb_data/types.d.ts" />

function flexibleId(collection) {
  var id = collection.fields.getByName("id");
  if (!id) return;
  id.min = 3;
  id.max = 40;
  id.pattern = "^[a-z0-9-]+$";
  id.autogeneratePattern = "[a-z0-9]{15}";
}

function adminOperatorRule() {
  return "@request.auth.role = 'admin' || @request.auth.role = 'operator'";
}

migrate((app) => {
  var users = app.findCollectionByNameOrId("users");

  var peers = new Collection({
    name: "peers",
    type: "base",
    listRule: adminOperatorRule(),
    viewRule: adminOperatorRule(),
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "node_id", type: "text", required: true, max: 40 },
      { name: "base_url", type: "text", max: 300 },
      { name: "public_key", type: "text", max: 400 },
      { name: "trusted", type: "bool" },
      { name: "role", type: "select", maxSelect: 1, values: ["node", "central"] },
      { name: "last_seen", type: "date" },
      { name: "last_pull_cursor", type: "text", max: 80 },
      { name: "last_push_cursor", type: "text", max: 80 },
      { name: "note", type: "text", max: 300 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_peers_node ON peers (node_id)"],
  });
  flexibleId(peers);
  app.save(peers);

  var syncLog = new Collection({
    name: "sync_log",
    type: "base",
    listRule: adminOperatorRule(),
    viewRule: adminOperatorRule(),
    createRule: null,
    updateRule: null,
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "direction", type: "select", maxSelect: 1, values: ["pull", "push", "health"] },
      { name: "peer", type: "text", max: 40 },
      { name: "ok", type: "bool" },
      { name: "count", type: "number", onlyInt: true },
      { name: "error", type: "text", max: 500 },
      { name: "at", type: "date" },
    ],
  });
  flexibleId(syncLog);
  app.save(syncLog);

  var nodeStatus = new Collection({
    name: "node_status",
    type: "base",
    listRule: adminOperatorRule(),
    viewRule: adminOperatorRule(),
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "node_id", type: "text", max: 40 },
      { name: "mode", type: "select", maxSelect: 1, values: ["wyspa", "sync"] },
      { name: "last_pull", type: "date" },
      { name: "last_push", type: "date" },
      { name: "last_error", type: "text", max: 500 },
      { name: "counts", type: "json" },
      { name: "peers", type: "json" },
      { name: "public_key", type: "text", max: 400 },
    ],
  });
  flexibleId(nodeStatus);
  app.save(nodeStatus);

  var audit = new Collection({
    name: "audit",
    type: "base",
    listRule: adminOperatorRule(),
    viewRule: adminOperatorRule(),
    createRule: null,
    updateRule: null,
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      {
        name: "actor",
        type: "relation",
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        name: "action",
        type: "select",
        maxSelect: 1,
        values: ["verify", "reject", "confirm", "block", "unblock", "edit", "delete", "import", "export", "assign"],
      },
      { name: "point_id", type: "text", max: 40 },
      { name: "before", type: "json" },
      { name: "after", type: "json" },
      { name: "at", type: "date" },
    ],
  });
  flexibleId(audit);
  app.save(audit);

  var reports = new Collection({
    name: "reports",
    type: "base",
    listRule: adminOperatorRule(),
    viewRule: adminOperatorRule(),
    createRule: "",
    updateRule: adminOperatorRule(),
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "point_id", type: "text", max: 40 },
      {
        name: "reason",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["nie_istnieje", "zamkniete", "zly_adres", "inne"],
      },
      { name: "text", type: "text", max: 500 },
      {
        name: "created_by",
        type: "relation",
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "handled", type: "bool" },
    ],
  });
  flexibleId(reports);
  app.save(reports);

  var invites = new Collection({
    name: "invites",
    type: "base",
    listRule: adminOperatorRule(),
    viewRule: adminOperatorRule(),
    createRule: adminOperatorRule(),
    updateRule: adminOperatorRule(),
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      { name: "code", type: "text", required: true, min: 8, max: 8 },
      {
        name: "created_by",
        type: "relation",
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "uses_left", type: "number", onlyInt: true },
      { name: "expires_at", type: "date" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_invites_code ON invites (code)"],
  });
  flexibleId(invites);
  app.save(invites);

  var hlc = new Collection({
    name: "hlc_state",
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "last_ms", type: "number", onlyInt: true },
      { name: "counter", type: "number", onlyInt: true },
    ],
  });
  flexibleId(hlc);
  app.save(hlc);
}, (app) => {
  ["peers", "sync_log", "node_status", "audit", "reports", "invites", "hlc_state"].forEach(function (n) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (e) {}
  });
});
