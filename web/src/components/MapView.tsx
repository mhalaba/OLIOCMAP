import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map, type GeoJSONSource, type Marker } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateControl } from "./LocateControl";
import { t } from "../i18n";
import { addCategoryImagesToMap, categoryIconSrc, mapImageId } from "../icons";
import {
  getAutoLocate,
  getPosition,
  queryGeoPermission,
  setAutoLocatePref,
  shouldAutoLocateOnOpen,
  wasGeoDenied,
  type GeoFail,
  type GeoOk,
} from "../lib/geolocation";
import {
  inPolandBounds,
  POLAND_MASK_GEOJSON,
  POLAND_MAX_BOUNDS,
  POLAND_MAX_ZOOM,
  POLAND_MIN_ZOOM,
  POLAND_SOURCE_BOUNDS,
} from "../lib/poland";
import { coverageName, insideCoverage, resolveTiles, type TileCoverage } from "../lib/tiles";
import { WalkScaleControl } from "../lib/walkScale";
import { GLYPH_FONT, GLYPH_URL, normalizeStyleFonts, registerGlyphProtocol } from "../lib/glyphs";
import { CATEGORY_COLORS, type Category, type Point, type Service } from "../types";
import { activationText, freshnessLabel, isPresentDate } from "../lib/format";
import { asArray } from "../lib/pb";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const BYTOM: [number, number] = [18.923, 50.348];
const GLYPHS = GLYPH_URL;
const OC_BG = "#e8eef4";
const OC_NAVY = "#1e3a5f";

type Props = {
  points: Point[];
  cats: Record<string, boolean>;
  services: Service[];
  pickMode?: boolean;
  onPick?: (lat: number, lon: number) => void;
  onTilesMissing?: (missing: boolean, onlineFallback: boolean) => void;
  /** Widok wyjechał poza bbox pliku PMTiles (np. poza Śląsk) — UI ma to pokazać, nie paść. */
  onCoverage?: (outside: boolean, name: string) => void;
  intervalDays?: number;
  focusPoint?: Point | null;
  focusSeq?: number;
  /** Przytrzymanie palca (~600 ms) albo prawy klik: szybkie zgłoszenie w tym miejscu. */
  onLongPress?: (lat: number, lon: number) => void;
  /** Wydruk: MapLibre musi zachować bufor, żeby canvas trafił na papier. */
  preserveDrawingBuffer?: boolean;
  center?: [number, number];
  zoom?: number;
};

function toFeatures(points: Point[], cats: Record<string, boolean>, services: Service[], intervalDays: number) {
  const feats: GeoJSON.Feature[] = [];
  for (const p of points) {
    if (isPresentDate(p.deleted_at)) continue;
    if (p.blocked) continue;
    if (p.status !== "verified" && p.status !== "pending") continue;
    if (!cats[p.category]) continue;
    if (p.category === "potrzeba") continue;
    const svcs = asArray<Service>(p.services);
    const caps = asArray<string>(p.capability);
    if (services.length && !services.every((s) => svcs.includes(s))) continue;
    const lat = p.public_lat ?? p.lat;
    const lon = p.public_lon ?? p.lon;
    if (lat == null || lon == null || p.public_geom === "hidden") continue;
    const fresh = freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays);
    const pending = p.status === "pending" ? 1 : 0;
    const stale = !pending && fresh.stale ? 1 : 0;
    const autonomy = p.autonomy_h || 0;
    const readiness: "pending" | "stale" | "ok" | "verified" = pending
      ? "pending"
      : stale
        ? "stale"
        : autonomy >= 24
          ? "ok"
          : "verified";
    feats.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: p.id,
        title: p.title,
        category: p.category,
        icon: mapImageId(p.category, readiness),
        color: CATEGORY_COLORS[p.category as Category],
        stale,
        hours: p.hours || "",
        activation: activationText(p.activation, p.activation_hours),
        autonomy,
        readiness,
        services: svcs.join(","),
        capability: caps.join(","),
        source_node: p.source_node || "",
        fresh: fresh.text,
        verified_by: p.verified_by_name || "",
        confirmed_by: p.confirmed_by_name || "",
        address: p.address || "",
        capacity: p.capacity || 0,
        host_type: p.host_type || "",
        geom: p.public_geom || "precise",
        pending,
        plat: lat,
        plon: lon,
      },
    });
  }
  return { type: "FeatureCollection" as const, features: feats };
}

