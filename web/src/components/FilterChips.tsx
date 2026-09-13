import { t } from "../i18n";
import { CATEGORY_COLORS, PUBLIC_CATEGORIES, SERVICE_FILTERS, type Category, type Service } from "../types";

export function FilterChips({
  cats,
  services,
  onToggleCat,
  onToggleSvc,
  showPotrzeba,
}: {
  cats: Record<string, boolean>;
  services: Service[];
  onToggleCat: (c: Category) => void;
  onToggleSvc: (s: Service) => void;
  showPotrzeba?: boolean;
}) {
  const list = showPotrzeba ? ([...PUBLIC_CATEGORIES, "potrzeba"] as Category[]) : PUBLIC_CATEGORIES;
  return (
    <div className="filters">
      <div className="chips" role="group" aria-label={t("map.filtry")}>
        {list.map((c) => {
          const on = !!cats[c];
          const color = CATEGORY_COLORS[c];
          return (
            <button
              key={c}
              type="button"
              className={`chip ${on ? "on" : ""}`}
              style={on ? { background: color, color: c === "prad" ? "#1a1714" : "#fff" } : { color }}
              onClick={() => onToggleCat(c)}
            >
              <span className="dot" style={{ background: on ? (c === "prad" ? "#1a1714" : "#fff") : color }} />
              {t(`cat.${c}`)}
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
                style={on ? { background: "#1a1714", color: "#fff" } : {}}
                onClick={() => onToggleSvc(s)}
              >
                {t(`svc.${s}`)}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
