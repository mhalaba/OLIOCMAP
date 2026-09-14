/// <reference path="../pb_data/types.d.ts" />

function patchRecordId(app, name) {
  var c = app.findCollectionByNameOrId(name);
  var id = c.fields.getByName("id");
  if (!id) return;
  id.min = 15;
  id.max = 40;
  id.pattern = "^[a-z0-9-]+$";
  id.autogeneratePattern = "[a-z0-9]{15}";
  app.save(c);
}

function envelopeFields() {
  return [
    { name: "source_node", type: "text", max: 40 },
    { name: "hlc", type: "text", max: 80 },
    { name: "field_hlc", type: "json" },
    { name: "updated_at", type: "date" },
    { name: "deleted_at", type: "date" },
    { name: "sig", type: "text", max: 200 },
    { name: "relay_sig", type: "text", max: 200 },
    { name: "conflict", type: "bool" },
    { name: "schema_version", type: "number", onlyInt: true },
  ];
}

migrate((app) => {
  var users = app.findCollectionByNameOrId("users");

  var points = new Collection({
    name: "points",
    type: "base",
    listRule:
      "(status = 'verified' && blocked = false && category != 'potrzeba' && (deleted_at = '' || deleted_at = null)) || (created_by = @request.auth.id) || (@request.auth.role = 'operator' || @request.auth.role = 'admin')",
    viewRule:
      "(status = 'verified' && blocked = false && category != 'potrzeba' && (deleted_at = '' || deleted_at = null)) || (created_by = @request.auth.id) || (@request.auth.role = 'operator' || @request.auth.role = 'admin')",
    createRule: "@request.auth.id != ''",
    updateRule:
      "@request.auth.role = 'operator' || @request.auth.role = 'admin' || (created_by = @request.auth.id && status = 'pending')",
    deleteRule: "@request.auth.role = 'operator' || @request.auth.role = 'admin'",
    fields: envelopeFields().concat([
      {
        name: "category",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["odpornosc", "schron", "aed", "woda", "prad", "lacznosc", "przemysl", "potrzeba"],
      },
      { name: "title", type: "text", required: true, min: 3, max: 80 },
      { name: "description", type: "text", max: 1000 },
      { name: "lat", type: "number" },
      { name: "lon", type: "number" },
      { name: "public_lat", type: "number" },
      { name: "public_lon", type: "number" },
      {
        name: "public_geom",
        type: "select",
        maxSelect: 1,
        values: ["precise", "gmina", "hidden"],
      },
      { name: "gmina_teryt", type: "text", max: 16 },
      { name: "gmina_name", type: "text", max: 80 },
      { name: "address", type: "text", max: 200 },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["pending", "verified", "rejected", "expired"],
      },
      { name: "blocked", type: "bool" },
      {
        name: "host_type",
        type: "select",
        maxSelect: 1,
        values: ["osp", "gmina", "szkola", "parafia", "firma", "prywatny", "inny"],
      },
      { name: "services", type: "json" },
      { name: "link_type", type: "json" },
      { name: "capability", type: "json" },
      { name: "capacity", type: "number", onlyInt: true },
      {
        name: "activation",
        type: "select",
        maxSelect: 1,
        values: ["stale", "po_alarmie", "po_godzinach_bez_pradu"],
      },
      { name: "activation_hours", type: "number", onlyInt: true },
      { name: "autonomy_h", type: "number" },
      { name: "hours", type: "text", max: 200 },
      { name: "opening_hours", type: "text", max: 200 },
      { name: "contact_public", type: "text", max: 120 },
      { name: "contact_operator", type: "text", max: 200, hidden: true },
      { name: "consent", type: "bool" },
      { name: "civilians_ok", type: "bool" },
      {
        name: "photo",
        type: "file",
        maxSelect: 1,
        maxSize: 2097152,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        thumbs: ["200x200f"],
      },
      {
        name: "created_by",
        type: "relation",
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "verified_by_node", type: "text", max: 40 },
      { name: "verified_at", type: "date" },
      { name: "last_confirmed_at", type: "date" },
      { name: "confirm_interval_days", type: "number", onlyInt: true },
      { name: "expires_at", type: "date" },
      { name: "ttl_purged", type: "bool" },
      { name: "external_ref", type: "text", max: 80 },
      {
        name: "need_type",
        type: "select",
        maxSelect: 1,
        values: ["woda", "zywnosc", "leki", "prad", "ewakuacja", "opieka", "inne"],
      },
      { name: "people", type: "number", onlyInt: true },
      {
        name: "urgency",
        type: "select",
        maxSelect: 1,
        values: ["niska", "srednia", "wysoka"],
      },
      {
        name: "assigned_to",
        type: "relation",
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "resolved_at", type: "date" },
      { name: "photo_sha256", type: "text", max: 64 },
    ]),
    indexes: [
      "CREATE INDEX idx_points_status ON points (status)",
      "CREATE INDEX idx_points_hlc ON points (hlc)",
      "CREATE INDEX idx_points_category ON points (category)",
      "CREATE INDEX idx_points_source ON points (source_node)",
    ],
  });

  app.save(points);
  patchRecordId(app, "points");
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("points"));
  } catch (e) {}
});
