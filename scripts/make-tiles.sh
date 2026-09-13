#!/usr/bin/env bash
# Pobiera wycinek Protomaps (wymaga internetu przy budowie kafelków, nie w runtime).
# Cała Polska z14 = kilka GB. Dla OSP: bbox powiatu, maxzoom 14–15, dziesiątki MB.
set -euo pipefail
BBOX="${BBOX:-16.8,49.9,19.3,50.6}" # Śląsk (przybliżenie)
MAXZOOM="${MAXZOOM:-12}"
OUT="${OUT:-tiles/poland.pmtiles}"
BUILD_URL="${BUILD_URL:-https://build.protomaps.com/}"
echo "Dokumentacja: https://docs.protomaps.com/"
echo "Przykład (gdy masz CLI pmtiles):"
echo "  pmtiles extract <daily.pmtiles> ${OUT} --bbox=${BBOX} --maxzoom=${MAXZOOM}"
echo "Rozmiary orientacyjne: Polska z14 — kilka GB; powiat z15 — dziesiątki MB."
echo "Wgraj wynik do ./tiles i zaktualizuj tiles/index.json:"
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("tiles")
files = sorted([f.name for f in p.glob("*.pmtiles")])
(p / "index.json").write_text(json.dumps({"files": files}, indent=2), encoding="utf-8")
print("index.json:", files)
PY
echo "Atrybucja: © OpenStreetMap, Protomaps."
