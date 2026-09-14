import { t } from "../i18n";
import { formatSyncAgo } from "../lib/format";
import type { AuthUser, Point } from "../types";

/**
 * Potrzeby sąsiadów: lista (bez pinezek — potrzeby nie mają publicznych współrzędnych).
 * Zaufany sąsiad albo OSP bierze potrzebę jednym dotknięciem; drugi widzi, że jest wzięta.
 */
export function NeedsPanel({
  needs,
  user,
  busyId,
  onClose,
  onTake,
  onRelease,
  onResolve,
}: {
  needs: Point[];
  user: AuthUser | null;
  busyId: string;
  onClose: () => void;
  onTake: (p: Point) => void;
  onRelease: (p: Point) => void;
  onResolve: (p: Point) => void;
}) {
  const open = needs.filter((n) => !n.resolved_at || n.resolved_at.startsWith("0001"));
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <section className="layer-sheet card needs-panel" role="dialog" aria-label={t("needs.tytul")}>
        <header className="layer-sheet-head">
          <strong>
            {t("needs.tytul")} ({open.length})
          </strong>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("map.zamknij")}
          </button>
        </header>
        <p className="hint" style={{ margin: "0 0 8px" }}>{t("needs.opis")}</p>
        {open.length === 0 ? <p className="note info">{t("needs.brak")}</p> : null}
        {open.map((n) => {
          const mine = !!user && n.assigned_to === user.id;
          const taken = !!n.assigned_to && !mine;
          const urg = n.urgency || "srednia";
          return (
            <article key={n.id} className={`need-card urg-${urg}`}>
              <div className="need-head">
                <strong>{t(`need.${n.need_type || "inne"}`)}</strong>
                <span className={`urg-pill urg-${urg}`}>{t(`need.${urg}`)}</span>
              </div>
              <div className="need-meta">
                {n.people ? `${n.people} ${t("needs.osoby")} · ` : ""}
                {n.gmina_name || ""}
                {n.created ? ` · ${formatSyncAgo(n.created)}` : ""}
              </div>
              {n.title && !/^Zgłoszenie potrzeby/.test(n.title) ? <div className="need-title">{n.title}</div> : null}
              <div className="row" style={{ marginTop: 8 }}>
                {mine ? (
                  <>
                    <button type="button" className="btn ok" disabled={busyId === n.id} onClick={() => onResolve(n)}>
                      {t("needs.zalatwione")}
                    </button>
                    <button type="button" className="btn" disabled={busyId === n.id} onClick={() => onRelease(n)}>
                      {t("needs.oddaj")}
                    </button>
                  </>
                ) : taken ? (
                  <span className="need-taken">{t("needs.wziete")}</span>
                ) : (
                  <button type="button" className="btn primary" disabled={busyId === n.id} onClick={() => onTake(n)}>
                    {t("needs.biore")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
