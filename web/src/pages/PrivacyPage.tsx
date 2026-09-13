import { useEffect, useState } from "react";
import { t } from "../i18n";
import { fetchConfig } from "../lib/pb";

export function PrivacyPage() {
  const [name, setName] = useState("");
  useEffect(() => {
    fetchConfig()
      .then((c) => setName(c.operator_name || c.node_name || ""))
      .catch(() => {});
  }, []);
  return (
    <div className="page">
      <h1>{t("privacy.tytul")}</h1>
      <div className="card">
        <p>
          {t("privacy.admin")}: <strong>{name}</strong>
        </p>
        <p>{t("privacy.cel")}</p>
        <p>{t("privacy.retencja")}</p>
        <p>{t("privacy.prawa")}</p>
      </div>
    </div>
  );
}
