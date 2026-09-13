#!/usr/bin/env bash
set -euo pipefail
# down-central | up-central | clock-skew <node> <+/-minutes> | fill-queue <n>
cmd="${1:-}"
name_match="${CENTRAL_CADDY_MATCH:-central-caddy}"
cid="$(docker ps -qf "name=${name_match}" | head -n1)"
if [[ -z "${cid}" ]] && [[ "${cmd}" == down-central || "${cmd}" == up-central ]]; then
  echo "nie znaleziono kontenera ${name_match}" >&2
  exit 1
fi
net="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$cid" 2>/dev/null | awk '{print $1}')"
case "$cmd" in
  down-central)
    docker network disconnect "$net" "$cid" || true
    echo "centrala odłączona od $net"
    ;;
  up-central)
    docker network connect "$net" "$cid" || true
    echo "centrala podłączona do $net"
    ;;
  clock-skew)
    node="${2:-sync-worker}"
    mins="${3:-+15}"
    echo "clock-skew $node $mins — ustaw czas na hoście/RTC; w kontenerze: date -s"
    ;;
  fill-queue)
    echo "fill-queue: użyj testów integracyjnych"
    ;;
  *)
    echo "użycie: chaos.sh down-central|up-central|clock-skew|fill-queue" >&2
    exit 1
    ;;
esac
