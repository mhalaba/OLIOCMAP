/** PocketBase puste daty bywają "", null albo 0001-01-01 — nie traktuj ich jako tombstone. */
export function isPresentDate(v?: string | null): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (!s || s === "[object Object]") return false;
  if (s.indexOf("0001-01-01") >= 0) return false;
  const t = Date.parse(s.replace(" ", "T"));
  return !Number.isNaN(t) && t > 0;
}

export function daysAgo(iso?: string): number | null {
  if (!isPresentDate(iso)) return null;
  const t = Date.parse(String(iso).replace(" ", "T"));
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function minutesAgo(iso?: string): number | null {
  if (!isPresentDate(iso)) return null;
  const t = Date.parse(String(iso).replace(" ", "T"));
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

export function formatSyncAgo(iso?: string): string {
  if (!isPresentDate(iso)) return "nigdy";
  const m = minutesAgo(iso);
  if (m === null) return "nigdy";
  if (m < 1) return "przed chwilą";
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  return `${d} dni temu`;
}

export function freshnessLabel(last?: string, intervalDays = 14): { text: string; stale: boolean } {
  const d = daysAgo(last);
  if (d === null) return { text: "Brak potwierdzenia", stale: true };
  if (d >= intervalDays) {
    const unit = d === 1 ? "dnia" : "dni";
    return { text: `Niepotwierdzony od ${d} ${unit}`, stale: true };
  }
  if (d <= 0) return { text: "Potwierdzony dzisiaj", stale: false };
  const unit = d === 1 ? "dzień" : "dni";
  return { text: `Potwierdzony ${d} ${unit} temu`, stale: false };
}

export function activationText(a?: string, hours?: number): string {
  if (a === "stale") return "Działa stale";
  if (a === "po_alarmie") return "Uruchamiany po alarmie";
  if (a === "po_godzinach_bez_pradu") {
    const h = hours || 0;
    return h ? `Uruchamiany po ${h} h bez prądu` : "Uruchamiany po godzinach bez prądu";
  }
  return "";
}

export function uuidv7(): string {
  const now = Date.now();
  let hex = now.toString(16).padStart(12, "0");
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${rand.slice(0, 3)}-8${rand.slice(3, 6)}-${rand.slice(6, 18)}`;
}
