import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { currentUser, isAdmin, isOperator, pb, pbErrorMessage } from "../lib/pb";
import type { Role } from "../types";

type UserRow = { id: string; email: string; name: string; role: Role; org_name?: string };
type InviteRow = { id: string; code: string; uses_left: number; expires_at?: string };

const STAFF_ROLES: Role[] = ["citizen", "zaufany", "operator", "admin"];
const OP_ROLES: Role[] = ["citizen", "zaufany"];

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function AdminPage() {
  const nav = useNavigate();
  const user = currentUser();
  const admin = isAdmin(user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState<Role>("citizen");
  const [uses, setUses] = useState(10);
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOperator(user)) {
      nav("/login?next=/admin");
    }
  }, [user, nav]);

  async function reload() {
    try {
      const u = await pb.collection("users").getFullList<UserRow>({ sort: "name" });
      setUsers(u);
    } catch {
      setUsers([]);
    }
    try {
      const inv = await pb.collection("invites").getFullList<InviteRow>({ sort: "-created" });
      setInvites(inv);
    } catch {
      setInvites([]);
    }
  }

  useEffect(() => {
    if (!isOperator(user)) return;
    reload().catch(() => {});
  }, [user]);

  const roles = admin ? STAFF_ROLES : OP_ROLES;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (password.length < 8) {
      setErr(t("admin.hasloKrotkie"));
      return;
    }
    if (password !== password2) {
      setErr(t("admin.haslaRozne"));
      return;
    }
    setSaving(true);
    try {
      await pb.collection("users").create({
        name,
        email,
        password,
        passwordConfirm: password,
        role,
        org_name: org,
        emailVisibility: true,
      });
      setName("");
      setEmail("");
      setPassword("");
      setPassword2("");
      setOrg("");
      setRole("citizen");
      setMsg(t("admin.utworzono"));
      await reload();
    } catch (ex) {
      setErr(pbErrorMessage(ex, t("err.ogolny")));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(id: string, next: Role) {
    if (!admin) return;
    if (id === user?.id) return;
    setErr("");
    try {
      await pb.collection("users").update(id, { role: next });
      await reload();
    } catch (ex) {
      setErr(pbErrorMessage(ex, t("err.ogolny")));
    }
  }

  async function makeInvite() {
    setErr("");
    setMsg("");
    try {
      const rec = await pb.collection("invites").create({
        code: randomCode(),
        created_by: user?.id,
        uses_left: uses,
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      });
      setInvites((a) => [rec as unknown as InviteRow, ...a]);
    } catch (ex) {
      setErr(pbErrorMessage(ex, t("err.ogolny")));
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMsg(t("admin.skopiowano"));
    } catch {
      setMsg(code);
    }
  }

  return (
    <div className="page">
      <h1>{t("admin.tytul")}</h1>
      <p className="page-links">
        <Link to="/operator">{t("nav.operator")}</Link>
        {" · "}
        <Link to="/status">{t("nav.status")}</Link>
        {" · "}
        <Link to="/prywatnosc">{t("nav.prywatnosc")}</Link>
      </p>
      <p className="hint" style={{ marginTop: 0 }}>
        {t("admin.opis")}
      </p>
      {err ? <p className="note">{err}</p> : null}
      {msg ? <p className="note info">{msg}</p> : null}

      <form onSubmit={onCreate} className="card">
        <h2>{t("admin.nowy")}</h2>
        <label className="field" htmlFor="admin-name">
          <span>{t("auth.imie")}</span>
          <input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>
        <label className="field" htmlFor="admin-email">
          <span>{t("auth.email")}</span>
          <input id="admin-email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </label>
        <div className="row">
          <label className="field grow" htmlFor="admin-haslo">
            <span>{t("auth.haslo")}</span>
            <input
              id="admin-haslo"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label className="field grow" htmlFor="admin-haslo2">
            <span>{t("admin.hasloPowtorz")}</span>
            <input
              id="admin-haslo2"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
        </div>
        <label className="field" htmlFor="admin-org">
          <span>{t("admin.organizacja")}</span>
          <input id="admin-org" value={org} onChange={(e) => setOrg(e.target.value)} maxLength={80} />
        </label>
        <label className="field" htmlFor="admin-rola">
          <span>{t("admin.rola")}</span>
          <select id="admin-rola" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {t("role." + r)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary block" type="submit" disabled={saving}>
          {t("admin.nowy")}
        </button>
      </form>

      <div className="card">
        <h2>{t("admin.lista")}</h2>
        {!users.length ? <p>{t("admin.brak")}</p> : null}
        {users.map((u) => (
          <div key={u.id} className="user-row">
            <div>
              <strong>{u.name || u.email}</strong>
              <div className="hint">
                {u.email}
                {u.org_name ? ` · ${u.org_name}` : ""}
              </div>
            </div>
            {admin && u.id !== user?.id ? (
              <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role)} aria-label={t("admin.rola")}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t("role." + r)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="role-pill">{t("role." + u.role)}</span>
            )}
          </div>
        ))}
        {admin ? <p className="hint">{t("admin.wlasneKonto")}</p> : null}
      </div>

      <div className="card">
        <h2>{t("op.invites")}</h2>
        <p>{t("admin.zaproszeniaOpis")}</p>
        <div className="row">
          <label className="field grow">
            <span>{t("admin.uzycia")}</span>
            <input type="number" min={1} value={uses} onChange={(e) => setUses(Number(e.target.value))} />
          </label>
          <label className="field grow">
            <span>{t("admin.waznoscDni")}</span>
            <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
        </div>
        <button type="button" className="btn" onClick={() => makeInvite()}>
          {t("op.nowyKod")}
        </button>
        {invites.map((inv) => (
          <div key={inv.id} className="user-row">
            <div>
              <strong className="mono">{inv.code}</strong>
              <div className="hint">
                {t("admin.uzycia")}: {inv.uses_left}
                {inv.expires_at ? ` · ${String(inv.expires_at).slice(0, 10)}` : ""}
              </div>
            </div>
            <button type="button" className="btn" onClick={() => copyCode(inv.code)}>
              {t("admin.kopiuj")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
