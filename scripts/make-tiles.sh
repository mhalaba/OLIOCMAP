#!/usr/bin/env bash
# Pobiera wycinek Protomaps do ./tiles (wymaga internetu przy budowie kafelków, nie w runtime mapy).
# Cała Polska z14 = kilka GB. Dla OSP: bbox gminy, maxzoom 14 — dziesiątki MB.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BBOX="${TILES_BBOX:-${BBOX:-18.82,50.30,18.98,50.42}}"
MAXZOOM="${TILES_MAXZOOM:-${MAXZOOM:-14}}"
OUT="${OUT:-tiles/poland.pmtiles}"
mkdir -p tiles

resolve_source() {
  if command -v node >/dev/null 2>&1; then
    PMTILES_SOURCE="${PMTILES_SOURCE:-auto}" node --input-type=module -e \
      'import { resolvePmtilesSource } from "./shared/pmtiles_source.mjs"; process.stdout.write(await resolvePmtilesSource({ configured: process.env.PMTILES_SOURCE || "auto" }));'
    return
  fi
  local url=""
  if [[ -n "${PMTILES_SOURCE:-}" && "${PMTILES_SOURCE}" != "auto" ]]; then
    if curl -fsI -A "MapaKryzysowa/1.0" "${PMTILES_SOURCE}" >/dev/null; then
      echo "${PMTILES_SOURCE}"
      return
    fi
  fi
  local i d
  for i in $(seq 0 7); do
    if date -u -d "-${i} day" +%Y%m%d >/dev/null 2>&1; then
      d=$(date -u -d "-${i} day" +%Y%m%d)
    else
      d=$(date -u -v-"${i}"d +%Y%m%d)
    fi
    url="https://build.protomaps.com/${d}.pmtiles"
    if curl -fsI -A "MapaKryzysowa/1.0" "${url}" >/dev/null; then
      echo "${url}"
      return
    fi
  done
  echo "https://data.source.coop/protomaps/openstreetmap/v4.pmtiles"
}

BUILD_URL="$(resolve_source)"
echo "Źródło: ${BUILD_URL}"

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "Brak polecenia pmtiles. Na węźle użyj przycisku „Pobierz gminę” na /status"
  echo "albo: docker compose exec sync-worker pmtiles extract ..."
  echo "Ręcznie: https://docs.protomaps.com/pmtiles/cli"
  echo "  pmtiles extract ${BUILD_URL} ${OUT} --bbox=${BBOX} --maxzoom=${MAXZOOM}"
else
  echo "Pobieranie wycinka ${BBOX} z${MAXZOOM} → ${OUT}"
  pmtiles extract "${BUILD_URL}" "${OUT}" --bbox="${BBOX}" --maxzoom="${MAXZOOM}"
fi

python3 - <<'PY'
import json, pathlib
p = pathlib.Path("tiles")
files = sorted([f.name for f in p.glob("*.pmtiles")])
(p / "index.json").write_text(json.dumps({"files": files}, indent=2), encoding="utf-8")
print("index.json:", files)
PY
echo "Atrybucja: © OpenStreetMap, Protomaps."
echo "Odśwież mapę w przeglądarce."
