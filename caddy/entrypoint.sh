#!/bin/sh
set -e
mode="${TLS_MODE:-off}"
case "$mode" in
  internal) cp /tpl/Caddyfile.internal /etc/caddy/Caddyfile ;;
  file) cp /tpl/Caddyfile.file /etc/caddy/Caddyfile ;;
  *) cp /tpl/Caddyfile.off /etc/caddy/Caddyfile ;;
esac
# Portal powitalny. Telefony sprawdzają dostęp do internetu, pobierając ustalone adresy.
# Gdy odpowiemy przekierowaniem zamiast oczekiwanej treści, system sam pokaże okno z mapą.
# Wymaga, żeby te nazwy rozwiązywały się na węzeł — patrz scripts/hotspot.sh.
: > /etc/caddy/portal.conf
if [ -n "${PORTAL_URL:-}" ]; then
  cat > /etc/caddy/portal.conf <<EOF
@portal_probe path /generate_204 /gen_204 /hotspot-detect.html /library/test/success.html /success.txt /connecttest.txt /ncsi.txt /canonical.html
handle @portal_probe {
  redir ${PORTAL_URL} 302
}
EOF
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
