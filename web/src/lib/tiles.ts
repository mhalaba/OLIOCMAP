import { PMTiles, type Protocol } from "pmtiles";

/**
 * Kafelki offline: na węźle może leżeć dowolny plik *.pmtiles (np. slask-z13.pmtiles).
 * Prawda jest w /tiles/index.json (generowany na węźle). style.json ma placeholder
 * local.pmtiles — nazwa jest zawsze nadpisywana tym, co tu znajdziemy. Nie traktuj
 * braku poland.pmtiles jako braku mapy, gdy index wymienia inny plik.
 */
const KNOWN_FILES = ["slask-z13.pmtiles", "poland.pmtiles"];

export type TileCoverage = {
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
};

export type TilesInfo = { file: string; url: string; coverage: TileCoverage | null };

const NO_STORE: RequestInit = { cache: "no-store" };

async function head(path: string): Promise<boolean> {
  try {
    const r = await fetch(path, { method: "HEAD", ...NO_STORE });
    // SPA fallback z Caddy odpowiada 200 text/html na wszystko — to nie jest plik kafelków.
    const ct = r.headers.get("content-type") || "";
    return r.ok && !ct.includes("text/html");
  } catch {
    return false;
  }
}

export async function findTilesFile(): Promise<string> {
  try {
    const r = await fetch("/tiles/index.json", NO_STORE);
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
      const idx = (await r.json()) as { files?: string[] };
      // index bywa nieświeży (plik skasowany z USB, przerwane pobieranie) — potwierdzamy HEAD-em.
      for (const f of (idx.files || []).filter((x) => x.endsWith(".pmtiles"))) {
        if (await head(`/tiles/${encodeURIComponent(f)}`)) return f;
      }
    }
  } catch {
    /* brak index.json — sprawdzamy znane nazwy */
  }
  for (const f of KNOWN_FILES) {
    if (await head(`/tiles/${encodeURIComponent(f)}`)) return f;
  }
  return "";
}

export async function readCoverage(url: string, protocol?: Protocol): Promise<TileCoverage | null> {
  try {
    const pm = new PMTiles(url);
    const h = await pm.getHeader();
    // Ten sam obiekt do protokołu pmtiles:// — MapLibre nie czyta nagłówka drugi raz.
    protocol?.add(pm);
    if (!Number.isFinite(h.minLon) || !Number.isFinite(h.maxLon)) return null;
    return { bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat], minZoom: h.minZoom, maxZoom: h.maxZoom };
  } catch {
    return null;
  }
}

export async function resolveTiles(protocol?: Protocol): Promise<TilesInfo | null> {
  if (import.meta.env.DEV) {
    // Tylko `npm run dev`: ?tiles=https://…/plik.pmtiles pozwala sprawdzić styl bez kafelków na węźle.
    const override = new URLSearchParams(window.location.search).get("tiles");
    if (override) return { file: override.split("/").pop() || "", url: override, coverage: await readCoverage(override, protocol) };
  }
  const file = await findTilesFile();
  if (!file) return null;
  const url = `${window.location.origin}/tiles/${encodeURIComponent(file)}`;
  return { file, url, coverage: await readCoverage(url, protocol) };
}

export function insideCoverage(cov: TileCoverage | null, lng: number, lat: number): boolean {
  if (!cov) return true;
  const [w, s, e, n] = cov.bounds;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** Nazwa zasięgu do komunikatu — z pliku (slask-z13 → „Śląsk”), inaczej ogólnie. */
export function coverageName(file: string): string {
  const base = file.replace(/\.pmtiles$/, "").toLowerCase();
  if (base.startsWith("slask")) return "Śląsk";
  if (base.startsWith("polska") || base.startsWith("poland")) return "Polska";
  return base;
}
