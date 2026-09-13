import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { currentUser, fetchStatus, isOperator, pb } from "../lib/pb";
import { ALL_CATEGORIES, type NodeStatus } from "../types";

const STATUSES = ["pending", "verified", "rejected", "expired"] as const;

export function StatusPage() {
  const [st, setSt] = useState<NodeStatus | null>(null);
  const user = currentUser();
  const op = isOperator(user);
  const [storage, setStorage] = useState("");

  useEffect(() => {
    fetchStatus().then(setSt).catch(() => {});
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => {
        const used = Math.round((e.usage || 0) / 1048576);
        const quota = Math.round((e.quota || 0) / 1048576);
        setStorage(`${used} / ${quota} MB`);
      });
    }
  }, []);

  async function downloadBundle() {
    const res = await fetch("/sync/v1/export.bundle", { headers: { Authorization: pb.authStore.token } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-${st?.node_id || "wezel"}.json.gz`;
    a.click();
  }

  const byCat = st?.counts?.by_category || {};
  const byStatus = st?.counts?.by_status || {};

  return (
    <div className="page">
      <h1>{t("statusPage.wezel")}</h1>
      <div className="card">
        <p>
          <strong>{st?.node_name}</strong> ({st?.node_id})
        </p>
        <p>
          {t("statusPage.tryb")}: {st?.mode === "sync" ? t("banner.sync") : t("banner.wyspa")}
        </p>
        <p>
          {t("banner.ostatnia")}: {st?.last_push || st?.last_pull || t("banner.nigdy")}
        </p>
        <p>
          {t("statusPage.wersja")}: {st?.version}
        </p>
        {storage ? (
          <p>
            {t("statusPage.pamiec")}: {storage}
          </p>
        ) : null}
      </div>
      <div className="card">
        <h2>{t("statusPage.liczniki")}</h2>
        <ul className="count-list">
          {STATUSES.map((s) => (
            <li key={s}>
              <span>{t("status." + s)}</span>
              <strong>{byStatus[s] || 0}</strong>
            </li>
          ))}
        </ul>
        <ul className="count-list">
          {ALL_CATEGORIES.filter((c) => (byCat[c] || 0) > 0 || c !== "potrzeba").map((c) => (
            <li key={c}>
              <span>{t("cat." + c)}</span>
              <strong>{byCat[c] || 0}</strong>
            </li>
          ))}
        </ul>
        <p>
          {t("statusPage.potrzebyOtwarte")}: <strong>{st?.potrzeba_open ?? 0}</strong>
        </p>
      </div>
      <div className="card">
        <h2>{t("statusPage.peers")}</h2>
        {(st?.peers || []).length === 0 ? <p>{t("statusPage.brakSasiadow")}</p> : null}
        {(st?.peers || []).map((p) => (
          <p key={p.node_id}>
            {p.node_id}: {p.ok ? t("statusPage.dziala") : t("statusPage.niedostepny")}
          </p>
        ))}
      </div>
      {op && st?.public_key ? (
        <div className="card">
          <h2>{t("statusPage.kluczPub")}</h2>
          <textarea readOnly value={st.public_key} style={{ width: "100%", minHeight: 80 }} />
          <div className="row">
            <button type="button" className="btn" onClick={downloadBundle}>
              {t("op.paczka")}
            </button>
            <Link className="btn" to="/wydruk">
              {t("nav.wydruk")}
            </Link>
          </div>
        </div>
      ) : (
        <Link className="btn" to="/wydruk">
          {t("nav.wydruk")}
        </Link>
      )}
      {user ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            pb.authStore.clear();
            location.href = "/";
          }}
        >
          {t("nav.wyloguj")}
        </button>
      ) : null}
    </div>
  );
}
