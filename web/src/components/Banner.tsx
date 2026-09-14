import { t } from "../i18n";
import { formatSyncAgo } from "../lib/format";
import type { NodeStatus } from "../types";

export function Banner({ status, httpsNote }: { status: NodeStatus | null; httpsNote: boolean }) {
  const island = !status || status.mode === "wyspa";
  const last = status?.last_push || status?.last_pull || "";
  return (
    <div className={`banner ${island ? "" : "sync"}`} role="status">
      <span>{island ? t("banner.wyspa") : t("banner.sync")}</span>
      <span className="sub">
        {t("banner.ostatnia")}: {last ? formatSyncAgo(last) : t("banner.nigdy")}
      </span>
      {httpsNote ? <span className="sub">{t("banner.offlineHttps")}</span> : null}
    </div>
  );
}
