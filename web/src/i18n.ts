import pl from "./i18n/pl.json";

type Dict = Record<string, unknown>;

function lookup(obj: Dict, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Dict)) cur = (cur as Dict)[p];
    else return path;
  }
  return typeof cur === "string" ? cur : path;
}

export function t(path: string, vars?: Record<string, string | number>): string {
  let s = lookup(pl as Dict, path);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

export const labels = pl;
