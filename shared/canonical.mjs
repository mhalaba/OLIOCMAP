import { SYNCABLE_FIELDS, SIGN_EXCLUDE } from "./constants.mjs";

export function sortKeys(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value.constructor === Object) {
    const out = {};
    const keys = Object.keys(value).sort();
    for (const k of keys) {
      if (value[k] === undefined) continue;
      out[k] = sortKeys(value[k]);
    }
    return out;
  }
  return value;
}

function normalize(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    if (typeof value.toString === "function" && value.constructor && value.constructor.name === "DateTime") {
      return String(value);
    }
    return value;
  }
  return value;
}

export function canonicalPayload(row) {
  const obj = {};
  for (const field of SYNCABLE_FIELDS) {
    if (SIGN_EXCLUDE.includes(field)) continue;
    const v = normalize(row[field]);
    if (v === undefined) continue;
    obj[field] = v;
  }
  return sortKeys(obj);
}

export function canonicalJson(row) {
  return JSON.stringify(canonicalPayload(row));
}
