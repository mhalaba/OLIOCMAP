import { useEffect, useRef } from "react";
import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { t } from "../i18n";
import { CATEGORY_COLORS, type Category, type Point, type Service } from "../types";
import { activationText, freshnessLabel } from "../lib/format";
import { asArray } from "../lib/pb";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const BYTOM: [number, number] = [18.923, 50.348];

type Props = {
  points: Point[];
  cats: Record<string, boolean>;
  services: Service[];
  pickMode?: boolean;
  onPick?: (lat: number, lon: number) => void;
  onTilesMissing?: (missing: boolean, onlineFallback: boolean) => void;
  intervalDays?: number;
};

function toFeatures(points: Point[], cats: Record<string, boolean>, services: Service[], intervalDays: number) {
  const feats: GeoJSON.Feature[] = [];
  for (const p of points) {
    if (p.deleted_at) continue;
    if (p.blocked) continue;
    if (p.status !== "verified" && p.category !== "potrzeba") continue;
    if (!cats[p.category]) continue;
    if (p.category === "potrzeba") continue;
    const svcs = asArray<Service>(p.services);
    if (services.length && !services.every((s) => svcs.includes(s))) continue;
    const lat = p.public_lat ?? p.lat;
    const lon = p.public_lon ?? p.lon;
    if (lat == null || lon == null || (p.public_geom === "hidden")) continue;
    const fresh = freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays);
    feats.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: p.id,
        title: p.title,
        category: p.category,
        color: CATEGORY_COLORS[p.category as Category],
        stale: fresh.stale,
        hours: p.hours || "",
        activation: activationText(p.activation, p.activation_hours),
        autonomy: p.autonomy_h || 0,
        services: svcs.join(","),
        source_node: p.source_node || "",
        fresh: fresh.text,
        address: p.address || "",
        capacity: p.capacity || 0,
        host_type: p.host_type || "",
        geom: p.public_geom || "precise",
        plat: lat,
        plon: lon,
      },
    });
  }
  return { type: "FeatureCollection" as const, features: feats };
}

function popupHtml(props: Record<string, unknown>): string {
  const cat = String(props.category || "");
  const color = CATEGORY_COLORS[cat as Category] || "#333";
  const stale = props.stale === true || props.stale === "true";
  const svcs = String(props.services || "")
    .split(",")
    .filter(Boolean)
    .map((s) => t(`svc.${s}`))
    .join(" · ");
  const auto = Number(props.autonomy) ? `Autonomia ${props.autonomy} h` : "";
  const cap = Number(props.capacity) ? `${props.capacity} os.` : "";
  return `<div class="popup">
    <span class="cat-badge" style="background:${color}">${t("cat." + cat)}</span>
    <h3>${escapeHtml(String(props.title || ""))}</h3>
    <div class="${stale ? "stale" : "fresh"}">${escapeHtml(String(props.fresh || ""))}</div>
    ${props.activation ? `<div>${escapeHtml(String(props.activation))}</div>` : ""}
    ${props.hours ? `<div>${escapeHtml(String(props.hours))}</div>` : ""}
    ${auto ? `<div>${auto}</div>` : ""}
    ${cap ? `<div>${cap}</div>` : ""}
    ${svcs ? `<div>${escapeHtml(svcs)}</div>` : ""}
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

export function MapView({ points, cats, services, pickMode, onPick, onTilesMissing, intervalDays = 14 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const dataRef = useRef(toFeatures(points, cats, services, intervalDays));
  dataRef.current = toFeatures(points, cats, services, intervalDays);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      let style: maplibregl.StyleSpecification = {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#e8e4dc" } }],
      };
      let missing = true;
      let onlineFallback = false;
      try {
        const idx = await fetch("/tiles/index.json").then((r) => (r.ok ? r.json() : { files: [] }));
        const files: string[] = idx.files || [];
        const file = files.find((f: string) => f.endsWith(".pmtiles")) || (await fetch("/tiles/poland.pmtiles", { method: "HEAD" }).then((r) => (r.ok ? "poland.pmtiles" : "")));
        if (file) {
          missing = false;
          const local = await fetch("/style.json").then((r) => (r.ok ? r.json() : null));
          style = local || {
            version: 8,
            sources: { basemap: { type: "vector", url: `pmtiles:///tiles/${file}` } },
            layers: [
              { id: "bg", type: "background", paint: { "background-color": "#e8e4dc" } },
              { id: "water", type: "fill", source: "basemap", "source-layer": "water", paint: { "fill-color": "#b7d2e8" } },
              { id: "earth", type: "fill", source: "basemap", "source-layer": "earth", paint: { "fill-color": "#e8e4dc" } },
              { id: "roads", type: "line", source: "basemap", "source-layer": "roads", paint: { "line-color": "#fff", "line-width": 1.1 } },
            ],
          };
          if (!style.sources) style.sources = {};
          if (!style.sources.basemap) {
            style.sources.basemap = { type: "vector", url: `pmtiles:///tiles/${file}` };
          }
        }
      } catch {
        missing = true;
      }
      if (missing && navigator.onLine) {
        onlineFallback = true;
        style.sources = {
          osm: {
            type: "raster",
            tiles: [OSM],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        };
        style.layers = [
          { id: "bg", type: "background", paint: { "background-color": "#e8e4dc" } },
          { id: "osm", type: "raster", source: "osm" },
        ];
      }
      if (cancelled || !ref.current) return;
      onTilesMissing?.(missing, onlineFallback);
      const map = new maplibregl.Map({
        container: ref.current,
        style,
        center: BYTOM,
        zoom: 12,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
      map.on("load", () => {
        map.addSource("points", {
          type: "geojson",
          data: dataRef.current,
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
            "circle-color": "#1a1714",
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
            "circle-opacity": 0.85,
          },
        });
        map.addLayer({
          id: "unclustered",
          type: "circle",
          source: "points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": 9,
            "circle-stroke-width": ["case", ["==", ["get", "stale"], true], 3, 1.5],
            "circle-stroke-color": ["case", ["==", ["get", "stale"], true], "#c2410c", "#fff"],
          },
        });
      });
      map.on("click", "unclustered", (e) => {
        const f = e.features?.[0];
        if (!f || pickMode) return;
        const html = popupHtml(f.properties as Record<string, unknown>);
        new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("click", "clusters", (e) => {
        const f = e.features?.[0];
        const src = map.getSource("points") as GeoJSONSource;
        const id = f?.properties?.cluster_id;
        if (id == null) return;
        src.getClusterExpansionZoom(id).then((zoom) => {
          if (zoom == null || !f) return;
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        });
      });
      map.on("click", (e) => {
        if (pickMode && onPick) onPick(e.lngLat.lat, e.lngLat.lng);
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("points")) return;
    (map.getSource("points") as GeoJSONSource).setData(dataRef.current);
  }, [points, cats, services, intervalDays]);

  return <div className="map-el" ref={ref} />;
}
