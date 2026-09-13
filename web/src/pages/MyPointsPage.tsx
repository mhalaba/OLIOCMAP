import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { currentUser, pb } from "../lib/pb";
import { queueAll, queueRemove, type QueuedItem } from "../lib/queue";
import type { Point } from "../types";

export function MyPointsPage() {
  const nav = useNavigate();
  const user = currentUser();
  const [items, setItems] = useState<Point[]>([]);
  const [queued, setQueued] = useState<QueuedItem[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    if (!user) return;
    const res = await pb.collection("points").getFullList<Point>({
      filter: `created_by = "${user.id}"`,
      sort: "-updated_at",
    });
    setItems(res);
    setQueued(await queueAll());
  }

  useEffect(() => {
    if (!user) {
      nav("/login?next=/moje");
      return;
    }
    load().catch(() => {});
  }, [user, nav]);

  async function sendQueue() {
    const all = await queueAll();
    for (const q of all) {
      try {
        await pb.collection("points").create(q.payload);
        await queueRemove(q.id);
      } catch {
        setMsg(t("err.siec"));
        return;
      }
    }
    setMsg("");
    await load();
  }

  async function withdraw(id: string) {
    await pb.collection("points").update(id, { title: "Wycofane", description: "" });
    await load();
  }

  return (
    <div className="page">
      <h1>{t("nav.moje")}</h1>
      {queued.length ? (
        <div className="note">
          {t("form.zapisanoTelefon")} ({queued.length})
          <button type="button" className="btn primary" style={{ marginLeft: 8 }} onClick={sendQueue}>
            {t("form.wyslijTeraz")}
          </button>
        </div>
      ) : null}
      {msg ? <p className="note">{msg}</p> : null}
      {!items.length ? <p>{t("empty.moje")}</p> : null}
      {items.map((p) => (
        <article key={p.id} className="card">
          <h2>{p.title}</h2>
          <p>
            {t("cat." + p.category)} · {t("status." + p.status)}
            {p.conflict ? ` · ${t("status.conflict")}` : ""}
          </p>
          {p.status === "pending" ? (
            <div className="row">
              <button type="button" className="btn" onClick={() => withdraw(p.id)}>
                {t("form.wycofaj")}
              </button>
            </div>
          ) : null}
        </article>
      ))}
      <p className="footer-node">
        <Link to="/status">{t("nav.status")}</Link>
      </p>
    </div>
  );
}
