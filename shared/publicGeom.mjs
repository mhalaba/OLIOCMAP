/**
 * public_lat/lon: precise copy; gmina = round 2 decimals + deterministic jitter ±0.005°;
 * hidden = null.
 */

export function hexToUnit(hex8) {
  const n = parseInt(hex8.slice(0, 8), 16);
  if (!Number.isFinite(n)) return 0.5;
  return n / 0xffffffff;
}

export function jitterFromSha256(sha256hex) {
  const h = String(sha256hex).toLowerCase();
  const jLat = (hexToUnit(h.slice(0, 8)) * 2 - 1) * 0.005;
  const jLon = (hexToUnit(h.slice(8, 16)) * 2 - 1) * 0.005;
  return { jLat, jLon };
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function publicCoords(id, lat, lon, mode, sha256hex) {
  if (mode === "hidden" || lat === null || lon === null || lat === undefined || lon === undefined) {
    return { public_lat: null, public_lon: null };
  }
  if (mode === "precise") {
    return { public_lat: Number(lat), public_lon: Number(lon) };
  }
  const { jLat, jLon } = jitterFromSha256(sha256hex);
  return {
    public_lat: round2(lat) + jLat,
    public_lon: round2(lon) + jLon,
  };
}

export function defaultPublicGeom(category, hostType, envMode, explicit) {
  if (category === "potrzeba") return "hidden";
  if (explicit === "precise" || explicit === "gmina" || explicit === "hidden") {
    return explicit;
  }
  const mode = envMode || "gmina";
  if (category === "lacznosc") return mode;
  if (category === "prad" && hostType === "prywatny") return mode;
  return "precise";
}
