import maplibregl from "maplibre-gl";

/**
 * Glify przez własny protokół `ocglyphs://` zamiast gołego `/glyphs/...`.
 *
 * Powód: na węźle leży tylko `Noto Sans Regular`. Gdy styl (albo stary cache)
 * poprosi o inny krój lub brakujący zakres, Caddy/SPA odpowiada `index.html`,
 * a MapLibre próbuje sparsować HTML jako PBF → "Unimplemented type: 4" i kafelek
 * z etykietami wypada. Tutaj:
 *  1. każdy nieznany fontstack spada do `Noto Sans Regular`,
 *  2. odpowiedź, która nie wygląda na PBF (404, HTML), zamieniamy na pusty,
 *     ale poprawny zakres glifów — brak literek, ale mapa żyje.
 */
export const GLYPH_PROTOCOL = "ocglyphs";
export const GLYPH_URL = `${GLYPH_PROTOCOL}://{fontstack}/{range}.pbf`;
export const GLYPH_FONT = "Noto Sans Regular";
const GLYPH_BASE = "/glyphs";

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

function lengthDelimited(field: number, bytes: Uint8Array | number[]): number[] {
  return [(field << 3) | 2, ...varint(bytes.length), ...bytes];
}

/** `glyphs { stacks: [ { name, range, glyphs: [] } ] }` zakodowane ręcznie. */
export function emptyGlyphRange(fontstack: string, range: string): ArrayBuffer {
  const enc = new TextEncoder();
  const stack = [...lengthDelimited(1, enc.encode(fontstack)), ...lengthDelimited(2, enc.encode(range))];
  return new Uint8Array(lengthDelimited(1, stack)).buffer;
}

/** Zakres glifów zaczyna się od pola 1 (wire type 2) → bajt 0x0a. HTML zaczyna się od "<". */
export function looksLikeGlyphPbf(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 2) return false;
  return new Uint8Array(buf, 0, 1)[0] === 0x0a;
}

function parseGlyphUrl(url: string): { fontstack: string; range: string } | null {
  const rest = url.replace(/^[a-z]+:\/\//i, "");
  const slash = rest.lastIndexOf("/");
  if (slash < 0) return null;
  const fontstack = decodeURIComponent(rest.slice(0, slash));
  const range = rest.slice(slash + 1).replace(/\.pbf$/, "");
  if (!fontstack || !/^\d+-\d+$/.test(range)) return null;
  return { fontstack, range };
}

async function fetchRange(fontstack: string, range: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${GLYPH_BASE}/${encodeURIComponent(fontstack)}/${range}.pbf`, { signal });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return looksLikeGlyphPbf(buf) ? buf : null;
  } catch {
    return null;
  }
}

let registered = false;

export function registerGlyphProtocol() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(GLYPH_PROTOCOL, async (params, abort) => {
    const parsed = parseGlyphUrl(params.url);
    if (!parsed) return { data: emptyGlyphRange(GLYPH_FONT, "0-255") };
    const { fontstack, range } = parsed;
    let data = await fetchRange(fontstack, range, abort.signal);
    if (!data && fontstack !== GLYPH_FONT) data = await fetchRange(GLYPH_FONT, range, abort.signal);
    if (!data) data = emptyGlyphRange(fontstack, range);
    return { data };
  });
}

/**
 * Wymuś jeden dostępny krój we wszystkich warstwach symbolowych stylu.
 * Styl z dysku (style.json) może być stary albo ręcznie edytowany.
 */
export function normalizeStyleFonts(style: maplibregl.StyleSpecification): maplibregl.StyleSpecification {
  style.glyphs = GLYPH_URL;
  for (const layer of style.layers || []) {
    if (layer.type !== "symbol") continue;
    const layout = (layer.layout ||= {}) as Record<string, unknown>;
    if (layout["text-field"] !== undefined) layout["text-font"] = [GLYPH_FONT];
  }
  return style;
}
