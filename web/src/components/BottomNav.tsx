import { NavLink, useLocation } from "react-router-dom";
import { t } from "../i18n";
import type { AuthUser } from "../types";
import { isOperator } from "../lib/pb";

export function BottomNav({ user, pendingCount }: { user: AuthUser | null; pendingCount?: number }) {
  const loc = useLocation();
  if (loc.pathname === "/wydruk") return null;
  return (
    <nav className="bottom-nav" aria-label="Nawigacja">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.mapa")}
      </NavLink>
      <NavLink to="/dodaj" className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.zglos")}
      </NavLink>
      <NavLink to="/moje" className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.moje")}
      </NavLink>
      {isOperator(user) ? (
        <NavLink to="/operator" className={({ isActive }) => (isActive ? "active" : "")}>
          {t("nav.operator")}
          {pendingCount ? <span className="badge">{pendingCount}</span> : null}
        </NavLink>
      ) : user ? (
        <NavLink to="/status" className={({ isActive }) => (isActive ? "active" : "")}>
          {t("nav.status")}
        </NavLink>
      ) : (
        <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : "")}>
          {t("nav.zaloguj")}
        </NavLink>
      )}
    </nav>
  );
}
