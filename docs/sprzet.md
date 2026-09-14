# Sprzęt węzła (OSP / gmina)

Cel: Raspberry Pi 5 (8 GB) albo dowolny mini-PC x86, 32 GB pamięci, UPS. Obraz Docker Compose: jeden węzeł-wyspa.

## Czas

Bez RTC po zaniku zasilania Raspberry Pi startuje od 1970. HLC chroni przed utratą danych przy cofnięciu zegara, ale znaczniki „N dni temu” i odrzut >10 min w przyszłość wymagają wiarygodnego czasu.

Zalecane:

- moduł **DS3231** (I2C) + `fake-hwclock` jako zapas
- albo czas z GPS (`gpsd`) i `chrony` z lokalnymi peerami w powiecie
- sync-worker loguje ostrzeżenie, gdy czas lokalny jest wcześniejszy niż czas budowania obrazu

Nie polegaj na NTP z internetu w kryzysie — ustaw peerów chrony na sąsiednie węzły, gdy łącze LAN/radio żyje.

## Zasilanie

UPS na 2–4 h minimum (tyle trzymają stacje bazowe). Punkt z agregatem: wpisz `autonomy_h`. Remiza OSP z agregatem to naturalny host.

## Sieć lokalna

SSID roboczy: `MAPA-KRYZYSOWA` (P2: hostapd + przekierowanie). Na dziś: zwykła sieć OSP, plakat z QR do `http://<ip>`.

Opcjonalnie Avahi / `mapa.local` (P2). Compose nie wymaga IPv6.

## Pobór

Pi 5 + SSD + UPS: rząd 8–15 W. Mini-PC: więcej. Agregat 1–2 kW w remizie wystarcza z zapasem.

## Klucze

Para Ed25519 jest w wolumenie `node_keys` (`node.key`, `node.pub`). Nie kopiuj `node.key` na USB z paczką danych. Kradzież węzła: na centrali `trusted=false`.
