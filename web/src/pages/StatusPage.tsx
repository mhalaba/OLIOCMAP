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
  const [tiles, setTiles] = useState<{
    files: { name: string; bytes: number }[];
    job: { state: string; error?: string; bytes?: number; preset?: string };
  } | null>(null);
  const [aed, setAed] = useState<{ state: string; total: number; done: number; skipped: number; error: string } | null>(null);
  const [msg, setMsg] = useState("");

  async function refreshOps() {
    if (!op) return;
    const h = { Authorization: pb.authStore.token };
    try {
      const t = await fetch("/sync/v1/tiles/status", { headers: h }).then((r) => r.json());
      setTiles(t);
    } catch {
      setTiles(null);
    }
    try {
      const a = await fetch("/sync/v1/aed/status", { headers: h }).then((r) => r.json());
      setAed(a);
    } catch {
      setAed(null);
    }
  }

  useEffect(() => {
    fetchStatus().then(setSt).catch(() => {});
    refreshOps();
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => {
        const used = Math.round((e.usage || 0) / 1048576);
        const quota = Math.round((e.quota || 0) / 1048576);
        setStorage(`${used} / ${quota} MB`);
      });
    }
    const id = setInterval(refreshOps, 2500);
    return () => clearInterval(id);
  }, [op]);

  async function startTiles(preset: string) {
    setMsg("");
    const res = await fetch("/sync/v1/tiles/download", {
      method: "POST",
      headers: { Authorization: pb.authStore.token, "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    if (!res.ok) setMsg(t("err.siec"));
    await refreshOps();
  }

  async function uploadTiles(file: File) {
    setMsg("");
    const res = await fetch("/sync/v1/tiles/upload", {
      method: "POST",
      headers: { Authorization: pb.authStore.token, "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!res.ok) setMsg(t("tiles.bladWgrania"));
    else setMsg(t("tiles.wgrano"));
    await refreshOps();
  }

  async function startAed(source: string) {
    setMsg("");
    const res = await fetch("/sync/v1/aed/import", {
      method: "POST",
      headers: { Authorization: pb.authStore.token, "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    if (!res.ok) setMsg(t("err.siec"));
    await refreshOps();
  }

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
      {msg ? <p className="note info">{msg}</p> : null}
      {op ? (
        <div className="card">
          <h2>{t("tiles.tytul")}</h2>
          <p>{t("tiles.opis")}</p>
          {(tiles?.files || []).length ? (
            <ul className="count-list">
              {tiles!.files.map((f) => (
                <li key={f.name}>
                  <span>{f.name}</span>
                  <strong>{Math.max(1, Math.round(f.bytes / 1048576))} MB</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("tiles.brak")}</p>
          )}
          {tiles?.job?.state === "running" ? <p>{t("tiles.trwa")}</p> : null}
          {tiles?.job?.state === "ok" && tiles.job.bytes ? <p className="note info">{t("tiles.gotowe")}</p> : null}
          {tiles?.job?.error ? <p className="note">{tiles.job.error}</p> : null}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn primary" disabled={tiles?.job?.state === "running"} onClick={() => startTiles("gmina")}>
              {t("tiles.gmina")}
            </button>
            <button type="button" className="btn" disabled={tiles?.job?.state === "running"} onClick={() => startTiles("wojewodztwo")}>
              {t("tiles.wojewodztwo")}
            </button>
            <button type="button" className="btn" disabled={tiles?.job?.state === "running"} onClick={() => startTiles("polska")}>
              {t("tiles.polska")}
            </button>
          </div>
          <p className="hint">{t("tiles.uwagaPolska")}</p>
          <label className="btn" style={{ display: "inline-flex", alignItems: "center", marginTop: 8 }}>
            {t("tiles.wgraj")}
            <input
              type="file"
              accept=".pmtiles,application/octet-stream"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadTiles(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}
      {op ? (
        <div className="card">
          <h2>{t("aed.tytul")}</h2>
          <p>{t("aed.opis")}</p>
          {aed ? (
            <p>
              {t("aed.postep")}: {aed.done} / {aed.total} ({t("aed.pominieto")} {aed.skipped}) — {t("aed.stan." + aed.state)}
            </p>
          ) : null}
          {aed?.error ? <p className="note">{aed.error}</p> : null}
          <div className="row">
            <button type="button" className="btn" disabled={aed?.state === "running"} onClick={() => startAed("bundled")}>
              {t("aed.paczka")}
            </button>
            <button type="button" className="btn" disabled={aed?.state === "running"} onClick={() => startAed("fetch")}>
              {t("aed.internet")}
            </button>
          </div>
        </div>
      ) : null}
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
