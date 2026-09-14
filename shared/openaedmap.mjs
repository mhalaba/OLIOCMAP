/** Konwersja GeoJSON OpenAEDMap / OSM (emergency=defibrillator) na rekordy points. */

export const OPENAEDMAP_PL_URL = "https://openaedmap.org/api/v1/countries/PL.geojson";

export function aedRecordId(osmId) {
  const n = String(osmId ?? "").replace(/\D/g, "");
  if (!n) return "";
  let id = "aed" + n;
  if (id.length < 15) id = "aed" + n.padStart(12, "0");
  return id.slice(0, 40);
}

export function parseBbox(raw) {
  if (!raw || !String(raw).trim()) return null;
  const parts = String(raw)
    .split(",")
    .map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  return { minLon, minLat, maxLon, maxLat };
}

export function inBbox(lon, lat, bbox) {
  if (!bbox) return true;
  return lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat;
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n - 1).trim() + "…";
}

function hostType(operator) {
  const s = String(operator || "").toLowerCase();
  if (/osp|straż|straz|remiza/.test(s)) return "osp";
  if (/szko[łl]a|przedszkole|uczelnia|uniwersytet/.test(s)) return "szkola";
  if (/urząd|urzad|gmina|miasto|starost|powiat/.test(s)) return "gmina";
  if (/parafi|kościół|kosciol|diecezj/.test(s)) return "parafia";
  if (/sp\.|s\.a\.|firma|spółka|spolka/.test(s)) return "firma";
  if (s) return "inny";
  return "inny";
}

function addressOf(p) {
  const street = [p["addr:street"], p["addr:housenumber"]].filter(Boolean).join(" ");
  const city = p["addr:city"] || p["addr:place"] || "";
  return clip([street, city].filter(Boolean).join(", "), 200);
}

function titleOf(p, gmina) {
  const loc = p["defibrillator:location:pl"] || p["defibrillator:location"] || p.name || p.description || "";
  const city = p["addr:city"] || gmina || "";
  const core = loc || (city ? `AED — ${city}` : "AED");
  let t = clip(core, 80);
  if (t.length < 3) t = city ? clip(`AED — ${city}`, 80) : "AED — OpenAEDMap";
  return t;
}

export function featureToPoint(feature, opts = {}) {
  if (!feature || feature.type !== "Feature") return null;
  const g = feature.geometry;
  if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) return null;
  const lon = Number(g.coordinates[0]);
  const lat = Number(g.coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (opts.bbox && !inBbox(lon, lat, opts.bbox)) return null;
  const p = feature.properties || {};
  const osmId = p["@osm_id"] || p.osm_id || p.id;
  const id = aedRecordId(osmId);
  if (!id) return null;
  const osmType = p["@osm_type"] || "node";
  const loc = p["defibrillator:location:pl"] || p["defibrillator:location"] || p.description || "";
  const access = p.access ? `Dostęp: ${p.access}.` : "";
  const indoor = p.indoor === "yes" ? "Wewnątrz budynku." : p.indoor === "no" ? "Na zewnątrz." : "";
  const desc = clip(
    [loc, access, indoor, p.operator ? `Operator OSM: ${p.operator}.` : "", "Źródło: OpenAEDMap (OpenStreetMap). Potwierdź w terenie."]
      .filter(Boolean)
      .join(" "),
    1000
  );
  const phone = String(p.phone || p["emergency:phone"] || "").replace(/\s/g, "");
  const contact = /\d{11}/.test(phone) ? "" : clip(p.phone || p["emergency:phone"] || "", 120);
  const check = String(p.check_date || "").trim();
  let lastConfirmed = "";
  if (/^\d{4}-\d{2}-\d{2}/.test(check)) lastConfirmed = check.slice(0, 10) + " 00:00:00.000Z";
  const hours = clip(p.opening_hours || "", 200);
  return {
    id,
    category: "aed",
    title: titleOf(p, opts.gminaName || ""),
    description: desc,
    lat,
    lon,
    public_lat: lat,
    public_lon: lon,
    public_geom: "precise",
    address: addressOf(p),
    status: "verified",
    blocked: false,
    host_type: hostType(p.operator),
    services: [],
    hours,
    opening_hours: hours,
    contact_public: contact,
    consent: true,
    civilians_ok: true,
    external_ref: `osm:${osmType}:${osmId}`,
    last_confirmed_at: lastConfirmed,
    confirm_interval_days: 365,
    activation: "stale",
    gmina_name: opts.gminaName || "",
    gmina_teryt: opts.gminaTeryt || "",
    schema_version: 2,
  };
}

export function geojsonToPoints(fc, opts = {}) {
  const features = fc && Array.isArray(fc.features) ? fc.features : [];
  const out = [];
  const seen = new Set();
  for (const f of features) {
    const rec = featureToPoint(f, opts);
    if (!rec || seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return out;
}
