import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CatIcon } from "../components/CategoryBadge";
import { t } from "../i18n";
import { freshnessLabel, isPresentDate } from "../lib/format";
import { currentUser, isOperator, pb } from "../lib/pb";
import type { Point } from "../types";

/**
 * Obchód: lista punktów do sprawdzenia w terenie, od najbardziej zaległych.
 *
 * Mapa umie pokazać „niepotwierdzony od N dni”, ale to nic nie znaczy, dopóki ktoś
 * nie przejdzie i nie sprawdzi. Ta strona służy do obu wariantów: potwierdzenia
 * z telefonu na miejscu i wydruku listy do obejścia z długopisem.
 */
function daysOverdue(p: Point, intervalDays: number): number {
  const interval = p.confirm_interval_days || intervalDays;
  if (!p.last_confirmed_at || !isPresentDate(p.last_confirmed_at)) return 9999;
  const days = (Date.now() - Date.parse(p.last_confirmed_at)) / 86400000;
  return days - interval;
}

export function PatrolPage({ intervalDays }: { intervalDays: number }) {
  const nav = useNavigate();
  const user = currentUser();
  const [points, setPoints] = useState<Point[]>([]);
  const [onlyStale, setOnlyStale] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const when = new Date().toLocaleDateString("pl-PL");

  async function load() {
    setErr("");
    try {
      const list = await pb.collection("points").getFullList<Point>({
        filter: 'status = "verified" && blocked = false && category != "potrzeba"',
        sort: "title",
      });
      setPoints(list.filter((p) => !isPresentDate(p.deleted_at)));
    } catch {
      setErr(t("err.ogolny"));
    }
  }

  useEffect(() => {
    if (!isOperator(user)) {
      nav("/login?next=/obchod");
      return;
    }
    load().catch(() => {});
  }, [user, nav]);

  const rows = useMemo(() => {
    const withState = points.map((p) => ({
      point: p,
      fresh: freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays),
      overdue: daysOverdue(p, intervalDays),
    }));
    const filtered = onlyStale ? withState.filter((r) => r.fresh.stale) : withState;
    return filtered.sort((a, b) => b.overdue - a.overdue);
  }, [points, onlyStale, intervalDays]);

  const staleCount = useMemo(
    () => points.filter((p) => freshnessLabel(p.last_confirmed_at, p.confirm_interval_days || intervalDays).stale).length,
    [points, intervalDays]
  );

  async function confirm(id: string) {
    setBusy(id);
    try {
      await pb.collection("points").update(id, { last_confirmed_at: new Date().toISOString() });
      await load();
    } catch {
      setErr(t("err.ogolny"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page patrol-page">
      <p className="ops-kicker no-print">Obrona cywilna</p>
      <h1>{t("patrol.tytul")}</h1>
      <p className="patrol-sub">
        {t("patrol.data")}: {when} · {t("patrol.zalegle", { n: staleCount })}
      </p>
      <p className="hint no-print">{t("patrol.opis")}</p>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <button type="button" className="btn" onClick={() => setOnlyStale(!onlyStale)}>
          {onlyStale ? t("patrol.pokazWszystkie") : t("patrol.tylkoZalegle")}
        </button>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          {t("print.drukuj")}
        </button>
        <Link className="btn ghost" to="/operator">
          {t("nav.operator")}
        </Link>
      </div>
      {err ? <p className="note">{err}</p> : null}

      {rows.length === 0 ? <p>{t("patrol.pusto")}</p> : null}

      <ul className="patrol-list">
        {rows.map(({ point, fresh }) => (
          <li key={point.id} className={`patrol-row ${fresh.stale ? "stale" : ""}`}>
            <span className="patrol-check" aria-hidden />
            <CatIcon category={point.category} size={24} />
            <span className="patrol-main">
              <strong>{point.title}</strong>
              <span className="patrol-meta">
                {t(`cat.${point.category}`)}
                {point.address ? ` · ${point.address}` : ""}
                {point.hours ? ` · ${point.hours}` : ""}
              </span>
              <span className={fresh.stale ? "stale" : "fresh"}>{fresh.text}</span>
              {point.contact_public ? <span className="patrol-meta">{point.contact_public}</span> : null}
            </span>
            <span className="patrol-sign" aria-hidden />
            <button
              type="button"
              className="btn ok no-print"
              disabled={busy === point.id}
              onClick={() => confirm(point.id)}
            >
              {t("op.potwierdz")}
            </button>
          </li>
        ))}
      </ul>
      <p className="patrol-foot">{t("patrol.stopka")}</p>
    </div>
  );
}
