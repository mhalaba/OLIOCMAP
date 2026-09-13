/** Pola synchroniczne rekordu points (kanoniczny JSON + merge). */
export const SYNCABLE_FIELDS = [
  "id",
  "source_node",
  "hlc",
  "field_hlc",
  "updated_at",
  "deleted_at",
  "schema_version",
  "conflict",
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

export const SIGN_EXCLUDE = ["sig", "relay_sig", "created_by", "contact_operator", "photo", "assigned_to"];

export const CATEGORIES = [
  "odpornosc",
  "schron",
  "aed",
  "woda",
  "prad",
  "lacznosc",
  "przemysl",
  "potrzeba",
];

export const SERVICES = [
  "ladowanie",
  "ogrzewanie",
  "woda",
  "internet",
  "posilek",
  "nocleg",
  "pierwsza_pomoc",
  "toaleta",
  "informacja",
  "zwierzeta",
];

export const LINK_TYPES = [
  "starlink",
  "wifi_publiczne",
  "pmr446",
  "cb",
  "meshtastic",
  "radioamator",
  "telefon_satelitarny",
];

export const CAPABILITIES = [
  "warsztat",
  "spawanie",
  "zywnosc",
  "woda",
  "paliwo_detal",
  "leki_wydawanie",
  "transport",
  "magazyn",
  "agregat",
  "sprzet_ciezki",
  "nocleg",
];

export const HOST_TYPES = ["osp", "gmina", "szkola", "parafia", "firma", "prywatny", "inny"];
export const ACTIVATIONS = ["stale", "po_alarmie", "po_godzinach_bez_pradu"];
export const STATUSES = ["pending", "verified", "rejected", "expired"];
export const PUBLIC_GEOMS = ["precise", "gmina", "hidden"];
export const NEED_TYPES = ["woda", "zywnosc", "leki", "prad", "ewakuacja", "opieka", "inne"];
export const URGENCIES = ["niska", "srednia", "wysoka"];
export const ROLES = ["citizen", "zaufany", "operator", "admin"];

export const COLLECTIONS = [
  "users",
  "points",
  "peers",
  "sync_log",
  "node_status",
  "audit",
  "reports",
  "invites",
  "hlc_state",
];

export const SCHEMA_VERSION = 2;
export const CLOCK_SKEW_MS = 10 * 60 * 1000;
export const OSM_RASTER = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
