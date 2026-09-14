import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { t } from "../i18n";
import { currentUser, fetchConfig, pb } from "../lib/pb";

export function ReportPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [reason, setReason] = useState("nie_istnieje");
  const [text, setText] = useState("");
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await pb.collection("reports").create({
      point_id: id,
      reason,
      text,
      created_by: currentUser()?.id || undefined,
    });
    setOk(true);
    setTimeout(() => nav("/"), 1200);
  }

  return (
    <div className="page">
      <h1>{t("map.zglosBlad")}</h1>
      {ok ? <p className="note info">{t("report.dzieki")}</p> : null}
      <form onSubmit={onSubmit} className="card">
        <label className="field">
          <span>{t("report.powod")}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {["nie_istnieje", "zamkniete", "zly_adres", "inne"].map((r) => (
              <option key={r} value={r}>
                {t("report." + r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("report.tekst")}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        </label>
        <button className="btn primary block" type="submit">
          {t("report.wyslij")}
        </button>
      </form>
    </div>
  );
}

export function NodesPage() {
  const nav = useNavigate();
  const user = currentUser();
  const [role, setRole] = useState("");
  const [peers, setPeers] = useState<{ id: string; node_id: string; trusted: boolean; public_key: string; note: string; base_url: string }[]>([]);
  const [key, setKey] = useState("");
  const [newId, setNewId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [msg, setMsg] = useState("");

  async function addPeer(e: FormEvent) {
    e.preventDefault();
    const node_id = newId.trim().toLowerCase();
    const base_url = newUrl.trim().replace(/\/$/, "");
    if (!/^[a-z0-9-]{2,40}$/.test(node_id) || !/^https?:\/\//.test(base_url)) return;
    await pb.collection("peers").create({ node_id, base_url, trusted: false, role: "node", note: "dodany ręcznie" });
    setNewId("");
    setNewUrl("");
    setMsg(t("op.dodano"));
    setPeers(await pb.collection("peers").getFullList());
  }

  useEffect(() => {
    fetchConfig().then((c) => setRole(c.role));
    if (!user || (user.role !== "admin" && user.role !== "operator")) nav("/login?next=/operator/wezly");
    pb.collection("peers")
      .getFullList<{ id: string; node_id: string; trusted: boolean; public_key: string; note: string; base_url: string }>()
      .then(setPeers)
      .catch(() => {});
  }, []);

  async function trust(id: string, trusted: boolean, public_key?: string) {
    await pb.collection("peers").update(id, { trusted, public_key: public_key || undefined });
    const list = await pb.collection("peers").getFullList<{ id: string; node_id: string; trusted: boolean; public_key: string; note: string; base_url: string }>();
    setPeers(list);
  }

  async function saveKey(e: FormEvent, id: string) {
    e.preventDefault();
    await trust(id, true, key);
    setKey("");
  }

  return (
    <div className="page">
      <h1>{t("op.wezly")}</h1>
      <p className="hint">{t("op.meshOpis")}</p>
      <form onSubmit={addPeer} className="card">
        <h2>{t("op.dodajWezel")}</h2>
        <label className="field">
          <span>{t("op.nodeId")}</span>
          <input value={newId} onChange={(e) => setNewId(e.target.value)} pattern="[a-z0-9-]{2,40}" required />
        </label>
        <label className="field">
          <span>{t("op.adresWezla")}</span>
          <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} type="url" required />
        </label>
        <button type="submit" className="btn primary">
          {t("op.dodajWezel")}
        </button>
        {msg ? <p className="note info">{msg}</p> : null}
      </form>
      {peers.map((p) => (
        <article key={p.id} className="card">
          <h2>{p.node_id}</h2>
          <p>{p.base_url}</p>
          <p>{p.note}</p>
          <textarea readOnly value={p.public_key} style={{ width: "100%", minHeight: 60 }} />
          <form onSubmit={(e) => saveKey(e, p.id)}>
            <label className="field">
              <span>{t("op.klucz")}</span>
              <textarea value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            <div className="row">
              <button type="submit" className="btn ok">
                {t("op.zaufaj")}
              </button>
              <button type="button" className="btn warn" onClick={() => trust(p.id, false)}>
                {t("op.cofnijZaufanie")}
              </button>
            </div>
          </form>
          <p>{p.trusted ? "zaufany" : "czeka na zaufanie"}</p>
        </article>
      ))}
    </div>
  );
}

export function CertPage() {
  return (
    <div className="page">
      <h1>{t("cert.tytul")}</h1>
      <div className="card">
        <p>{t("cert.android")}</p>
        <p>{t("cert.ios")}</p>
        <p>
          <a href="/ca.crt">/ca.crt</a>
        </p>
      </div>
    </div>
  );
}
