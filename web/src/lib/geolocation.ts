const AUTO_KEY = "mk.autoLocate";
const DENIED_KEY = "mk.geoDenied";

export type GeoOk = { ok: true; lng: number; lat: number; accuracy: number };
export type GeoFail = { ok: false; reason: "unsupported" | "denied" | "unavailable" | "timeout" | "error" };
export type GeoResult = GeoOk | GeoFail;

export function getAutoLocate(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoLocatePref(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    /* tryb prywatny */
  }
}

export function wasGeoDenied(): boolean {
  try {
    return localStorage.getItem(DENIED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGeoDenied(denied: boolean) {
  try {
    if (denied) localStorage.setItem(DENIED_KEY, "1");
    else localStorage.removeItem(DENIED_KEY);
  } catch {
    /* tryb prywatny */
  }
}

export function geoSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator && !!window.isSecureContext;
}

export async function queryGeoPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const st = await navigator.permissions.query({ name: "geolocation" });
    if (st.state === "granted" || st.state === "denied" || st.state === "prompt") return st.state;
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Auto-center on open only when the user opted in and we are not known-denied. */
export function shouldAutoLocateOnOpen(): boolean {
  return getAutoLocate() && !wasGeoDenied();
}

export function getPosition(opts?: PositionOptions): Promise<GeoResult> {
  if (!geoSupported()) return Promise.resolve({ ok: false, reason: "unsupported" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoDenied(false);
        resolve({
          ok: true,
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy || 0,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoDenied(true);
          resolve({ ok: false, reason: "denied" });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          resolve({ ok: false, reason: "unavailable" });
        } else if (err.code === err.TIMEOUT) {
          resolve({ ok: false, reason: "timeout" });
        } else {
          resolve({ ok: false, reason: "error" });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
        ...opts,
      }
    );
  });
}
