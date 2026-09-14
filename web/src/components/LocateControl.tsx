import { t } from "../i18n";

export function LocateControl({
  locating,
  autoEnabled,
  onLocate,
  onAutoChange,
}: {
  locating: boolean;
  autoEnabled: boolean;
  onLocate: () => void;
  onAutoChange: (on: boolean) => void;
}) {
  return (
    <div className="oc-locate-stack">
      <button
        type="button"
        className={`oc-locate-btn${locating ? " is-busy" : ""}`}
        aria-label={t("map.mojaLokalizacja")}
        title={t("map.mojaLokalizacja")}
        aria-busy={locating}
        disabled={locating}
        onClick={onLocate}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <label className={`oc-auto-locate${autoEnabled ? " on" : ""}`}>
        <input type="checkbox" checked={autoEnabled} onChange={(e) => onAutoChange(e.target.checked)} />
        {t("map.automatycznaLokalizacja")}
      </label>
    </div>
  );
}
