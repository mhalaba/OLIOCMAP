import type { Map as MapLibreMap } from "maplibre-gl";
import { ALL_CATEGORIES, type Category } from "./types";

export const CATEGORY_ICONS: Record<Category, string> = {
  odpornosc: "/icons/map/odpornosc.svg",
  schron: "/icons/map/schron.svg",
  aed: "/icons/map/aed.svg",
  woda: "/icons/map/woda.svg",
  prad: "/icons/map/prad.svg",
  lacznosc: "/icons/map/lacznosc.svg",
  przemysl: "/icons/map/przemysl.svg",
  potrzeba: "/icons/map/potrzeba.svg",
};

export const CLUSTER_ICON = "/icons/map/cluster.svg";

export const MAP_ICON_PX = 96;
export const MAP_ICON_PIXEL_RATIO = 2;
export const MAP_ICON_VARIANTS = ["", "-pending", "-stale", "-ok"] as const;

export type IconReadiness = "verified" | "pending" | "stale" | "ok";

export function mapImageId(category: Category | string, readiness: IconReadiness = "verified"): string {
  if (readiness === "pending") return `cat-${category}-pending`;
  if (readiness === "stale") return `cat-${category}-stale`;
  if (readiness === "ok") return `cat-${category}-ok`;
  return `cat-${category}`;
}

export function categoryIconSrc(category: string): string {
  return CATEGORY_ICONS[category as Category] || CATEGORY_ICONS.odpornosc;
}

async function svgToBaseCanvas(url: string, size: number, pad: number): Promise<HTMLCanvasElement> {
  const svg = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(url);
    return r.text();
  });
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(url));
      el.src = href;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
    return canvas;
  } finally {
    URL.revokeObjectURL(href);
  }
}

function paintRing(ctx: CanvasRenderingContext2D, size: number, readiness: IconReadiness) {
  const cx = size / 2;
  const r = size / 2 - 4;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.lineCap = "round";
  if (readiness === "pending") {
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 5]);
  } else if (readiness === "stale") {
    ctx.strokeStyle = "#c2410c";
    ctx.lineWidth = 5;
    ctx.setLineDash([]);
  } else if (readiness === "ok") {
    ctx.strokeStyle = "#1f6b4a";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Ładuje SVG kategorii do MapLibre raz (warianty gotowości, nie per punkt). */
export async function addCategoryImagesToMap(map: MapLibreMap): Promise<boolean> {
  try {
    const variants: IconReadiness[] = ["verified", "pending", "stale", "ok"];
    await Promise.all(
      ALL_CATEGORIES.map(async (cat) => {
        const base = await svgToBaseCanvas(CATEGORY_ICONS[cat], MAP_ICON_PX, 8);
        for (const readiness of variants) {
          const id = mapImageId(cat, readiness);
          const canvas = document.createElement("canvas");
          canvas.width = MAP_ICON_PX;
          canvas.height = MAP_ICON_PX;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("canvas");
          ctx.drawImage(base, 0, 0);
          paintRing(ctx, MAP_ICON_PX, readiness);
          const data = ctx.getImageData(0, 0, MAP_ICON_PX, MAP_ICON_PX);
          if (map.hasImage(id)) map.removeImage(id);
          map.addImage(id, data, { pixelRatio: MAP_ICON_PIXEL_RATIO });
        }
      })
    );
    return true;
  } catch {
    return false;
  }
}
