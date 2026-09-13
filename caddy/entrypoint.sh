#!/bin/sh
set -e
mode="${TLS_MODE:-off}"
case "$mode" in
  internal) cp /tpl/Caddyfile.internal /etc/caddy/Caddyfile ;;
  file) cp /tpl/Caddyfile.file /etc/caddy/Caddyfile ;;
  *) cp /tpl/Caddyfile.off /etc/caddy/Caddyfile ;;
esac
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
