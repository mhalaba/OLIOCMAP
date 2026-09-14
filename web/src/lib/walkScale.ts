import type { IControl, Map } from "maplibre-gl";
import { t } from "../i18n";

/**
 * Skala metryczna + czas pieszo (~5 km/h ≈ 83 m/min). Liczona jak ScaleControl MapLibre:
 * odległość na krawędzi widoku dla paska o szerokości do MAX_PX.
 * Kreski 5 min / 15 min, gdy mieszczą się na pasku.
 */
const MAX_PX = 200;
export const WALK_M_PER_MIN = 5000 / 60;
const TICK_MINS = [5, 15] as const;

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function roundNice(m: number): number {
  const pow = 10 ** Math.floor(Math.log10(m));
  const d = m / pow;
  const nice = d >= 5 ? 5 : d >= 2 ? 2 : 1;
  return nice * pow;
}

export function walkLabel(meters: number): string {
  const min = meters / WALK_M_PER_MIN;
  if (min < 1) return t("map.minPieszoLt");
  if (min < 60) return t("map.minPieszo", { n: Math.round(min) });
  const h = Math.floor(min / 60);
  const rest = Math.round(min - h * 60);
  return rest ? t("map.minPieszoHm", { h, m: rest }) : t("map.minPieszoH", { h });
}

export function distLabel(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

export class WalkScaleControl implements IControl {
  private map: Map | null = null;
  private el: HTMLDivElement | null = null;
  private ruler: HTMLDivElement | null = null;
  private bar: HTMLDivElement | null = null;
  private ticks: HTMLDivElement | null = null;
  private dist: HTMLSpanElement | null = null;
  private walk: HTMLSpanElement | null = null;
  private update = () => this.render();

  onAdd(map: Map): HTMLElement {
    this.map = map;
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl oc-scale print-keep";
    el.setAttribute("role", "img");
    const ruler = document.createElement("div");
    ruler.className = "oc-scale-ruler";
    const bar = document.createElement("div");
    bar.className = "oc-scale-bar";
    const ticks = document.createElement("div");
    ticks.className = "oc-scale-ticks";
    ruler.append(bar, ticks);
    const meta = document.createElement("div");
    meta.className = "oc-scale-meta";
    const dist = document.createElement("span");
    dist.className = "oc-scale-dist";
    const walk = document.createElement("span");
    walk.className = "oc-scale-walk";
    meta.append(dist, walk);
    el.append(ruler, meta);
    this.el = el;
    this.ruler = ruler;
    this.bar = bar;
    this.ticks = ticks;
    this.dist = dist;
    this.walk = walk;
    map.on("move", this.update);
    this.render();
    return el;
  }

  onRemove(): void {
    this.map?.off("move", this.update);
    this.el?.remove();
    this.map = null;
    this.el = null;
  }

  private render() {
    const map = this.map;
    if (!map || !this.ruler || !this.bar || !this.ticks || !this.dist || !this.walk || !this.el) return;
    const y = map.getContainer().clientHeight / 2;
    const a = map.unproject([0, y]);
    const b = map.unproject([MAX_PX, y]);
    const maxMeters = haversine([a.lng, a.lat], [b.lng, b.lat]);
    if (!Number.isFinite(maxMeters) || maxMeters <= 0) return;
    const meters = roundNice(maxMeters);
    const px = Math.max(48, Math.round((MAX_PX * meters) / maxMeters));
    this.ruler.style.width = `${px}px`;
    this.dist.textContent = distLabel(meters);
    this.walk.textContent = walkLabel(meters);
    this.el.setAttribute("aria-label", `${t("map.skala")}: ${distLabel(meters)}, ${walkLabel(meters)}`);
    this.ticks.replaceChildren();
    for (const mins of TICK_MINS) {
      const tickM = mins * WALK_M_PER_MIN;
      const ratio = tickM / meters;
      if (ratio < 0.18 || ratio > 0.92) continue;
      const mark = document.createElement("span");
      mark.className = "oc-scale-tick";
      mark.style.left = `${Math.round(ratio * 100)}%`;
      mark.textContent = mins === 5 ? t("map.pieszo5") : t("map.pieszo15");
      this.ticks.append(mark);
    }
  }
}
