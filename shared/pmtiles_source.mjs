/** Dzienny build Protomaps żyje ok. tygodnia — nie hardcoduj daty. */
export const BUILD_HOST = "https://build.protomaps.com";
export const BUILDS_INDEX = "https://maps.protomaps.com/builds/";
export const FALLBACK_SOURCE = "https://data.source.coop/protomaps/openstreetmap/v4.pmtiles";
const UA = { "User-Agent": "MapaKryzysowa/1.0" };

export function dateStampUtc(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function candidateDatedUrls(now = new Date(), days = 8) {
  const out = [];
  const t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = 0; i < days; i += 1) {
    out.push(`${BUILD_HOST}/${dateStampUtc(new Date(t0 - i * 86400000))}.pmtiles`);
  }
  return out;
}

export function parseBuildsPage(html) {
  const urls = [];
  const seen = new Set();
  const re = /https:\/\/build\.protomaps\.com\/(\d{8})\.pmtiles/g;
  let m = re.exec(String(html || ""));
  while (m) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      urls.push(m[0]);
    }
    m = re.exec(String(html || ""));
  }
  return urls;
}

export function isUsableSourceConfig(value) {
  const s = String(value || "").trim();
  if (!s || s.toLowerCase() === "auto") return false;
  return /^https?:\/\//i.test(s);
}

async function fetchWithTimeout(fetchFn, url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchFn(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function urlServesPmtiles(url, fetchFn = fetch, timeoutMs = 12000) {
  try {
    const head = await fetchWithTimeout(fetchFn, url, { method: "HEAD", headers: UA }, timeoutMs);
    if (head && head.ok) return true;
    const status = head && head.status;
    if (status === 405 || status === 501 || status === 403) {
      const get = await fetchWithTimeout(
        fetchFn,
        url,
        { method: "GET", headers: { ...UA, Range: "bytes=0-15" } },
        timeoutMs
      );
      return Boolean(get && (get.ok || get.status === 206));
    }
  } catch {
    return false;
  }
  return false;
}

export async function resolvePmtilesSource({ configured = "auto", fetchFn = fetch, now = new Date() } = {}) {
  if (isUsableSourceConfig(configured)) {
    const pinned = String(configured).trim();
    if (await urlServesPmtiles(pinned, fetchFn)) return pinned;
  }

  const queue = [];
  try {
    const page = await fetchWithTimeout(
      fetchFn,
      BUILDS_INDEX,
      { method: "GET", headers: { ...UA, Accept: "text/html" } },
      15000
    );
    if (page && page.ok && typeof page.text === "function") {
      queue.push(...parseBuildsPage(await page.text()));
    }
  } catch {
    /* daty z kalendarza */
  }
  queue.push(...candidateDatedUrls(now));
  queue.push(FALLBACK_SOURCE);

  const seen = new Set();
  for (const url of queue) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (await urlServesPmtiles(url, fetchFn)) return url;
  }
  throw new Error(
    "Nie znaleziono dziennego buildu mapy (Protomaps). Sprawdź sieć albo wgraj plik PMTiles z USB."
  );
}
