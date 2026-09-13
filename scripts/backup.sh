#!/usr/bin/env bash
set -euo pipefail
# Kopia zapasowa PocketBase przez API (superuser). Zachowaj 7 dziennych.
DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$DIR"
BASE="${PB_URL:-http://127.0.0.1}"
EMAIL="${PB_SUPERUSER_EMAIL:-admin@node.local}"
PASS="${PB_SUPERUSER_PASSWORD:-change-me}"
TOKEN="$(curl -sS -X POST "$BASE/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')"
if [[ -z "$TOKEN" ]]; then
  echo "nie udało się zalogować superusera" >&2
  exit 1
fi
curl -sS -X POST "$BASE/api/backups" -H "Authorization: $TOKEN" || true
sleep 2
NAME="$(curl -sS "$BASE/api/backups" -H "Authorization: $TOKEN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d[0]["key"] if d else ""))')"
if [[ -n "$NAME" ]]; then
  curl -sS "$BASE/api/backups/${NAME}" -H "Authorization: $TOKEN" -o "$DIR/$(date +%F)-pb.zip"
fi
ls -1t "$DIR"/*.zip 2>/dev/null | tail -n +8 | xargs -r rm --
echo "kopie w $DIR — skopiuj na USB."
