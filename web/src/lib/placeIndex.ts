import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Wyszukiwanie ulic i miejscowości bez internetu.
 *
 * Nie ma tu geokodera. Nazwy bierzemy z tego samego pliku PMTiles, który rysuje mapę:
 * warstwy `places` (miejscowości, dzielnice) i `roads` (ulice). Dzięki temu szukanie
 * działa na węźle odciętym od sieci i nie wysyła nigdzie tego, czego szuka mieszkaniec.
 *
 * Ograniczenie jest wpisane w tę metodę: MapLibre widzi tylko kafelki, które zdążył wczytać.
 * Dlatego zbieramy nazwy po każdym uspokojeniu mapy i trzymamy je na czas sesji — im więcej
 * ktoś pooglądał gminę, tym więcej znajdzie. Numerów domów w podkładzie nie ma wcale.
 */

export type PlaceHit = {
  name: string;
  /** `miejscowosc` — z warstwy places, `ulica` — z warstwy roads. */
  kind: "miejscowosc" | "ulica";
  lng: number;
  lat: number;
  /** Im mniejsza, tym ważniejsze miejsce (miasto przed przysiółkiem). */
  rank: number;
};

const MAX_ENTRIES = 4000;
const index = new Map<string, PlaceHit>();

/** „Piłsudskiego” ma się znaleźć po wpisaniu „pilsudskiego”. */
export function foldPolish(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function placeRank(kind: unknown): number {
  const k = String(kind || "");
  if (k === "locality" || k === "city") return 0;
  if (k === "town") return 1;
  if (k === "village" || k === "hamlet") return 2;
  if (k === "neighbourhood" || k === "suburb") return 3;
  return 4;
}

function featureName(props: Record<string, unknown> | null): string {
  if (!props) return "";
  const raw = props["name:pl"] ?? props.name ?? props["name:en"];
  const name = typeof raw === "string" ? raw.trim() : "";
  return name.length >= 2 && name.length <= 80 ? name : "";
}

/** Punkt reprezentatywny: dla linii bierzemy środkowy wierzchołek, nie początek. */
function representativePoint(geometry: GeoJSON.Geometry | undefined): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Point") return geometry.coordinates as [number, number];
  if (geometry.type === "LineString") {
    const c = geometry.coordinates;
    return c.length ? (c[Math.floor(c.length / 2)] as [number, number]) : null;
  }
  if (geometry.type === "MultiLineString") {
    const first = geometry.coordinates[0] || [];
    return first.length ? (first[Math.floor(first.length / 2)] as [number, number]) : null;
  }
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] || [];
    return ring.length ? (ring[Math.floor(ring.length / 2)] as [number, number]) : null;
  }
  return null;
}

function keyOf(name: string, kind: PlaceHit["kind"], lng: number, lat: number): string {
  // Ta sama ulica wraca w wielu kafelkach i wielu odcinkach. Zaokrąglenie do ~1 km
  // scala odcinki jednej ulicy w dzielnicy, ale nie myli dwóch „Leśnych” z różnych wsi.
  return `${kind}:${foldPolish(name)}:${lng.toFixed(2)}:${lat.toFixed(2)}`;
}

/** Dopisz jedną nazwę. Zwraca false, gdy już ją mamy albo indeks jest pełny. */
export function addPlace(hit: PlaceHit): boolean {
  if (index.size >= MAX_ENTRIES) return false;
  const key = keyOf(hit.name, hit.kind, hit.lng, hit.lat);
  if (index.has(key)) return false;
  index.set(key, hit);
  return true;
}

/** Zbierz nazwy z kafelków, które mapa ma właśnie wczytane. Idempotentne. */
export function harvest(map: MapLibreMap): number {
  if (index.size >= MAX_ENTRIES) return 0;
  let added = 0;
  const take = (sourceLayer: string, kind: PlaceHit["kind"]) => {
    let feats: GeoJSON.Feature[] = [];
    try {
      feats = map.querySourceFeatures("basemap", { sourceLayer }) as unknown as GeoJSON.Feature[];
    } catch {
      return;
    }
    for (const f of feats) {
      if (index.size >= MAX_ENTRIES) return;
      const name = featureName(f.properties as Record<string, unknown> | null);
      if (!name) continue;
      const pt = representativePoint(f.geometry);
      if (!pt) continue;
      const [lng, lat] = pt;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const rank = kind === "miejscowosc" ? placeRank((f.properties as Record<string, unknown>)?.kind) : 5;
      if (addPlace({ name, kind, lng, lat, rank })) added += 1;
    }
  };
  take("places", "miejscowosc");
  take("roads", "ulica");
  return added;
}

export function indexSize(): number {
  return index.size;
}

export function clearIndex(): void {
  index.clear();
}

/**
 * Szukaj po nazwie. Najpierw trafienia od początku nazwy, potem w środku;
 * przy remisie ważniejsza miejscowość, a potem krótsza nazwa.
 */
export function searchPlaces(query: string, limit = 6): PlaceHit[] {
  const q = foldPolish(query.trim());
  if (q.length < 2) return [];
  const scored: { hit: PlaceHit; score: number }[] = [];
  for (const hit of index.values()) {
    const folded = foldPolish(hit.name);
    const at = folded.indexOf(q);
    if (at < 0) continue;
    scored.push({ hit, score: (at === 0 ? 0 : 100) + hit.rank * 10 + Math.min(hit.name.length, 40) / 40 });
  }
  scored.sort((a, b) => a.score - b.score);
  const out: PlaceHit[] = [];
  const seen = new Set<string>();
  for (const { hit } of scored) {
    const dedupe = `${hit.kind}:${foldPolish(hit.name)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}
