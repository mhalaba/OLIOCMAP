import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilterChips } from "../components/FilterChips";
import { Legend } from "../components/Legend";
import { MapView } from "../components/MapView";
import { t } from "../i18n";
import { currentUser, isOperator, pb } from "../lib/pb";
import { DEFAULT_CATEGORY_ON, type Category, type Point, type Service } from "../types";

function mergeById(base: Point[], extra: Point[]): Point[] {
  const map = new Map<string, Point>();
  for (const p of base) map.set(p.id, p);
  for (const p of extra) {
    if (!map.has(p.id)) map.set(p.id, p);
  }
  return [...map.values()];
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
      setPendingMine(extra.length);
      setPoints(mergeById(feedPoints, extra));
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
        .filter((p) => `${p.title} ${p.address || ""}`.toLowerCase().includes(query))
        .slice(0, 8)
    );
  }, [q, points]);

  const filtered = useMemo(() => points, [points]);

  return (
    <div className="map-wrap">
      <MapView
        key={tilesKey}
        points={filtered}
        cats={cats}
        services={services}
        intervalDays={intervalDays}
        onTilesMissing={(missing, online) => {
          if (missing && online) setTileWarn(t("map.brakKafelkow"));
          else if (missing) setTileWarn(t("map.brakKafelkowKrotko"));
          else setTileWarn("");
        }}
      />
      <div className="top-controls">
        <input className="search" placeholder={t("map.szukaj")} value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.length ? (
          <div className="card" style={{ margin: 0 }}>
            {hits.map((h) => (
              <div key={h.id} style={{ padding: "6px 0", fontWeight: 700 }}>
                {h.title}
                <div style={{ fontWeight: 500, fontSize: 12, color: "var(--muted)" }}>{h.address}</div>
              </div>
            ))}
          </div>
        ) : null}
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
