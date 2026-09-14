import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilterChips } from "../components/FilterChips";
import { Legend } from "../components/Legend";
import { MapView } from "../components/MapView";
import { CatIcon } from "../components/CategoryBadge";
import { t } from "../i18n";
import { currentUser, isOperator, pb, asArray } from "../lib/pb";
import { DEFAULT_CATEGORY_ON, PUBLIC_CATEGORIES, type Category, type Point, type Service } from "../types";

function pointCoords(p: Point): { lat: number; lon: number } | null {
  const lat = p.public_lat ?? p.lat;
  const lon = p.public_lon ?? p.lon;
  if (lat == null || lon == null || p.public_geom === "hidden") return null;
  return { lat, lon };
}

function pointHaystack(p: Point): string {
  return [p.title, t(`cat.${p.category}`), p.category, p.description || ""].join(" ").toLowerCase();
}

function mergeById(base: Point[], extra: Point[]): Point[] {
  const map = new Map<string, Point>();
  for (const p of base) map.set(p.id, p);
  for (const p of extra) {
    if (!map.has(p.id)) map.set(p.id, p);
  }
  return [...map.values()];
}

function demoOcPoints(): Point[] {
  const now = new Date().toISOString();
  const spread: Point[] = [
    { id: "demo-odpornosc", category: "odpornosc", title: "OSP Szombierki", status: "verified", public_lat: 50.348, public_lon: 18.923, last_confirmed_at: now, autonomy_h: 48 },
    { id: "demo-schron", category: "schron", title: "Schron przy rynku", status: "verified", public_lat: 50.351, public_lon: 18.929, last_confirmed_at: now },
    { id: "demo-aed", category: "aed", title: "AED — urząd", status: "verified", public_lat: 50.346, public_lon: 18.918, last_confirmed_at: now },
    { id: "demo-woda", category: "woda", title: "Punkt wody", status: "pending", public_lat: 50.353, public_lon: 18.921 },
    { id: "demo-prad", category: "prad", title: "Ładowanie przy szkole", status: "verified", public_lat: 50.344, public_lon: 18.927, last_confirmed_at: "2020-01-01T00:00:00Z" },
    { id: "demo-lacznosc", category: "lacznosc", title: "Starlink OSP", status: "verified", public_lat: 50.349, public_lon: 18.934, last_confirmed_at: now },
    { id: "demo-przemysl", category: "przemysl", title: "Warsztat gminy", status: "verified", public_lat: 50.342, public_lon: 18.914, last_confirmed_at: now, capability: ["warsztat"] },
  ];
  const cluster: Point[] = Array.from({ length: 16 }, (_, i) => ({
    id: `demo-aed-k${i}`,
    category: "aed" as const,
    title: `AED skupisko ${i + 1}`,
    status: "verified" as const,
    public_lat: 50.356 + (i % 4) * 0.0002,
    public_lon: 18.908 + Math.floor(i / 4) * 0.0002,
    last_confirmed_at: now,
  }));
  return [...spread, ...cluster];
}

