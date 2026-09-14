/** Pola zapisywane przy upsert z sync (bez created_by / contact_operator / photo). */
export const UPSERT_FIELDS = [
  "source_node",
  "hlc",
  "field_hlc",
  "updated_at",
  "deleted_at",
  "sig",
  "relay_sig",
  "conflict",
  "schema_version",
  "category",
  "title",
  "description",
  "lat",
  "lon",
  "public_lat",
  "public_lon",
  "public_geom",
  "gmina_teryt",
  "gmina_name",
  "address",
  "status",
  "blocked",
  "host_type",
  "services",
  "link_type",
  "capability",
  "capacity",
  "activation",
  "activation_hours",
  "autonomy_h",
  "hours",
  "opening_hours",
  "contact_public",
  "consent",
  "civilians_ok",
  "verified_by_node",
  "verified_at",
  "last_confirmed_at",
  "confirm_interval_days",
  "expires_at",
  "ttl_purged",
  "external_ref",
  "need_type",
  "people",
  "urgency",
  "resolved_at",
  "photo_sha256",
];

export function rowToBody(row) {
  const body = {};
  for (const f of UPSERT_FIELDS) {
    if (row[f] === undefined) continue;
    body[f] = row[f];
  }
  if (!body.consent) body.consent = true;
  if (body.schema_version == null) body.schema_version = 2;
  return body;
}

export function recordToRow(rec) {
  const row = { id: rec.id };
  for (const f of UPSERT_FIELDS) {
    if (rec[f] !== undefined) row[f] = rec[f];
  }
  row.source_node = rec.source_node;
  return row;
}
