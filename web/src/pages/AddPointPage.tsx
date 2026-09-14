import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapView } from "../components/MapView";
import { t } from "../i18n";
import { uuidv7 } from "../lib/format";
import { currentUser, fetchConfig, isOfflineError, pb, pbErrorMessage } from "../lib/pb";
import { queueAdd } from "../lib/queue";
import {
  CAPABILITY_OPTIONS,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_ON,
  LINK_TYPE_OPTIONS,
  PUBLIC_CATEGORIES,
  SERVICE_OPTIONS,
  type Capability,
  type Category,
  type HostType,
  type LinkType,
  type Service,
} from "../types";
import { CatIcon } from "../components/CategoryBadge";

function toggleIn<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

const DRAFT_KEY = "mk.draft";

type Draft = { lat: number; lon: number; category: Category; title: string; description: string; address: string };

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function AddPointPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const user = currentUser();
  const draft = useMemo(readDraft, []);
  const qLat = Number(params.get("lat"));
  const qLon = Number(params.get("lon"));
  const hasQ = Number.isFinite(qLat) && Number.isFinite(qLon) && qLat !== 0 && qLon !== 0;
  const [gmina, setGmina] = useState("Bytom");
  const [lat, setLat] = useState(hasQ ? qLat : draft?.lat ?? 50.348);
  const [lon, setLon] = useState(hasQ ? qLon : draft?.lon ?? 18.923);
  const [category, setCategory] = useState<Category>(draft?.category || "odpornosc");
  const [photo, setPhoto] = useState<File | null>(null);
  const [title, setTitle] = useState(draft?.title || "");
  const [address, setAddress] = useState(draft?.address || "");
  const [description, setDescription] = useState(draft?.description || "");
  const [consent, setConsent] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
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
  const [linkType, setLinkType] = useState<LinkType[]>(["starlink"]);
  const [more, setMore] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Bez logowania można wypełnić wszystko; konto jest potrzebne dopiero przy zapisie (szkic zostaje).
  useEffect(() => {
    if (draft) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [draft]);

  useEffect(() => {
    fetchConfig()
      .then((c) => setGmina(c.gmina || "Bytom"))
      .catch(() => {});
  }, []);

  const autoTitle = useMemo(() => `${t("cat." + category)} — ${gmina}`, [category, gmina]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!consent) {
      setErr(t("form.wymaganaZgoda"));
      return;
    }
    if (category === "przemysl" && capabilities.length === 0) {
      setErr(t("form.wymaganaZdolnosc"));
      return;
    }
    if (category === "lacznosc" && linkType.length === 0) {
      setErr(t("form.wymaganeLacze"));
      return;
    }
    if (!user) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ lat, lon, category, title, description, address } satisfies Draft));
      } catch {
        /* ignore */
      }
      setMsg(t("form.zalogujPrzyZapisie"));
      nav("/login?next=/dodaj");
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
    if (category === "przemysl") {
      payload.capability = capabilities;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...payload };
      if (photo && category !== "lacznosc") body.photo = photo;
      await pb.collection("points").create(body);
      nav("/moje");
    } catch (ex) {
      if (isOfflineError(ex)) {
        await queueAdd(payload);
        setMsg(photo ? `${t("form.zapisanoTelefon")} ${t("form.zdjecieOffline")}` : t("form.zapisanoTelefon"));
      } else {
        setErr(pbErrorMessage(ex, t("err.ogolny")));
      }
    } finally {
      setSaving(false);
    }
  }

  const showServices = category !== "potrzeba" && category !== "aed" && category !== "przemysl";

  return (
    <div className="map-wrap pick">
      <MapView
        points={[]}
        cats={DEFAULT_CATEGORY_ON}
        services={[]}
        center={hasQ || draft ? [lon, lat] : undefined}
        zoom={hasQ || draft ? 15 : undefined}
        pickMode
        onPick={(a, b) => {
          setLat(Math.round(a * 1e6) / 1e6);
          setLon(Math.round(b * 1e6) / 1e6);
        }}
      />
      <div className="crosshair" />
      <form onSubmit={onSubmit} className="card add-sheet">
        <div className="add-sheet-body">
        <p className="sheet-title">{t("form.punktNaMapie")}</p>
        <p className="hint" style={{ marginTop: 0 }}>
          {autoTitle} · {lat.toFixed(4)}, {lon.toFixed(4)}
        </p>
        {category === "lacznosc" ? <p className="note">{t("form.lacznoscOstrzezenie")}</p> : null}
        {category === "potrzeba" ? <p className="note">{t("form.potrzebaOstrzezenie")}</p> : null}
        {category === "schron" ? <p className="note info">{t("form.schronHint")}</p> : null}
        {category === "przemysl" ? <p className="note info">{t("form.przemyslHint")}</p> : null}

        <div className="cat-grid">
          {PUBLIC_CATEGORIES.concat(["potrzeba"]).map((c) => (
            <button
              key={c}
              type="button"
              className={`cat-pick ${category === c ? "on" : ""}`}
              aria-pressed={category === c}
              style={
                category === c
                  ? { background: CATEGORY_COLORS[c], color: c === "prad" ? "#0f2744" : "#fff", borderColor: CATEGORY_COLORS[c] }
                  : { borderColor: CATEGORY_COLORS[c], color: CATEGORY_COLORS[c] }
              }
              onClick={() => setCategory(c)}
            >
              <CatIcon category={c} size={22} />
              {t("cat." + c)}
            </button>
          ))}
        </div>

        {category === "przemysl" ? (
          <div className="chips wrap" role="group" aria-label={t("form.capability")}>
            {CAPABILITY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${capabilities.includes(c) ? "on" : ""}`}
                style={capabilities.includes(c) ? { background: CATEGORY_COLORS.przemysl, color: "#fff" } : {}}
                onClick={() => setCapabilities((a) => toggleIn(a, c))}
              >
                {t("cap." + c)}
              </button>
            ))}
          </div>
        ) : null}

        {category === "lacznosc" ? (
          <div className="chips wrap" role="group" aria-label={t("form.linkType")}>
            {LINK_TYPE_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${linkType.includes(c) ? "on" : ""}`}
                style={linkType.includes(c) ? { background: CATEGORY_COLORS.lacznosc, color: "#fff" } : {}}
                onClick={() => setLinkType((a) => toggleIn(a, c))}
              >
                {t("link." + c)}
              </button>
            ))}
          </div>
        ) : null}

        {category === "potrzeba" ? (
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
            <div className="row">
              <label className="field grow">
                <span>{t("form.people")}</span>
                <input type="number" min={1} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
              </label>
              <label className="field grow">
                <span>{t("form.urgency")}</span>
                <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                  {["niska", "srednia", "wysoka"].map((u) => (
                    <option key={u} value={u}>
                      {t("need." + u)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}

        {showServices ? (
          <div className="chips wrap" role="group" aria-label={t("form.uslugi")}>
            {SERVICE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${services.includes(s) ? "on" : ""}`}
                style={services.includes(s) ? { background: "#1a1714", color: "#fff" } : {}}
                onClick={() => setServices((a) => toggleIn(a, s))}
              >
                {t("svc." + s)}
              </button>
            ))}
          </div>
        ) : null}

        <label className="field">
          <span>{t("form.nazwaOpcjonalna")}</span>
          <input value={title} placeholder={autoTitle} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </label>
        {category !== "lacznosc" ? (
          <label className="field">
            <span>{t("form.zdjecie")}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          </label>
        ) : null}

        <button type="button" className="btn ghost" onClick={() => setMore(!more)}>
          {more ? t("form.mniej") : t("form.wiecej")}
        </button>
        {more ? (
          <>
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
              <span>{t("form.opis")}</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            </label>
            {category !== "potrzeba" ? (
              <>
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
            ) : null}
          </>
        ) : null}
        </div>
        <div className="add-sheet-foot">
        <label className="check" style={{ margin: "0 0 10px" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            {t("form.zgodaKrotka")}{" "}
            <Link to="/prywatnosc">{t("nav.prywatnosc")}</Link>
          </span>
        </label>
        {err ? <p className="note">{err}</p> : null}
        {msg ? <p className="note info">{msg}</p> : null}
        <button className="btn primary block" type="submit" style={{ minHeight: 52 }} disabled={saving}>
          {t("form.zapisz")}
        </button>
        </div>
      </form>
    </div>
  );
}
