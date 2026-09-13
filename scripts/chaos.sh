#!/usr/bin/env bash
set -euo pipefail
# down-central | up-central | clock-skew <node> <+/-minutes> | fill-queue <n>
# Szuka kontenerów po nazwie (compose dodaje prefiks projektu).
# Sieć bierzemy z węzła pocketbase — po disconnect central-caddy nie ma sieci.

cmd="${1:-}"

find_cid() {
  local pattern="$1"
  local exclude="${2:-}"
  docker ps --format '{{.ID}} {{.Names}}' | awk -v p="$pattern" -v x="$exclude" '
    $2 ~ p && (x == "" || $2 !~ x) { print $1; exit }
  '
}

network_of() {
  docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1" 2>/dev/null | awk '{print $1}'
}

compose_net() {
  local anchor
  anchor="$(find_cid "pocketbase" "central")"
  if [[ -z "${anchor}" ]]; then
    echo "nie znaleziono kontenera pocketbase (węzeł)" >&2
    return 1
  fi
  local net
  net="$(network_of "$anchor")"
  if [[ -z "${net}" ]]; then
    echo "nie znaleziono sieci compose" >&2
    return 1
  fi
  echo "$net"
}

case "$cmd" in
  down-central)
    cid="$(find_cid "central-caddy")"
    if [[ -z "${cid}" ]]; then
      echo "nie znaleziono kontenera central-caddy" >&2
      exit 1
    fi
    net="$(compose_net)"
    docker network disconnect "$net" "$cid" || true
    echo "centrala odłączona od $net"
    ;;
  up-central)
    cid="$(find_cid "central-caddy")"
    if [[ -z "${cid}" ]]; then
      echo "nie znaleziono kontenera central-caddy" >&2
      exit 1
    fi
    net="$(compose_net)"
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
