import PocketBase from "pocketbase";
import type { AuthUser } from "../types";

export const pb = new PocketBase(window.location.origin);
pb.autoCancellation(false);

export function currentUser(): AuthUser | null {
  const r = pb.authStore.record;
  if (!r) return null;
  return {
    id: r.id,
    email: String(r.email || ""),
    name: String(r.name || ""),
    role: (r.role as AuthUser["role"]) || "citizen",
    org_name: r.org_name ? String(r.org_name) : undefined,
  };
}

export function isOperator(u: AuthUser | null): boolean {
  return !!u && (u.role === "operator" || u.role === "admin");
}

export async function fetchStatus() {
  const r = await fetch("/api/status");
  if (!r.ok) throw new Error("status");
  return r.json();
}

export async function fetchConfig() {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error("config");
  return r.json();
}

export function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}
