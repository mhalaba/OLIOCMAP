#!/usr/bin/env bash
set -euo pipefail
#
# Punkt dostępowy węzła: telefon łączy się z siecią remizy i sam dostaje mapę.
#
# Skrypt generuje konfigurację hostapd i dnsmasq dla Raspberry Pi z wbudowanym Wi-Fi.
# Domyślnie tylko wypisuje, co zrobi. Zapis wymaga --zapisz, a właczenie usług --wlacz.
#
# UWAGA: to jedyna część projektu, której nie da się sprawdzić w CI — wymaga sprzętu
# z kartą Wi-Fi. Przejrzyj wygenerowane pliki, zanim je włączysz. Skrypt nie
# konfiguruje NAT ani nie daje dostępu do internetu: sieć ma prowadzić wyłącznie do węzła.

SSID="${SSID:-MAPA-KRYZYSOWA}"
IFACE="${IFACE:-wlan0}"
ADDR="${ADDR:-192.168.4.1}"
RANGE_FROM="${RANGE_FROM:-192.168.4.10}"
RANGE_TO="${RANGE_TO:-192.168.4.200}"
CHANNEL="${CHANNEL:-6}"
COUNTRY="${COUNTRY:-PL}"
OUT="${OUT:-./hotspot}"

zapisz=0
wlacz=0
for arg in "$@"; do
  case "$arg" in
    --zapisz) zapisz=1 ;;
    --wlacz) zapisz=1; wlacz=1 ;;
    -h|--help)
      sed -n '3,14p' "$0"
      echo
      echo "Zmienne: SSID IFACE ADDR RANGE_FROM RANGE_TO CHANNEL COUNTRY OUT"
      exit 0
      ;;
    *) echo "nieznany argument: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT"

cat > "$OUT/hostapd.conf" <<EOF
# Sieć otwarta, bez hasła: w kryzysie nikt nie będzie wpisywał klucza z kartki.
# Ruch i tak prowadzi wyłącznie do węzła, a mapa nie wymaga logowania do oglądania.
interface=${IFACE}
driver=nl80211
ssid=${SSID}
country_code=${COUNTRY}
hw_mode=g
channel=${CHANNEL}
auth_algs=1
wmm_enabled=1
ignore_broadcast_ssid=0
EOF

cat > "$OUT/dnsmasq.conf" <<EOF
# Adresy przydzielane w sieci węzła.
interface=${IFACE}
bind-interfaces
dhcp-range=${RANGE_FROM},${RANGE_TO},255.255.255.0,12h
dhcp-option=option:router,${ADDR}
dhcp-option=option:dns-server,${ADDR}

# Każda nazwa prowadzi do węzła. Dzięki temu adresy, którymi telefony sprawdzają
# dostęp do internetu, trafiają do Caddy, a ten odpowiada przekierowaniem na mapę.
address=/#/${ADDR}

# Bez serwerów nadrzędnych: węzeł nie udaje, że daje internet.
no-resolv
EOF

cat > "$OUT/dhcpcd-fragment.conf" <<EOF
# Dopisz do /etc/dhcpcd.conf, żeby interfejs miał stały adres i nie szukał DHCP.
interface ${IFACE}
    static ip_address=${ADDR}/24
    nohook wpa_supplicant
EOF

cat > "$OUT/README.txt" <<EOF
Punkt dostępowy węzła Mapa Kryzysowa
====================================

SSID:        ${SSID}
Interfejs:   ${IFACE}
Adres węzła: ${ADDR}

1. Zainstaluj pakiety:   sudo apt install hostapd dnsmasq
2. Skopiuj pliki:
     sudo cp hostapd.conf /etc/hostapd/hostapd.conf
     sudo cp dnsmasq.conf /etc/dnsmasq.d/mapa.conf
     cat dhcpcd-fragment.conf | sudo tee -a /etc/dhcpcd.conf
3. Włącz usługi:
     sudo systemctl unmask hostapd
     sudo systemctl enable --now hostapd dnsmasq
4. W pliku .env projektu ustaw:
     PORTAL_URL=http://${ADDR}/
   i przeładuj: docker compose up -d caddy
5. Sprawdź telefonem: po połączeniu z siecią ${SSID} system powinien sam
   otworzyć okno z mapą. Jeśli nie, wejdź ręcznie na http://${ADDR}/

Uwagi:
- Sieć celowo nie daje internetu. To ma być droga do węzła, nie hotspot.
- Przy TLS_MODE=internal telefon zobaczy ostrzeżenie o certyfikacie w oknie portalu.
  Do portalu powitalnego prościej jest zostawić PORTAL_URL na http.
- Zasięg zwykłego Wi-Fi w Pi to kilkanaście metrów przez ściany. Na większą remizę
  potrzebny jest zewnętrzny punkt dostępowy z tą samą konfiguracją DNS.
EOF

echo "Wygenerowano w $OUT:"
ls -1 "$OUT"

if [[ "$zapisz" -eq 0 ]]; then
  echo
  echo "To był podgląd. Pliki leżą w $OUT i nic nie zostało zainstalowane."
  echo "Instrukcja instalacji: $OUT/README.txt"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Instalacja wymaga roota. Uruchom przez sudo." >&2
  exit 1
fi

install -m 644 "$OUT/hostapd.conf" /etc/hostapd/hostapd.conf
install -m 644 "$OUT/dnsmasq.conf" /etc/dnsmasq.d/mapa.conf
grep -q "static ip_address=${ADDR}/24" /etc/dhcpcd.conf || cat "$OUT/dhcpcd-fragment.conf" >> /etc/dhcpcd.conf
echo "Pliki zainstalowane."

if [[ "$wlacz" -eq 1 ]]; then
  systemctl unmask hostapd || true
  systemctl enable --now hostapd dnsmasq
  echo "hostapd i dnsmasq włączone. Ustaw PORTAL_URL=http://${ADDR}/ w .env i przeładuj Caddy."
fi
