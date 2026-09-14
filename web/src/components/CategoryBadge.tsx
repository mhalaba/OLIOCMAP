import { t } from "../i18n";
import { categoryIconSrc } from "../icons";
import { CATEGORY_COLORS, type Category } from "../types";

export function CategoryBadge({ category }: { category: Category | string }) {
  const cat = category as Category;
  const color = CATEGORY_COLORS[cat] || "#1e3a5f";
  return (
    <span className="cat-badge" style={{ background: color, color: cat === "prad" ? "#0f2744" : "#fff" }}>
      <img className="cat-icon" src={categoryIconSrc(cat)} alt="" width={18} height={18} />
      {t("cat." + cat)}
    </span>
  );
}

export function CatIcon({ category, size = 20 }: { category: Category | string; size?: number }) {
  return <img className="cat-icon" src={categoryIconSrc(category)} alt="" width={size} height={size} draggable={false} />;
}
