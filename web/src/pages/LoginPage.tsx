import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { t } from "../i18n";
import { pb } from "../lib/pb";

export function LoginPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await pb.collection("users").authWithPassword(email, password);
      nav(next);
    } catch {
      setErr(t("auth.bladLogowania"));
    }
  }

  return (
    <div className="page">
      <h1>{t("auth.zaloguj")}</h1>
      <form onSubmit={onSubmit} className="card">
        <label className="field">
          <span>{t("auth.email")}</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>{t("auth.haslo")}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {err ? <p className="note">{err}</p> : null}
        <button className="btn primary block" type="submit">
          {t("auth.zaloguj")}
        </button>
      </form>
      <p>
        {t("auth.konto")} <Link to={"/rejestracja?next=" + encodeURIComponent(next)}>{t("auth.zarejestruj")}</Link>
      </p>
    </div>
  );
}
