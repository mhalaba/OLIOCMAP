import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayerSheet } from "../components/LayerSheet";
import { NeedsPanel } from "../components/NeedsPanel";
import { MapView } from "../components/MapView";
import { CatIcon } from "../components/CategoryBadge";
import { t } from "../i18n";
import { currentUser, isOperator, pb, asArray } from "../lib/pb";
import { findTilesFile } from "../lib/tiles";
import { isPresentDate } from "../lib/format";
import { DEFAULT_CATEGORY_ON, PUBLIC_CATEGORIES, type AuthUser, type Category, type Point, type Service } from "../types";

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

/** Potrzeby widzi zaufany sąsiad i OSP — nie mieszkaniec bez roli. */
function seesNeeds(u: AuthUser | null): boolean {
  return !!u && (u.role === "zaufany" || u.role === "operator" || u.role === "admin");
}

function demoOcPoints(): Point[] {
  const now = new Date().toISOString();
  const spread: Point[] = [
    { id: "demo-odpornosc", category: "odpornosc", title: "OSP Szombierki", status: "verified", public_lat: 50.348, public_lon: 18.923, last_confirmed_at: now, autonomy_h: 48, confirmed_by_name: "J.K., OSP Szombierki" },
    { id: "demo-schron", category: "schron", title: "Schron przy rynku", status: "verified", public_lat: 50.351, public_lon: 18.929, last_confirmed_at: now, verified_by_name: "A.N., OSP Bytom" },
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

function demoNeeds(): Point[] {
  const now = new Date().toISOString();
  return [
    { id: "demo-need-1", category: "potrzeba", title: "Zgłoszenie potrzeby — Bytom", status: "pending", need_type: "leki", people: 2, urgency: "wysoka", gmina_name: "Bytom", created: now },
    { id: "demo-need-2", category: "potrzeba", title: "Zgłoszenie potrzeby — Bytom", status: "pending", need_type: "woda", people: 5, urgency: "srednia", gmina_name: "Bytom", created: now, assigned_to: "ktos-inny" },
  ];
}

export function MapPage({ intervalDays }: { intervalDays: number }) {
  const nav = useNavigate();
  const user = currentUser();
  const demo = useMemo(() => new URLSearchParams(window.location.search).has("demo"), []);
  const [points, setPoints] = useState<Point[]>([]);
  const [needs, setNeeds] = useState<Point[]>([]);
  const [pendingMine, setPendingMine] = useState(0);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Record<string, boolean>>({ ...DEFAULT_CATEGORY_ON });
  const [services, setServices] = useState<Service[]>([]);
  const [tileWarn, setTileWarn] = useState("");
  const [tilesKey, setTilesKey] = useState(0);
  const [coverageWarn, setCoverageWarn] = useState("");
  const [hits, setHits] = useState<Point[]>([]);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [sheet, setSheet] = useState<"" | "layers" | "needs">("");
  const [busyId, setBusyId] = useState("");

  async function loadNeeds() {
    if (demo && !user) {
      setNeeds(demoNeeds());
      return;
    }
    if (!seesNeeds(user)) return;
    try {
      const list = await pb.collection("points").getFullList<Point>({
        filter: 'category = "potrzeba" && status != "expired"',
        sort: "-created",
      });
      setNeeds(list.filter((n) => !isPresentDate(n.deleted_at)));
    } catch {
      setNeeds([]);
    }
  }

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
      if (demo) {
        setCats(Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c, true])));
        setPoints(mergeById(feedPoints, extra.concat(demoOcPoints())));
      } else {
        setPoints(mergeById(feedPoints, extra));
      }
      setPendingMine(extra.length);
      await loadNeeds();
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!tileWarn) return;
    let stop = false;
    const tick = async () => {
      if (!stop && (await findTilesFile())) {
        setTileWarn("");
        setTilesKey((k) => k + 1);
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

  async function patchNeed(p: Point, body: Record<string, unknown>) {
    setBusyId(p.id);
    try {
      if (demo && p.id.startsWith("demo-")) {
        setNeeds((list) => list.map((n) => (n.id === p.id ? { ...n, ...body } : n)));
      } else {
        await pb.collection("points").update(p.id, body);
        await loadNeeds();
      }
    } catch {
      /* brak sieci albo uprawnień — lista zostaje jak była */
    } finally {
      setBusyId("");
    }
  }

  const openNeeds = needs.filter((n) => !isPresentDate(n.resolved_at)).length;
  const activeLayers = PUBLIC_CATEGORIES.filter((c) => cats[c]).length;
  const showNeeds = seesNeeds(user) || (demo && !user);

  return (
    <div className="map-wrap">
      <MapView
        key={tilesKey}
        points={points}
        cats={cats}
        services={services}
        intervalDays={intervalDays}
        focusPoint={focusPoint}
        focusSeq={focusSeq}
        onLongPress={(lat, lon) => nav(`/dodaj?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`)}
        onTilesMissing={(missing, online) => {
          if (missing && online) setTileWarn(t("map.brakKafelkow"));
          else if (missing) setTileWarn(t("map.brakKafelkowKrotko"));
          else setTileWarn("");
        }}
        onCoverage={(outside, name) => setCoverageWarn(outside ? t("map.pozaZasiegiem", { name }) : "")}
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
        <div className="ctl-row">
          <button type="button" className="ctl-btn" aria-expanded={sheet === "layers"} onClick={() => setSheet(sheet === "layers" ? "" : "layers")}>
            {t("map.warstwy")} <span className="n">{activeLayers}/{PUBLIC_CATEGORIES.length}</span>
          </button>
          {showNeeds ? (
            <button
              type="button"
              className={`ctl-btn ${openNeeds ? "hot" : ""}`}
              aria-expanded={sheet === "needs"}
              onClick={() => setSheet(sheet === "needs" ? "" : "needs")}
            >
              {t("map.potrzeby")} <span className="n">{openNeeds}</span>
            </button>
          ) : null}
        </div>
        {pendingMine ? <p className="map-hint">{t("map.oczekujeHint")}</p> : null}
      </div>
      <LayerSheet
        open={sheet === "layers"}
        onClose={() => setSheet("")}
        cats={cats}
        services={services}
        onToggleCat={toggleCat}
        onToggleSvc={toggleSvc}
        showPrint={isOperator(user)}
      />
      {sheet === "needs" ? (
        <NeedsPanel
          needs={needs}
          user={user}
          busyId={busyId}
          onClose={() => setSheet("")}
          onTake={(p) => patchNeed(p, { assigned_to: user?.id || "ja" })}
          onRelease={(p) => patchNeed(p, { assigned_to: "" })}
          onResolve={(p) => patchNeed(p, { resolved_at: new Date().toISOString(), status: "expired" })}
        />
      ) : null}
      {!tileWarn && coverageWarn ? (
        <div className="warn-offline soft" role="status">
          {coverageWarn}
        </div>
      ) : null}
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
      <button type="button" className="fab" onClick={() => nav("/dodaj")}>
        + {t("nav.zglos")}
      </button>
    </div>
  );
}
