/**
 * Hybrid Logical Clock.
 * Format: "<unix_ms 13 digits>-<counter 4 hex>-<node_id>"
 */

export function parseHlc(hlc) {
  if (!hlc || typeof hlc !== "string") return null;
  const m = hlc.match(/^(\d{13})-([0-9a-f]{4})-(.+)$/i);
  if (!m) return null;
  return { wall: Number(m[1]), counter: parseInt(m[2], 16), nodeId: m[3], raw: hlc };
}

export function formatHlc(wall, counter, nodeId) {
  const w = String(Math.max(0, Math.floor(wall))).padStart(13, "0").slice(-13);
  const c = (counter & 0xffff).toString(16).padStart(4, "0");
  return `${w}-${c}-${nodeId}`;
}

export function compareHlc(a, b) {
  const pa = parseHlc(a);
  const pb = parseHlc(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.wall !== pb.wall) return pa.wall < pb.wall ? -1 : 1;
  if (pa.counter !== pb.counter) return pa.counter < pb.counter ? -1 : 1;
  if (pa.nodeId === pb.nodeId) return 0;
  return pa.nodeId < pb.nodeId ? -1 : 1;
}

export function wallMs(hlc) {
  const p = parseHlc(hlc);
  return p ? p.wall : 0;
}

/**
 * Monotonic tick. Survives wall-clock jumping backwards (Pi bez RTC).
 * state: { lastMs, counter }
 */
export function tickHlc(state, nodeId, nowMs) {
  const now = Math.floor(nowMs);
  let wall = now;
  let counter = 0;
  if (state && typeof state.lastMs === "number") {
    if (now > state.lastMs) {
      wall = now;
      counter = 0;
    } else {
      wall = state.lastMs;
      counter = (state.counter || 0) + 1;
      if (counter > 0xffff) {
        wall += 1;
        counter = 0;
      }
    }
  }
  return {
    hlc: formatHlc(wall, counter, nodeId),
    lastMs: wall,
    counter,
  };
}

export function hlcToDateString(hlc) {
  const ms = wallMs(hlc);
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}
