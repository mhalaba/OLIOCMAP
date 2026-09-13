export function env(key, fallback = "") {
  const v = process.env[key];
  if (v === undefined || v === null || v === "") return fallback;
  return v;
}

export const cfg = {
  nodeId: env("NODE_ID", "bytom-01"),
  nodeRole: env("NODE_ROLE", "node"),
  nodeName: env("NODE_NAME", ""),
  pbUrl: env("PB_URL", "http://pocketbase:8090"),
  syncEmail: env("SYNC_SUPERUSER_EMAIL", "sync@node.local"),
  syncPassword: env("SYNC_SUPERUSER_PASSWORD", "change-me-too"),
  interval: Math.max(5, Number(env("SYNC_INTERVAL_S", "30")) || 30),
  centralUrl: env("CENTRAL_URL", ""),
  peersJson: env("PEERS", ""),
  keysDir: env("KEYS_DIR", "/keys"),
  listen: Number(env("SYNC_PORT", "8091")) || 8091,
  appVersion: env("APP_VERSION", "0.1.0"),
  buildTime: Number(env("BUILD_TIME_MS", "0")) || 0,
  gminaName: env("NODE_GMINA_NAME", "Bytom"),
  gminaTeryt: env("NODE_GMINA_TERYT", "2462011"),
  aedImport: env("AED_IMPORT", "bundled"),
  aedBbox: env("AED_BBOX", ""),
  aedBundlePath: env("AED_BUNDLE_PATH", "/app/data/openaedmap-pl.geojson.gz"),
  tilesDir: env("TILES_DIR", "/tiles"),
  tilesBbox: env("TILES_BBOX", "18.82,50.30,18.98,50.42"),
  tilesMaxzoom: env("TILES_MAXZOOM", "14"),
  pmtilesSource: env("PMTILES_SOURCE", "https://build.protomaps.com/20260904.pmtiles"),
  pmtilesBin: env("PMTILES_BIN", "pmtiles"),
};

export function parsePeersEnv() {
  const out = [];
  if (cfg.centralUrl) {
    out.push({ node_id: "central-01", base_url: cfg.centralUrl.replace(/\/$/, ""), role: "central" });
  }
  if (cfg.peersJson) {
    try {
      const arr = JSON.parse(cfg.peersJson);
      for (const p of arr) {
        if (p && p.node_id && p.base_url) {
          out.push({
            node_id: p.node_id,
            base_url: String(p.base_url).replace(/\/$/, ""),
            role: p.role || "node",
          });
        }
      }
    } catch (err) {
      console.error("PEERS JSON niepoprawny", err);
    }
  }
  const seen = new Set();
  return out.filter((p) => {
    if (seen.has(p.node_id) || p.node_id === cfg.nodeId) return false;
    seen.add(p.node_id);
    return true;
  });
}
