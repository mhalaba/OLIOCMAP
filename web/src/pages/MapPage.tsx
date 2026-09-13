import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilterChips } from "../components/FilterChips";
import { Legend } from "../components/Legend";
import { MapView } from "../components/MapView";
import { t } from "../i18n";
import { currentUser, isOperator, pb } from "../lib/pb";
import { DEFAULT_CATEGORY_ON, type Category, type Point, type Service } from "../types";

export function MapPage({ intervalDays }: { intervalDays: number }) {
  const nav = useNavigate();
  const user = currentUser();
  const [points, setPoints] = useState<Point[]>([]);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Record<string, boolean>>({ ...DEFAULT_CATEGORY_ON });
  const [services, setServices] = useState<Service[]>([]);
  const [tileWarn, setTileWarn] = useState("");
  const [hits, setHits] = useState<Point[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const feed = await fetch("/api/feed.geojson").then((r) => {
          if (!r.ok) throw new Error("feed");
          return r.json();
        });
        const mapped: Point[] = (feed.features || []).map((f: { properties: Point; geometry: { coordinates: number[] } }) => ({
          ...f.properties,
          public_lon: f.geometry.coordinates[0],
          public_lat: f.geometry.coordinates[1],
          status: "verified" as const,
        }));
        if (live) setPoints(mapped);
      } catch {
        try {
          const res = await pb.collection("points").getFullList<Point>({
            filter: 'status = "verified" && blocked = false && category != "potrzeba"',
            sort: "-updated_at",
          });
          if (live) setPoints(res);
        } catch {
          /* empty */
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

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
      <Link to="/prywatnosc" className="no-print" style={{ position: "absolute", left: 10, bottom: 72, fontSize: 12, zIndex: 4 }}>
        {t("nav.prywatnosc")}
      </Link>
    </div>
  );
}
