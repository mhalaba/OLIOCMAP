import type { IControl, Map } from "maplibre-gl";

/**
 * Skala metryczna + czas pieszo (~5 km/h). Liczona jak ScaleControl MapLibre:
 * odległość na dolnej krawędzi widoku dla paska o szerokości do MAX_PX.
 */
const MAX_PX = 110;
const WALK_M_PER_MIN = 5000 / 60;

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function roundNice(m: number): number {
  const pow = 10 ** Math.floor(Math.log10(m));
  const d = m / pow;
  const nice = d >= 5 ? 5 : d >= 2 ? 2 : 1;
  return nice * pow;
}

export function walkLabel(meters: number): string {
  const min = meters / WALK_M_PER_MIN;
  if (min < 1) return "< 1 min pieszo";
  if (min < 60) return `≈ ${Math.round(min)} min pieszo`;
  const h = Math.floor(min / 60);
  const rest = Math.round(min - h * 60);
  return rest ? `≈ ${h} h ${rest} min pieszo` : `≈ ${h} h pieszo`;
}

export function distLabel(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

export class WalkScaleControl implements IControl {
  private map: Map | null = null;
  private el: HTMLDivElement | null = null;
  private bar: HTMLDivElement | null = null;
  private dist: HTMLSpanElement | null = null;
  private walk: HTMLSpanElement | null = null;
  private update = () => this.render();

  onAdd(map: Map): HTMLElement {
    this.map = map;
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl oc-scale";
    el.setAttribute("role", "img");
    const bar = document.createElement("div");
    bar.className = "oc-scale-bar";
    const dist = document.createElement("span");
    dist.className = "oc-scale-dist";
    const walk = document.createElement("span");
    walk.className = "oc-scale-walk";
    bar.append(dist);
    el.append(bar, walk);
    this.el = el;
    this.bar = bar;
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
    if (!map || !this.bar || !this.dist || !this.walk || !this.el) return;
    const y = map.getContainer().clientHeight / 2;
    const a = map.unproject([0, y]);
    const b = map.unproject([MAX_PX, y]);
    const maxMeters = haversine([a.lng, a.lat], [b.lng, b.lat]);
    if (!Number.isFinite(maxMeters) || maxMeters <= 0) return;
    const meters = roundNice(maxMeters);
    const px = Math.round((MAX_PX * meters) / maxMeters);
    this.bar.style.width = `${px}px`;
    this.dist.textContent = distLabel(meters);
    this.walk.textContent = walkLabel(meters);
    this.el.setAttribute("aria-label", `${distLabel(meters)}, ${walkLabel(meters)}`);
  }
}