function popupHtml(props: Record<string, unknown>): string {
  const cat = String(props.category || "");
  const color = CATEGORY_COLORS[cat as Category] || OC_NAVY;
  const stale = props.stale === true || props.stale === "true" || props.stale === 1 || props.stale === "1";
  const pending = props.pending === 1 || props.pending === "1";
  const ink = cat === "prad" ? "#0f2744" : "#fff";
  const svcs = String(props.services || "")
    .split(",")
    .filter(Boolean)
    .map((s) => t(`svc.${s}`))
    .join(" · ");
  const caps = String(props.capability || "")
    .split(",")
    .filter(Boolean)
    .map((s) => t(`cap.${s}`))
    .join(" · ");
  const auto = Number(props.autonomy) ? `Autonomia ${props.autonomy} h` : "";
  const cap = Number(props.capacity) ? `${props.capacity} os.` : "";
  const icon = categoryIconSrc(cat);
  return `<div class="popup">
    <span class="cat-badge" style="background:${color};color:${ink}"><img class="cat-icon" src="${icon}" alt="" width="18" height="18">${t("cat." + cat)}</span>
    <h3>${escapeHtml(String(props.title || ""))}</h3>
    ${pending ? `<div class="stale">${escapeHtml(t("status.pending"))}</div>` : `<div class="${stale ? "stale" : "fresh"}">${escapeHtml(String(props.fresh || ""))}</div>`}
    ${props.confirmed_by ? `<div class="who">${escapeHtml(t("map.potwierdzil"))}: ${escapeHtml(String(props.confirmed_by))}</div>` : props.verified_by ? `<div class="who">${escapeHtml(t("map.zweryfikowal"))}: ${escapeHtml(String(props.verified_by))}</div>` : ""}
    ${props.activation ? `<div>${escapeHtml(String(props.activation))}</div>` : ""}
    ${props.hours ? `<div>${escapeHtml(String(props.hours))}</div>` : ""}
    ${auto ? `<div>${auto}</div>` : ""}
    ${cap ? `<div>${cap}</div>` : ""}
    ${svcs ? `<div>${escapeHtml(svcs)}</div>` : ""}
    ${caps ? `<div>${escapeHtml(caps)}</div>` : ""}
    ${props.source_node ? `<div style="font-size:12px;opacity:.7">${escapeHtml(String(props.source_node))}</div>` : ""}
    <div class="row" style="margin-top:8px">
      <a class="btn primary" href="geo:${props.plat},${props.plon}">${t("map.nawiguj")}</a>
      <a class="btn" href="/zglos-blad/${props.id}">${t("map.zglosBlad")}</a>
    </div>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const FALLBACK_LAYERS: maplibregl.LayerSpecification[] = [
  { id: "bg", type: "background", paint: { "background-color": OC_BG } },
  { id: "earth", type: "fill", source: "basemap", "source-layer": "earth", paint: { "fill-color": "#e6edf4" } },
  {
    id: "landcover",
    type: "fill",
    source: "basemap",
    "source-layer": "landcover",
    paint: { "fill-color": "#c5d3c9", "fill-opacity": 0.5 },
  },
  {
    id: "landuse",
    type: "fill",
    source: "basemap",
    "source-layer": "landuse",
    paint: { "fill-color": "#d5dce4", "fill-opacity": 0.35 },
  },
  { id: "water", type: "fill", source: "basemap", "source-layer": "water", paint: { "fill-color": "#5b8fb8" } },
  {
    id: "buildings",
    type: "fill",
    source: "basemap",
    "source-layer": "buildings",
    paint: { "fill-color": "#b8c4d0", "fill-opacity": 0.82 },
  },
  {
    id: "roads-casing",
    type: "line",
    source: "basemap",
    "source-layer": "roads",
    paint: {
      "line-color": OC_NAVY,
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.4, 11, 2.8, 14, 6.4],
    },
  },
  {
    id: "roads",
    type: "line",
    source: "basemap",
    "source-layer": "roads",
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 11, 1.7, 14, 4.6],
    },
  },
  {
    id: "road-labels",
    type: "symbol",
    source: "basemap",
    "source-layer": "roads",
    minzoom: 11,
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "name:pl"], ["get", "name"], ["get", "name:en"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 14, 13.5],
    },
    paint: { "text-color": "#0f2744", "text-halo-color": OC_BG, "text-halo-width": 1.7 },
  },
  {
    id: "place-labels",
    type: "symbol",
    source: "basemap",
    "source-layer": "places",
    minzoom: 7,
    layout: {
      "text-field": ["coalesce", ["get", "name:pl"], ["get", "name"], ["get", "name:en"]],
      "text-font": [GLYPH_FONT],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 16],
    },
    paint: { "text-color": "#0f2744", "text-halo-color": OC_BG, "text-halo-width": 1.8 },
  },
];

function addPointLayers(map: Map, iconsOk: boolean) {
  map.addSource("points", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 42,
  });
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "points",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": OC_NAVY,
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
      "circle-opacity": 0.92,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#e8eef4",
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "points",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": [GLYPH_FONT],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#e8eef4" },
  });
  map.addLayer({
    id: "unclustered-hit",
    type: "circle",
    source: "points",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 22,
      "circle-color": "#000",
      "circle-opacity": 0,
      "circle-stroke-width": 0,
    },
  });
  if (iconsOk) {
    map.addLayer({
      id: "unclustered",
      type: "symbol",
      source: "points",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": [
          "match",
          ["get", "readiness"],
          "pending",
          ["concat", "cat-", ["get", "category"], "-pending"],
          "stale",
          ["concat", "cat-", ["get", "category"], "-stale"],
          "ok",
          ["concat", "cat-", ["get", "category"], "-ok"],
          ["concat", "cat-", ["get", "category"]],
        ],
        // AED jest najliczniejsze (import OpenAEDMap) — mniejsze, żeby nie tapetowało mapy.
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          ["match", ["get", "category"], "aed", 0.55, 0.85],
          14,
          ["match", ["get", "category"], "aed", 0.78, 1],
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-anchor": "center",
        "icon-padding": 0,
      },
      paint: {
        "icon-opacity": ["case", ["==", ["get", "pending"], 1], 0.5, 1],
      },
    });
  } else {
    map.addLayer({
      id: "unclustered",
      type: "circle",
      source: "points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["==", ["get", "pending"], 1], 0.32, 0.92],
        "circle-radius": ["case", ["==", ["get", "pending"], 1], 8, 9],
        "circle-stroke-width": ["case", ["==", ["get", "pending"], 1], 2.6, ["==", ["get", "stale"], 1], 3, 1.5],
        "circle-stroke-color": ["case", ["==", ["get", "pending"], 1], OC_NAVY, ["==", ["get", "stale"], 1], "#c2410c", "#fff"],
      },
    });
  }
}

function accuracyPolygon(lng: number, lat: number, radiusM: number): GeoJSON.Polygon {
  const n = 64;
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusM / 110574;
  const dLng = radiusM / (111320 * Math.max(Math.cos(latRad), 0.01));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function ensureUserLocLayers(map: Map) {
  if (!map.getSource("user-loc")) {
    map.addSource("user-loc", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer("user-accuracy")) {
    map.addLayer({
      id: "user-accuracy",
      type: "fill",
      source: "user-loc",
      paint: { "fill-color": OC_NAVY, "fill-opacity": 0.14 },
    });
  }
  if (!map.getLayer("user-accuracy-outline")) {
    map.addLayer({
      id: "user-accuracy-outline",
      type: "line",
      source: "user-loc",
      paint: { "line-color": OC_NAVY, "line-width": 1.5, "line-opacity": 0.5 },
    });
  }
}

function makeUserMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "oc-user-marker";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", t("map.mojaLokalizacja"));
  const pulse = document.createElement("span");
  pulse.className = "oc-user-marker-pulse";
  const dot = document.createElement("span");
  dot.className = "oc-user-marker-dot";
  el.append(pulse, dot);
  return el;
}

function geoMessage(reason: GeoFail["reason"]): string {
  if (reason === "unsupported") return t("map.geoBrak");
  if (reason === "denied") return t("map.geoOdmowa");
  return t("map.geoNiedostepna");
}

function addPolandMask(map: Map) {
  if (map.getSource("pl-mask")) return;
  map.addSource("pl-mask", { type: "geojson", data: POLAND_MASK_GEOJSON });
  map.addLayer({
    id: "pl-mask",
    type: "fill",
    source: "pl-mask",
    paint: { "fill-color": OC_BG, "fill-opacity": 1 },
  });
}

export function MapView({
  points,
  cats,
  services,
  pickMode,
  onPick,
  onTilesMissing,
  onCoverage,
  intervalDays = 14,
  focusPoint = null,
  focusSeq = 0,
  onLongPress,
  preserveDrawingBuffer = false,
  center,
  zoom,
}: Props) {
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickModeRef = useRef(!!pickMode);
  pickModeRef.current = !!pickMode;
  const locateFnRef = useRef<(source: "auto" | "user") => Promise<void>>(async () => {});
  const pendingLocateRef = useRef<"auto" | "user" | null>(null);
  const dataRef = useRef(toFeatures(points, cats, services, intervalDays));
  dataRef.current = toFeatures(points, cats, services, intervalDays);
  const [autoLocate, setAutoLocate] = useState(getAutoLocate);
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const popupRef = useRef<maplibregl.Popup | null>(null);

  function applyPosition(map: Map, pos: GeoOk) {
    try {
      if (map.isStyleLoaded()) ensureUserLocLayers(map);
      const radius = Math.min(Math.max(pos.accuracy || 40, 20), 4000);
      const src = map.getSource("user-loc") as GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: accuracyPolygon(pos.lng, pos.lat, radius),
          },
        ],
      });
    } catch {
      /* kółko dokładności jest opcjonalne */
    }
    try {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ element: makeUserMarkerEl(), anchor: "center" })
          .setLngLat([pos.lng, pos.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([pos.lng, pos.lat]);
      }
    } catch {
      /* znacznik — mapa bez WebGL */
    }
    const radius = Math.min(Math.max(pos.accuracy || 40, 20), 4000);
    try {
      const latRad = (pos.lat * Math.PI) / 180;
      const dLat = radius / 110574;
      const dLng = radius / (111320 * Math.max(Math.cos(latRad), 0.01));
      map.fitBounds(
        [
          [pos.lng - dLng, pos.lat - dLat],
          [pos.lng + dLng, pos.lat + dLat],
        ],
        { padding: 48, maxZoom: 16, duration: 850 }
      );
    } catch {
      try {
        map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom() || 12, 14), duration: 800 });
      } catch {
        /* ignore */
      }
    }
    if (pickModeRef.current) onPickRef.current?.(pos.lat, pos.lng);
  }

  locateFnRef.current = async (source) => {
    const map = mapRef.current;
    if (!map) {
      pendingLocateRef.current = source;
      return;
    }
    if (source === "auto") {
      if (!getAutoLocate()) return;
      const perm = await queryGeoPermission();
      if (perm === "denied") return;
      if (wasGeoDenied() && perm !== "granted") return;
    }
    setLocating(true);
    if (source === "user") setGeoMsg(t("map.geoSzukam"));
    try {
      const result = await getPosition(
        source === "auto" ? { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 } : undefined
      );
      if (!mapRef.current) return;
      if (!result.ok) {
        setGeoMsg(geoMessage(result.reason));
        if (result.reason === "denied") {
          setAutoLocate(false);
          setAutoLocatePref(false);
        }
        return;
      }
      if (!inPolandBounds(result.lng, result.lat)) {
        setGeoMsg(t("map.geoPozaPolska"));
        return;
      }
      setGeoMsg("");
      await new Promise<void>((resolve) => {
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          try {
            if (mapRef.current) applyPosition(mapRef.current, result);
          } catch {
            setGeoMsg(t("map.geoNiedostepna"));
          } finally {
            resolve();
          }
        };
        if (map.isStyleLoaded()) go();
        else {
          const wait = window.setTimeout(go, 2500);
          map.once("load", () => {
            window.clearTimeout(wait);
            go();
          });
        }
      });
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    (async () => {
      const protocol = new Protocol();
      try {
        maplibregl.removeProtocol("pmtiles");
      } catch {
        /* pierwszy raz */
      }
      maplibregl.addProtocol("pmtiles", protocol.tile);
      registerGlyphProtocol();
      let style: maplibregl.StyleSpecification = {
        version: 8,
        glyphs: GLYPHS,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": OC_BG } }],
      };
      let missing = true;
      let onlineFallback = false;
      let coverage: TileCoverage | null = null;
      let coverageLabel = "";
      try {
        const tiles = await resolveTiles(protocol);
        if (tiles) {
          missing = false;
          coverage = tiles.coverage;
          coverageLabel = coverageName(tiles.file);
          const pmtilesUrl = `pmtiles://${tiles.url}`;
          const local = await fetch("/style.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
          style = local || {
            version: 8,
            glyphs: GLYPHS,
            sources: { basemap: { type: "vector", url: pmtilesUrl } },
            layers: FALLBACK_LAYERS,
          };
          if (!style.sources) style.sources = {};
          // style.json ma placeholder poland.pmtiles — zawsze nadpisujemy tym, co realnie leży w /tiles.
          // Bez własnych `bounds`: bbox i maxzoom bierzemy z nagłówka PMTiles (poza nim MapLibre nie prosi o kafelki,
          // powyżej maxzoom robi overzoom — ulice zostają).
          style.sources.basemap = { type: "vector", url: pmtilesUrl };
        }
      } catch {
        missing = true;
      }
      // W /glyphs jest tylko Noto Sans Regular; inny krój w stylu z dysku → HTML zamiast PBF.
      normalizeStyleFonts(style);
      if (missing && navigator.onLine) {
        onlineFallback = true;
        style.glyphs = GLYPHS;
        style.sources = {
          osm: {
            type: "raster",
            tiles: [OSM],
            tileSize: 256,
            attribution: "© OpenStreetMap",
            bounds: POLAND_SOURCE_BOUNDS,
          },
        };
        style.layers = [
          { id: "bg", type: "background", paint: { "background-color": OC_BG } },
          { id: "osm", type: "raster", source: "osm" },
        ];
      }
      if (cancelled || !ref.current) return;
      onTilesMissing?.(missing, onlineFallback);
      const wide = window.innerWidth >= 860;
      const map = new maplibregl.Map({
        container: ref.current,
        style,
        center: center || BYTOM,
        zoom: zoom ?? 12,
        preserveDrawingBuffer,
        minZoom: POLAND_MIN_ZOOM,
        maxZoom: POLAND_MAX_ZOOM,
        maxBounds: POLAND_MAX_BOUNDS,
        renderWorldCopies: false,
        attributionControl: { compact: true },
      });
      if (pickMode) {
        map.setPadding(wide ? { top: 12, bottom: 12, left: 12, right: 400 } : { top: 8, bottom: 300, left: 8, right: 8 });
      }
      if (cancelled) {
        map.remove();
        return;
      }
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
      map.addControl(new WalkScaleControl(), "bottom-right");
      if (coverage && onCoverage) {
        let lastOutside: boolean | null = null;
        const checkCoverage = () => {
          const c = map.getCenter();
          const outside = !insideCoverage(coverage, c.lng, c.lat);
          if (outside !== lastOutside) {
            lastOutside = outside;
            onCoverage(outside, coverageLabel);
          }
        };
        map.on("moveend", checkCoverage);
        checkCoverage();
      }
      const openPopup = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f || pickMode) return;
        const html = popupHtml(f.properties as Record<string, unknown>);
        new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      };
      map.on("load", () => {
        void (async () => {
          if (cancelled) return;
          const iconsOk = await addCategoryImagesToMap(map);
          if (cancelled || !map.getStyle()) return;
          try {
            addPolandMask(map);
          } catch {
            /* maska opcjonalna */
          }
          addPointLayers(map, iconsOk);
          const src = map.getSource("points") as GeoJSONSource | undefined;
          src?.setData(dataRef.current);
          map.on("click", "unclustered", openPopup);
          map.on("click", "unclustered-hit", openPopup);
          map.on("mouseenter", "unclustered", () => {
            map.getCanvas().style.cursor = pickMode ? "crosshair" : "pointer";
          });
          map.on("mouseleave", "unclustered", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("click", "clusters", (e) => {
            const f = e.features?.[0];
            const clusterSrc = map.getSource("points") as GeoJSONSource;
            const id = f?.properties?.cluster_id;
            if (id == null) return;
            clusterSrc.getClusterExpansionZoom(id).then((zoom) => {
              if (zoom == null || !f) return;
              map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
            });
          });
          if (shouldAutoLocateOnOpen()) void locateFnRef.current("auto");
        })();
      });
      map.on("click", (e) => {
        if (pickMode && onPick) onPick(e.lngLat.lat, e.lngLat.lng);
      });
      // Długie przytrzymanie / prawy klik → szybkie zgłoszenie w tym miejscu.
      map.on("contextmenu", (e) => {
        e.preventDefault();
        if (!pickModeRef.current) onLongPressRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });
      {
        let timer = 0;
        let start: { x: number; y: number } | null = null;
        const canvas = map.getCanvasContainer();
        const cancel = () => {
          if (timer) window.clearTimeout(timer);
          timer = 0;
          start = null;
        };
        canvas.addEventListener(
          "touchstart",
          (ev) => {
            if (ev.touches.length !== 1 || pickModeRef.current) return cancel();
            const tch = ev.touches[0];
            start = { x: tch.clientX, y: tch.clientY };
            timer = window.setTimeout(() => {
              const rect = canvas.getBoundingClientRect();
              const ll = map.unproject([tch.clientX - rect.left, tch.clientY - rect.top]);
              cancel();
              onLongPressRef.current?.(ll.lat, ll.lng);
            }, 600);
          },
          { passive: true }
        );
        canvas.addEventListener(
          "touchmove",
          (ev) => {
            if (!start) return;
            const tch = ev.touches[0];
            if (Math.hypot(tch.clientX - start.x, tch.clientY - start.y) > 10) cancel();
          },
          { passive: true }
        );
        canvas.addEventListener("touchend", cancel, { passive: true });
        canvas.addEventListener("touchcancel", cancel, { passive: true });
      }
      if (pickMode && onPick) {
        map.on("moveend", () => {
          const c = map.getCenter();
          onPick(c.lat, c.lng);
        });
      }
      mapRef.current = map;
      if (pendingLocateRef.current) {
        const queued = pendingLocateRef.current;
        pendingLocateRef.current = null;
        void locateFnRef.current(queued);
      }
    })();
    return () => {
      cancelled = true;
      markerRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("points")) return;
    (map.getSource("points") as GeoJSONSource).setData(dataRef.current);
  }, [points, cats, services, intervalDays]);

  useEffect(() => {
    if (!focusSeq || !focusPoint) return;
    const map = mapRef.current;
    if (!map) return;
    const lat = focusPoint.public_lat ?? focusPoint.lat;
    const lon = focusPoint.public_lon ?? focusPoint.lon;
    if (lat == null || lon == null || !inPolandBounds(lon, lat)) return;
    const feat = dataRef.current.features.find((f) => String((f.properties as { id?: string } | null)?.id) === focusPoint.id);
    const html = feat
      ? popupHtml(feat.properties as Record<string, unknown>)
      : `<div class="popup"><h3>${escapeHtml(focusPoint.title || "")}</h3></div>`;
    const open = () => {
      const m = mapRef.current;
      if (!m) return;
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ maxWidth: "280px" }).setLngLat([lon, lat]).setHTML(html).addTo(m);
      try {
        m.easeTo({ center: [lon, lat], zoom: Math.max(m.getZoom() || 12, 14), duration: 700 });
      } catch {
        /* maxBounds */
      }
    };
    if (map.isStyleLoaded()) open();
    else map.once("load", open);
  }, [focusPoint, focusSeq]);

  useEffect(() => {
    if (!geoMsg) return;
    const id = window.setTimeout(() => setGeoMsg(""), 5000);
    return () => window.clearTimeout(id);
  }, [geoMsg]);

  return (
    <>
      <div className="map-el" ref={ref} />
      <LocateControl
        locating={locating}
        autoEnabled={autoLocate}
        showAuto={!pickMode}
        onLocate={() => void locateFnRef.current("user")}
        onAutoChange={(on) => {
          setAutoLocate(on);
          setAutoLocatePref(on);
          if (on) void locateFnRef.current("user");
        }}
      />
      {geoMsg ? (
        <div className="geo-toast" role="status">
          {geoMsg}
        </div>
      ) : null}
    </>
  );
}
