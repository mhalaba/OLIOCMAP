import { t } from "../i18n";
import { PUBLIC_CATEGORIES } from "../types";
import { CatIcon } from "./CategoryBadge";

export function Legend() {
  return (
    <details className="legend">
      <summary>{t("map.legenda")}</summary>
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
        {PUBLIC_CATEGORIES.map((c) => (
          <li key={c}>
            <CatIcon category={c} size={22} />
            {t(`cat.${c}`)}
          </li>
        ))}
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
      <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 12 }}>{t("punktOdpornosciNote")}</p>
    </details>
  );
}
