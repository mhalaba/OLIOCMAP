import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { MapView } from "../components/MapView";
import { CatIcon } from "../components/CategoryBadge";
import { t } from "../i18n";
import { fetchConfig, pb } from "../lib/pb";
import { PUBLIC_CATEGORIES, type Point } from "../types";

/**
 * Wydruk A4: mapa gminy z punktami, QR do węzła, legenda i wykaz.
 * Dla tych, którzy nie zainstalują PWA: remiza, sklep, tablica parafialna.
 */
export function PrintPage() {
  const [points, setPoints] = useState<Point[]>([]);
  const [qr, setQr] = useState("");
  const [gmina, setGmina] = useState("");
  const when = new Date().toLocaleString("pl-PL");
  const cats = useMemo(() => Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c, true])), []);

  useEffect(() => {
    pb.collection("points")
      .getFullList<Point>({
        filter: 'status = "verified" && blocked = false && category != "potrzeba"',
        sort: "category,title",
      })
      .then(setPoints)
      .catch(() => {});
    fetchConfig()
      .then((c) => setGmina(c.gmina || ""))
      .catch(() => {});
    QRCode.toDataURL(window.location.origin, { margin: 1, width: 180 }).then(setQr);
  }, []);

  const center = useMemo<[number, number] | undefined>(() => {
    const xs = points.map((p) => p.public_lon ?? p.lon).filter((v): v is number => typeof v === "number" && v !== 0);
    const ys = points.map((p) => p.public_lat ?? p.lat).filter((v): v is number => typeof v === "number" && v !== 0);
    if (!xs.length) return undefined;
    return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
  }, [points]);

  return (
    <div className="page">
      <div className="print-head">
        <div>
          <h1 style={{ margin: 0 }}>
            {t("print.mapa")}
            {gmina ? ` — ${gmina}` : ""}
          </h1>
          <p style={{ margin: "4px 0" }}>
            {t("print.data")}: {when}
          </p>
          <p className="hint" style={{ margin: 0 }}>{t("print.wywies")}</p>
          <p className="no-print" style={{ margin: "8px 0 0" }}>
            <button type="button" className="btn primary" onClick={() => window.print()}>
              {t("print.drukuj")}
            </button>
          </p>
        </div>
        <div style={{ textAlign: "center", fontSize: 11 }}>
          {qr ? <img src={qr} alt="Kod QR do węzła" width={120} height={120} /> : null}
          <div>{window.location.origin}</div>
          <div style={{ maxWidth: 140 }}>{t("print.qrOpis")}</div>
        </div>
      </div>
      <div className="print-map">
        <MapView key={points.length ? "pts" : "empty"} points={points} cats={cats} services={[]} preserveDrawingBuffer center={center} zoom={13} />
      </div>
      <div className="print-legend">
        {PUBLIC_CATEGORIES.map((c) => (
          <span key={c}>
            <CatIcon category={c} size={18} />
            {t(`cat.${c}`)}
          </span>
        ))}
      </div>
      <h2 style={{ fontSize: 15, margin: "10px 0 4px" }}>{t("print.punkty")}</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th>Kategoria</th>
            <th>Adres</th>
            <th>Godziny / aktywacja</th>
            <th>{t("map.potwierdzil")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{t("cat." + p.category)}</td>
              <td>{p.address}</td>
              <td>
                {p.hours} {p.activation ? t("activation." + p.activation) : ""} {p.activation_hours ? `(${p.activation_hours} h)` : ""}
              </td>
              <td>{p.confirmed_by_name || p.verified_by_name || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
