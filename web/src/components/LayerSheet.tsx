import { Link } from "react-router-dom";
import { t } from "../i18n";
import { CatIcon } from "./CategoryBadge";
import { CATEGORY_COLORS, PUBLIC_CATEGORIES, SERVICE_FILTERS, type Category, type Service } from "../types";

/**
 * Jeden arkusz od dołu zamiast dwóch kart na mapie: filtry kategorii, usługi, legenda, wydruk.
 * Na telefonie mapa ma być mapą — chrome pokazuje się dopiero po dotknięciu „Warstwy”.
 */
export function LayerSheet({
  open,
  onClose,
  cats,
  services,
  onToggleCat,
  onToggleSvc,
  showPrint,
}: {
  open: boolean;
  onClose: () => void;
  cats: Record<string, boolean>;
  services: Service[];
  onToggleCat: (c: Category) => void;
  onToggleSvc: (s: Service) => void;
  showPrint?: boolean;
}) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <section className="layer-sheet card" role="dialog" aria-label={t("map.warstwy")}>
        <header className="layer-sheet-head">
          <strong>{t("map.warstwy")}</strong>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t("map.zamknij")}
          </button>
        </header>
        <div className="layer-grid" role="group" aria-label={t("map.filtry")}>
          {PUBLIC_CATEGORIES.map((c) => {
            const on = !!cats[c];
            return (
              <button
                key={c}
                type="button"
                className={`layer-row ${on ? "on" : ""}`}
                aria-pressed={on}
                style={on ? { borderColor: CATEGORY_COLORS[c] } : undefined}
                onClick={() => onToggleCat(c)}
              >
                <CatIcon category={c} size={26} />
                <span>{t(`cat.${c}`)}</span>
                <i className={`sw ${on ? "on" : ""}`} aria-hidden />
              </button>
            );
          })}
        </div>
        <details className="filter-more">
          <summary>
            {t("map.uslugiFiltr")}
            {services.length ? ` (${services.length})` : ""}
          </summary>
          <div className="chips wrap" style={{ marginTop: 8 }}>
            {SERVICE_FILTERS.map((s) => {
              const on = services.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  className={`chip ${on ? "on" : ""}`}
                  style={on ? { background: "var(--navy)", color: "#fff", borderColor: "var(--navy)" } : {}}
                  onClick={() => onToggleSvc(s)}
                >
                  {t(`svc.${s}`)}
                </button>
              );
            })}
          </div>
        </details>
        <details className="filter-more">
          <summary>{t("map.legenda")}</summary>
          <ul className="legend-list">
            <li>
              <i className="legend-ring ok" aria-hidden />
              {t("map.legendaOk")}
            </li>
            <li>
              <i className="legend-ring stale" aria-hidden />
              {t("map.legendaStale")}
            </li>
            <li>
              <i className="legend-ring pending" aria-hidden />
              {t("map.legendaPending")}
            </li>
          </ul>
          <p className="hint" style={{ margin: "6px 0 0" }}>{t("punktOdpornosciNote")}</p>
        </details>
        <p className="hint" style={{ margin: "8px 0 0" }}>{t("map.przytrzymaj")}</p>
        {showPrint ? (
          <p style={{ margin: "8px 0 0" }}>
            <Link className="btn block" to="/wydruk">
              {t("nav.wydruk")}
            </Link>
          </p>
        ) : null}
      </section>
    </>
  );
}
