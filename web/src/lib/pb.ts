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

export function isAdmin(u: AuthUser | null): boolean {
  return !!u && u.role === "admin";
}

export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!err || typeof err !== "object") return true;
  const status = "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status >= 400 && status < 500) return false;
  if (!status || status === 503 || status >= 500) return true;
  const msg = "message" in err ? String((err as { message?: string }).message) : "";
  return /Failed to fetch|NetworkError|network|Load failed/i.test(msg);
}

export function pbErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as {
    status?: number;
    message?: string;
    response?: { message?: string; data?: Record<string, { message?: string }> };
  };
  if (isOfflineError(err) && e.status !== 400) return fallback;
  const data = e.response?.data;
  if (data) {
    for (const v of Object.values(data)) {
      if (v?.message) return v.message;
    }
  }
  const raw = e.response?.message || e.message || "";
  if (raw && !/failed to create|failed to authenticate|something went wrong|failed to update/i.test(raw)) {
    return raw;
  }
  return fallback;
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
