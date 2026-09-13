import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { t } from "../i18n";
import { fetchConfig, pb } from "../lib/pb";

export function RegisterPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const [mode, setMode] = useState("open");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchConfig()
      .then((c) => setMode(c.registration_mode || "open"))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await pb.collection("users").create({
        name,
        email,
        password,
        passwordConfirm: password,
        invite_code: code,
        role: "citizen",
      });
      await pb.collection("users").authWithPassword(email, password);
      nav(next);
    } catch (ex: unknown) {
      const msg = ex && typeof ex === "object" && "message" in ex ? String((ex as Error).message) : "";
      setErr(msg.includes("zamknięta") ? t("auth.zamknieta") : t("auth.bladRejestracji"));
    }
  }

  if (mode === "closed") {
    return (
      <div className="page">
        <h1>{t("auth.zarejestruj")}</h1>
        <p className="note">{t("auth.zamknieta")}</p>
        <Link to="/login">{t("auth.zaloguj")}</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t("auth.zarejestruj")}</h1>
      <form onSubmit={onSubmit} className="card">
        <label className="field">
          <span>{t("auth.imie")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>{t("auth.haslo")}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {mode === "invite" ? (
          <label className="field">
            <span>{t("auth.kod")}</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required minLength={8} maxLength={8} />
          </label>
        ) : null}
        {err ? <p className="note">{err}</p> : null}
        <button className="btn primary block" type="submit">
          {t("auth.zarejestruj")}
        </button>
      </form>
      <p>
        {t("auth.masz")} <Link to={"/login?next=" + encodeURIComponent(next)}>{t("auth.zaloguj")}</Link>
      </p>
    </div>
  );
}
