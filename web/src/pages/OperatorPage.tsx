import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { currentUser, isOperator, pb } from "../lib/pb";
import { freshnessLabel, isPresentDate } from "../lib/format";
import type { Point } from "../types";

type Tab = "kolejka" | "potwierdzenia" | "potrzeby" | "bledy" | "uzytkownicy";

async function loadPoints(filter: string): Promise<Point[]> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      return await pb.collection("points").getFullList<Point>({ filter, sort: "-updated_at" });
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status === 429 && i < 3) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

export function OperatorPage({ intervalDays }: { intervalDays: number }) {
  const nav = useNavigate();
  const user = currentUser();
  const [tab, setTab] = useState<Tab>("kolejka");
  const [points, setPoints] = useState<Point[]>([]);
  const [counts, setCounts] = useState({ kolejka: 0, potwierdzenia: 0, potrzeby: 0 });
  const [loadErr, setLoadErr] = useState("");
  const [reports, setReports] = useState<{ id: string; point_id: string; reason: string; text: string; handled: boolean }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; name: string; role: string }[]>([]);

  useEffect(() => {
    if (!isOperator(user)) {
      nav("/login?next=/operator");
      return;
    }
    reload();
  }, [user, nav, tab]);

  async function reload() {
    setLoadErr("");
    try {
      if (tab === "kolejka") {
        setPoints(await loadPoints('status = "pending" && category != "potrzeba"'));
      } else if (tab === "potwierdzenia") {
        setPoints(
          await loadPoints(
            'status = "verified" && (category != "aed" || external_ref = "")'
          )
        );
      } else if (tab === "potrzeby") {
        setPoints(await loadPoints('category = "potrzeba" && status != "expired"'));
      } else {
        setPoints([]);
      }
    } catch {
      setLoadErr(t("err.siec"));
      return;
    }
    try {
      const [k, n] = await Promise.all([
        pb.collection("points").getList(1, 1, { filter: 'status = "pending" && category != "potrzeba"' }),
        pb.collection("points").getList(1, 1, { filter: 'category = "potrzeba" && status != "expired"' }),
      ]);
      setCounts((c) => ({ ...c, kolejka: k.totalItems, potrzeby: n.totalItems }));
    } catch {
      /* keep */
    }
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
      .filter((p) => p.status === "pending" && !isPresentDate(p.deleted_at) && p.category !== "potrzeba")
      .sort((a, b) => {
        const ar = a.reporter_role === "zaufany" || a.expand?.created_by?.role === "zaufany" ? 0 : 1;
        const br = b.reporter_role === "zaufany" || b.expand?.created_by?.role === "zaufany" ? 0 : 1;
        if (ar !== br) return ar - br;
        return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
      });
  }, [points]);

  const overdue = useMemo(() => {
    return points.filter(
      (p) =>
        p.status === "verified" &&
        !p.blocked &&
        !isPresentDate(p.deleted_at) &&
        freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays).stale
    );
  }, [points, intervalDays]);

  const needs = useMemo(
    () =>
      points.filter(
        (p) => p.category === "potrzeba" && p.status !== "expired" && !isPresentDate(p.resolved_at) && !isPresentDate(p.deleted_at)
      ),
    [points]
  );

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
      <p className="page-links">
        <Link to="/status">{t("nav.status")}</Link>
        {" · "}
        <Link to="/prywatnosc">{t("nav.prywatnosc")}</Link>
      </p>
      {loadErr ? (
        <p className="note">
          {loadErr}{" "}
          <button type="button" className="btn" onClick={() => reload()}>
            {t("form.odswiez")}
          </button>
        </p>
      ) : null}
      <div className="tabs">
        {(["kolejka", "potwierdzenia", "potrzeby", "bledy"] as Tab[]).map((k) => {
          const n =
            k === "kolejka" ? counts.kolejka : k === "potwierdzenia" ? overdue.length : k === "potrzeby" ? counts.potrzeby : reports.length;
          return (
            <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {t("op." + k)}
              {n ? <span className="tab-count">{n}</span> : null}
            </button>
          );
        })}
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
              {p.reporter_role === "zaufany" ? <p className="fresh">{t("op.zaufany")}</p> : null}
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
          <p>
            {t("op.pustaKolejka")}
            {needs.length ? (
              <>
                {" "}
                <button type="button" className="linkish" onClick={() => setTab("potrzeby")}>
                  {t("op.saPotrzeby", { n: needs.length })}
                </button>
              </>
            ) : null}
          </p>
        ))}

      {tab === "potwierdzenia" &&
        (overdue.length ? (
          overdue.map((p) => (
            <article key={p.id} className="card">
              <h2>{p.title}</h2>
              <p className="stale">{freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays).text}</p>
              <button type="button" className="btn primary block" onClick={() => confirm(p.id)}>
                {t("op.potwierdz")}
              </button>
            </article>
          ))
        ) : (
          <p>{t("op.pustePotwierdzenia")}</p>
        ))}

      {tab === "potrzeby" &&
        (needs.length ? (
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
          ))
        ) : (
          <p>{t("op.pustePotrzeby")}</p>
        ))}

      {tab === "bledy" &&
        (reports.length ? (
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
          ))
        ) : (
          <p>{t("op.pusteBledy")}</p>
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
                    {t("role." + r)}
                  </option>
                ))}
              </select>
            ) : null}
          </article>
        ))}
    </div>
  );
}
