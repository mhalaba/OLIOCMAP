import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { currentUser, isOperator, pb } from "../lib/pb";
import { freshnessLabel } from "../lib/format";
import type { Point } from "../types";

type Tab = "kolejka" | "potwierdzenia" | "potrzeby" | "bledy" | "uzytkownicy";

export function OperatorPage({ intervalDays }: { intervalDays: number }) {
  const nav = useNavigate();
  const user = currentUser();
  const [tab, setTab] = useState<Tab>("kolejka");
  const [points, setPoints] = useState<Point[]>([]);
  const [reports, setReports] = useState<{ id: string; point_id: string; reason: string; text: string; handled: boolean }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; name: string; role: string }[]>([]);

  useEffect(() => {
    if (!isOperator(user)) {
      nav("/login?next=/operator");
      return;
    }
    reload();
  }, [user, nav]);

  async function reload() {
    const all = await pb.collection("points").getFullList<Point>({ sort: "-created" });
    setPoints(all);
    try {
      const r = await pb.collection("reports").getFullList<{ id: string; point_id: string; reason: string; text: string; handled: boolean }>({
        filter: "handled = false",
      });
      setReports(r);
    } catch {
      setReports([]);
    }
    if (user?.role === "admin") {
      try {
        const u = await pb.collection("users").getFullList<{ id: string; email: string; name: string; role: string }>();
        setUsers(u);
      } catch {
        setUsers([]);
      }
    }
  }

  const pending = useMemo(() => {
    return points
      .filter((p) => p.status === "pending" && !p.deleted_at)
      .sort((a, b) => {
        const az = 0;
        const bz = 0;
        return az - bz;
      });
  }, [points]);

  const overdue = useMemo(() => {
    return points.filter((p) => p.status === "verified" && !p.blocked && freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays).stale);
  }, [points, intervalDays]);

  const needs = useMemo(() => points.filter((p) => p.category === "potrzeba" && p.status !== "expired" && !p.resolved_at), [points]);

  async function verify(id: string) {
    await pb.collection("points").update(id, { status: "verified" });
    await reload();
  }
  async function reject(id: string) {
    await pb.collection("points").update(id, { status: "rejected" });
    await reload();
  }
  async function confirm(id: string) {
    await pb.collection("points").update(id, { last_confirmed_at: new Date().toISOString() });
    await reload();
  }
  async function resolveNeed(id: string) {
    await pb.collection("points").update(id, { resolved_at: new Date().toISOString(), status: "expired" });
    await reload();
  }

  return (
    <div className="page">
      <h1>{t("nav.operator")}</h1>
      <div className="tabs">
        {(["kolejka", "potwierdzenia", "potrzeby", "bledy"] as Tab[]).map((k) => (
          <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t("op." + k)}
          </button>
        ))}
        {user?.role === "admin" ? (
          <button type="button" className={tab === "uzytkownicy" ? "on" : ""} onClick={() => setTab("uzytkownicy")}>
            {t("op.uzytkownicy")}
          </button>
        ) : null}
        <Link to="/operator/wezly" className="btn ghost">
          {t("op.wezly")}
        </Link>
      </div>

      {tab === "kolejka" &&
        (pending.length ? (
          pending.map((p) => (
            <article key={p.id} className="card">
              <h2>{p.title}</h2>
              <p>
                {t("cat." + p.category)} · {p.address || `${p.lat}, ${p.lon}`}
              </p>
              {p.conflict ? <p className="stale">{t("status.conflict")}</p> : null}
              <div className="queue-actions">
                <button type="button" className="btn ok" onClick={() => verify(p.id)}>
                  {t("op.weryfikuj")}
                </button>
                <button type="button" className="btn warn" onClick={() => reject(p.id)}>
                  {t("op.odrzuc")}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p>{t("op.pustaKolejka")}</p>
        ))}

      {tab === "potwierdzenia" &&
        overdue.map((p) => (
          <article key={p.id} className="card">
            <h2>{p.title}</h2>
            <p className="stale">{freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays).text}</p>
            <button type="button" className="btn primary block" onClick={() => confirm(p.id)}>
              {t("op.potwierdz")}
            </button>
          </article>
        ))}

      {tab === "potrzeby" &&
        needs.map((p) => (
          <article key={p.id} className="card">
            <h2>{p.title}</h2>
            <p>
              {t("need." + (p.need_type || "inne"))} · {p.people || 0} os. · {t("need." + (p.urgency || "srednia"))}
            </p>
            <p>{p.description}</p>
            <p>
              {p.lat}, {p.lon}
            </p>
            <button type="button" className="btn" onClick={() => resolveNeed(p.id)}>
              {t("op.zamknijPotrzebe")}
            </button>
          </article>
        ))}

      {tab === "bledy" &&
        reports.map((r) => (
          <article key={r.id} className="card">
            <p>
              {r.point_id}: {t("report." + r.reason)}
            </p>
            <p>{r.text}</p>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await pb.collection("reports").update(r.id, { handled: true });
                await reload();
              }}
            >
              {t("form.zapisz")}
            </button>
          </article>
        ))}

      {tab === "uzytkownicy" &&
        users.map((u) => (
          <article key={u.id} className="card">
            <p>
              {u.name} · {u.email} · {u.role}
            </p>
            {user?.role === "admin" ? (
              <select
                value={u.role}
                onChange={async (e) => {
                  await pb.collection("users").update(u.id, { role: e.target.value });
                  await reload();
                }}
              >
                {["citizen", "zaufany", "operator", "admin"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : null}
          </article>
        ))}
    </div>
  );
}
