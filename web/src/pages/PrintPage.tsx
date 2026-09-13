import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { t } from "../i18n";
import { pb } from "../lib/pb";
import type { Point } from "../types";

export function PrintPage() {
  const [points, setPoints] = useState<Point[]>([]);
  const [qr, setQr] = useState("");
  const when = new Date().toLocaleString("pl-PL");

  useEffect(() => {
    pb.collection("points")
      .getFullList<Point>({
        filter: 'status = "verified" && blocked = false && category != "potrzeba"',
        sort: "category,title",
      })
      .then(setPoints)
      .catch(() => {});
    QRCode.toDataURL(window.location.origin, { margin: 1, width: 180 }).then(setQr);
  }, []);

  return (
    <div className="page">
      <h1>{t("print.tytul")}</h1>
      <p>
        {t("print.data")}: {when}
      </p>
      {qr ? <img src={qr} alt="Kod QR do węzła" width={180} height={180} /> : null}
      <p>{window.location.origin}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #000" }}>Nazwa</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #000" }}>Kategoria</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #000" }}>Adres</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #000" }}>Godziny / aktywacja</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <td style={{ borderBottom: "1px solid #ccc", padding: "6px 4px" }}>{p.title}</td>
              <td style={{ borderBottom: "1px solid #ccc" }}>{t("cat." + p.category)}</td>
              <td style={{ borderBottom: "1px solid #ccc" }}>{p.address}</td>
              <td style={{ borderBottom: "1px solid #ccc" }}>
                {p.hours} {p.activation ? t("activation." + p.activation) : ""} {p.activation_hours ? `(${p.activation_hours} h)` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
