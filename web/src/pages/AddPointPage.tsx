import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapView } from "../components/MapView";
import { t } from "../i18n";
import { uuidv7 } from "../lib/format";
import { currentUser, fetchConfig, pb } from "../lib/pb";
import { queueAdd } from "../lib/queue";
import { CATEGORY_COLORS, DEFAULT_CATEGORY_ON, PUBLIC_CATEGORIES, type Category, type HostType, type Service } from "../types";

const SERVICES: Service[] = [
  "ladowanie",
  "ogrzewanie",
  "woda",
  "internet",
  "posilek",
  "nocleg",
  "pierwsza_pomoc",
  "toaleta",
  "informacja",
  "zwierzeta",
];

export function AddPointPage() {
  const nav = useNavigate();
  const user = currentUser();
  const [gmina, setGmina] = useState("Bytom");
  const [lat, setLat] = useState(50.348);
  const [lon, setLon] = useState(18.923);
  const [category, setCategory] = useState<Category>("aed");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [host, setHost] = useState<HostType>("osp");
  const [activation, setActivation] = useState("stale");
  const [activationHours, setActivationHours] = useState(24);
  const [autonomy, setAutonomy] = useState<number | "">("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [hours, setHours] = useState("");
  const [contact, setContact] = useState("");
  const [needType, setNeedType] = useState("woda");
  const [people, setPeople] = useState(1);
  const [urgency, setUrgency] = useState("srednia");
  const [linkType, setLinkType] = useState<string[]>(["starlink"]);
  const [more, setMore] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) nav("/login?next=/dodaj");
  }, [user, nav]);

  useEffect(() => {
    fetchConfig()
      .then((c) => setGmina(c.gmina || "Bytom"))
      .catch(() => {});
  }, []);

  const autoTitle = useMemo(() => `${t("cat." + category)} — ${gmina}`, [category, gmina]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!consent) {
      setErr(t("form.wymaganaZgoda"));
      return;
    }
    const payload: Record<string, unknown> = {
      id: uuidv7(),
      category,
      title: (title || autoTitle).slice(0, 80),
      description,
      lat,
      lon,
      address,
      consent: true,
      civilians_ok: true,
      host_type: host,
      services,
      hours,
      contact_public: contact,
      activation,
      activation_hours: activation === "po_godzinach_bez_pradu" ? activationHours : 0,
      autonomy_h: autonomy === "" ? 0 : autonomy,
      capacity: capacity === "" ? 0 : capacity,
    };
    if (category === "potrzeba") {
      payload.need_type = needType;
      payload.people = people;
      payload.urgency = urgency;
      payload.public_geom = "hidden";
    }
    if (category === "lacznosc") {
      payload.link_type = linkType;
      payload.public_geom = "gmina";
    }
    try {
      await pb.collection("points").create(payload);
      nav("/moje");
    } catch {
      await queueAdd(payload);
      setMsg(t("form.zapisanoTelefon"));
    }
  }

  return (
    <div className="map-wrap">
      <MapView
        points={[]}
        cats={DEFAULT_CATEGORY_ON}
        services={[]}
        pickMode
        onPick={(a, b) => {
          setLat(Math.round(a * 1e6) / 1e6);
          setLon(Math.round(b * 1e6) / 1e6);
        }}
      />
      <div className="crosshair" />
      <form
        onSubmit={onSubmit}
        className="card"
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 72,
          zIndex: 7,
          maxHeight: "58vh",
          overflow: "auto",
          margin: 0,
        }}
      >
        <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{t("form.dotknijMapy")}</p>
        {category === "lacznosc" ? <p className="note">{t("form.lacznoscOstrzezenie")}</p> : null}
        {category === "potrzeba" ? <p className="note">{t("form.potrzebaOstrzezenie")}</p> : null}
        {category === "schron" ? <p className="note info">{t("form.schronHint")}</p> : null}

        <div className="cat-grid">
          {PUBLIC_CATEGORIES.concat(["potrzeba"]).map((c) => (
            <button
              key={c}
              type="button"
              className={`cat-pick ${category === c ? "on" : ""}`}
              aria-pressed={category === c}
              style={
                category === c
                  ? { background: CATEGORY_COLORS[c], color: c === "prad" ? "#1a1714" : "#fff", borderColor: CATEGORY_COLORS[c] }
                  : { borderColor: CATEGORY_COLORS[c], color: CATEGORY_COLORS[c] }
              }
              onClick={() => setCategory(c)}
            >
              {t("cat." + c)}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <label className="field grow">
            <span>{t("form.lat")}</span>
            <input type="number" step="0.000001" value={lat} onChange={(e) => setLat(Number(e.target.value))} />
          </label>
          <label className="field grow">
            <span>{t("form.lon")}</span>
            <input type="number" step="0.000001" value={lon} onChange={(e) => setLon(Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>{t("form.adres")}</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("form.tytul")}</span>
          <input value={title} placeholder={autoTitle} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </label>

        <button type="button" className="btn ghost" onClick={() => setMore(!more)}>
          {more ? t("form.mniej") : t("form.wiecej")}
        </button>
        {more ? (
          <>
            <label className="field">
              <span>{t("form.opis")}</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            </label>
            {category !== "potrzeba" ? (
              <>
                <div className="chips">
                  {SERVICES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`chip ${services.includes(s) ? "on" : ""}`}
                      style={services.includes(s) ? { background: "#1a1714", color: "#fff" } : {}}
                      onClick={() => setServices((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]))}
                    >
                      {t("svc." + s)}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>{t("form.gospodarz")}</span>
                  <select value={host} onChange={(e) => setHost(e.target.value as HostType)}>
                    {["osp", "gmina", "szkola", "parafia", "firma", "prywatny", "inny"].map((h) => (
                      <option key={h} value={h}>
                        {t("host." + h)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("form.aktywacja")}</span>
                  <select value={activation} onChange={(e) => setActivation(e.target.value)}>
                    <option value="stale">{t("activation.stale")}</option>
                    <option value="po_alarmie">{t("activation.po_alarmie")}</option>
                    <option value="po_godzinach_bez_pradu">{t("activation.po_godzinach_bez_pradu")}</option>
                  </select>
                </label>
                {activation === "po_godzinach_bez_pradu" ? (
                  <label className="field">
                    <span>{t("form.godzinyBezPradu")}</span>
                    <input type="number" value={activationHours} onChange={(e) => setActivationHours(Number(e.target.value))} />
                  </label>
                ) : null}
                <label className="field">
                  <span>{t("form.autonomia")}</span>
                  <input type="number" value={autonomy} onChange={(e) => setAutonomy(e.target.value === "" ? "" : Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t("form.pojemnosc")}</span>
                  <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t("form.godziny")}</span>
                  <input value={hours} onChange={(e) => setHours(e.target.value)} />
                </label>
                <label className="field">
                  <span>{t("form.kontakt")}</span>
                  <input value={contact} onChange={(e) => setContact(e.target.value)} />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>{t("form.needType")}</span>
                  <select value={needType} onChange={(e) => setNeedType(e.target.value)}>
                    {["woda", "zywnosc", "leki", "prad", "ewakuacja", "opieka", "inne"].map((n) => (
                      <option key={n} value={n}>
                        {t("need." + n)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("form.people")}</span>
                  <input type="number" value={people} onChange={(e) => setPeople(Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t("form.urgency")}</span>
                  <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                    {["niska", "srednia", "wysoka"].map((u) => (
                      <option key={u} value={u}>
                        {t("need." + u)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </>
        ) : null}

        <label className="check" style={{ margin: "12px 0" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t("form.zgoda")}</span>
        </label>
        {err ? <p className="note">{err}</p> : null}
        {msg ? <p className="note info">{msg}</p> : null}
        <button className="btn primary block" type="submit" style={{ minHeight: 52 }} disabled={!consent}>
          {t("form.zapisz")}
        </button>
        {!consent ? <p className="hint">{t("form.wymaganaZgoda")}</p> : null}
      </form>
    </div>
  );
}
