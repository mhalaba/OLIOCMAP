#!/usr/bin/env bash
# Na części hostów (bridge-nf-call-iptables=1) kontenery na jednym mostku
# Dockera nie pingują się nawzajem i Caddy nie dochodzi do PocketBase.
# To nie zmienia specyfikacji usług — tylko filtr pakietów mostka.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "uruchom jako root: sudo $0" >&2
  exit 1
fi
sysctl -w net.bridge.bridge-nf-call-iptables=0
sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
mkdir -p /etc/sysctl.d
cat > /etc/sysctl.d/99-mapa-kryzysowa-icc.conf <<'EOF'
net.bridge.bridge-nf-call-iptables=0
net.bridge.bridge-nf-call-ip6tables=0
EOF
echo "ICC mostka Dockera włączone (bridge-nf-call-iptables=0)"
