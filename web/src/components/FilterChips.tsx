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
    <div>
      <div className="chips" role="group" aria-label={t("map.filtry")}>
        {list.map((c) => {
          const on = !!cats[c];
          const color = CATEGORY_COLORS[c];
          return (
            <button
              key={c}
              type="button"
              className={`chip ${on ? "on" : ""}`}
              style={on ? { background: color } : { color }}
              onClick={() => onToggleCat(c)}
            >
              <span className="dot" style={{ background: on ? "#fff" : color }} />
              {t(`cat.${c}`)}
            </button>
          );
        })}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {SERVICE_FILTERS.map((s) => {
          const on = services.includes(s);
          return (
            <button key={s} type="button" className={`chip ${on ? "on" : ""}`} style={on ? { background: "#1a1714", color: "#fff" } : {}} onClick={() => onToggleSvc(s)}>
              {t(`svc.${s}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
