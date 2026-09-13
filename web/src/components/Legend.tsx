import { t } from "../i18n";
import { CATEGORY_COLORS, PUBLIC_CATEGORIES } from "../types";

export function Legend() {
  return (
    <details className="legend">
      <summary>{t("map.legenda")}</summary>
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
        {PUBLIC_CATEGORIES.map((c) => (
          <li key={c}>
            <i style={{ background: CATEGORY_COLORS[c] }} />
            {t(`cat.${c}`)}
          </li>
        ))}
      </ul>
      <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 12 }}>{t("punktOdpornosciNote")}</p>
    </details>
  );
}