export function MapPage({ intervalDays }: { intervalDays: number }) {
  const nav = useNavigate();
  const user = currentUser();
  const [points, setPoints] = useState<Point[]>([]);
  const [pendingMine, setPendingMine] = useState(0);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Record<string, boolean>>({ ...DEFAULT_CATEGORY_ON });
  const [services, setServices] = useState<Service[]>([]);
  const [tileWarn, setTileWarn] = useState("");
  const [tilesKey, setTilesKey] = useState(0);
  const [hits, setHits] = useState<Point[]>([]);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      let feedPoints: Point[] = [];
      try {
        const feed = await fetch("/api/feed.geojson").then((r) => {
          if (!r.ok) throw new Error("feed");
          return r.json();
        });
        feedPoints = (feed.features || []).map((f: { properties: Point; geometry: { coordinates: number[] } }) => ({
          ...f.properties,
          public_lon: f.geometry.coordinates[0],
          public_lat: f.geometry.coordinates[1],
          status: "verified" as const,
        }));
      } catch {
        try {
          feedPoints = await pb.collection("points").getFullList<Point>({
            filter: 'status = "verified" && blocked = false && category != "potrzeba"',
            sort: "-updated_at",
          });
        } catch {
          feedPoints = [];
        }
      }
      let extra: Point[] = [];
      const u = currentUser();
      if (u) {
        const filter = isOperator(u)
          ? 'status = "pending" && category != "potrzeba"'
          : `created_by = "${u.id}" && status = "pending" && category != "potrzeba"`;
        try {
          extra = await pb.collection("points").getFullList<Point>({ filter });
        } catch {
          extra = [];
        }
      }
      if (!live) return;
      const demo = new URLSearchParams(window.location.search).has("demo");
      if (demo) {
        setCats(Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c, true])));
        setPoints(mergeById(feedPoints, extra.concat(demoOcPoints())));
      } else {
        setPoints(mergeById(feedPoints, extra));
      }
      setPendingMine(extra.length);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!tileWarn) return;
    let stop = false;
    const tick = async () => {
      try {
        const idx = await fetch("/tiles/index.json").then((r) => (r.ok ? r.json() : null));
        const files: string[] = idx?.files || [];
        const head = await fetch("/tiles/poland.pmtiles", { method: "HEAD" });
        if (!stop && (files.some((f) => f.endsWith(".pmtiles")) || head.ok)) {
          setTileWarn("");
          setTilesKey((k) => k + 1);
        }
      } catch {
        /* jeszcze nie ma */
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [tileWarn]);

  function toggleCat(c: Category) {
    setCats((s) => ({ ...s, [c]: !s[c] }));
  }
  function toggleSvc(s: Service) {
    setServices((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]));
  }

  useEffect(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) {
      setHits([]);
      return;
    }
    setHits(
      points
        .filter((p) => {
          if (p.blocked) return false;
          if (p.status !== "verified" && p.status !== "pending") return false;
          if (p.category === "potrzeba") return false;
          if (!cats[p.category]) return false;
          if (services.length) {
            const svcs = asArray<Service>(p.services);
            if (!services.every((s) => svcs.includes(s))) return false;
          }
          if (!pointCoords(p)) return false;
          return pointHaystack(p).includes(query);
        })
        .slice(0, 8)
    );
  }, [q, points, cats, services]);

  const filtered = useMemo(() => points, [points]);

  return (
    <div className="map-wrap">
      <MapView
        key={tilesKey}
        points={filtered}
        cats={cats}
        services={services}
        intervalDays={intervalDays}
        focusPoint={focusPoint}
        focusSeq={focusSeq}
        onTilesMissing={(missing, online) => {
          if (missing && online) setTileWarn(t("map.brakKafelkow"));
          else if (missing) setTileWarn(t("map.brakKafelkowKrotko"));
          else setTileWarn("");
        }}
      />
      <div className="top-controls">
        <div className="search-box">
          <input
            className="search"
            type="search"
            role="searchbox"
            placeholder={t("map.szukaj")}
            aria-label={t("map.szukaj")}
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q.trim().length >= 2 ? (
            <div className="search-hits card" role="listbox" aria-label={t("map.szukaj")}>
              {hits.length ? (
                hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="search-hit"
                    role="option"
                    onClick={() => {
                      setFocusPoint(h);
                      setFocusSeq((n) => n + 1);
                      setQ("");
                    }}
                  >
                    <CatIcon category={h.category} size={22} />
                    <span>
                      <strong>{h.title}</strong>
                      <span className="search-hit-meta">{t(`cat.${h.category}`)}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="search-empty">{t("map.szukajBrak")}</p>
              )}
            </div>
          ) : null}
        </div>
        <FilterChips cats={cats} services={services} onToggleCat={toggleCat} onToggleSvc={toggleSvc} />
        <Legend />
        {pendingMine ? <p className="map-hint">{t("map.oczekujeHint")}</p> : null}
      </div>
      {tileWarn ? (
        <div className="warn-offline">
          {tileWarn}
          {isOperator(user) ? (
            <>
              {" "}
              <Link to="/status" style={{ color: "#fff" }}>
                {t("map.pobierzKafelki")}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="fab"
        onClick={() => nav(user ? "/dodaj" : "/login?next=/dodaj")}
      >
        + {t("nav.zglos")}
      </button>
    </div>
  );
}
