# Mapa Kryzysowa

Lokalna mapa pomocy ludności dla gminy: Punkty Odporności, schrony / MDS, AED, woda, prąd, łączność oraz przemysł i zaplecze (warsztat, spawanie, magazyn). Węzeł stoi zwykle w remizie OSP albo w urzędzie gminy i **działa bez internetu, bez GPS i bez centrali**.

To nie jest system alarmowania (Alert RCB / RSO), nie wyznacza ewakuacji i **nie mapuje infrastruktury krytycznej**. „Punkt Odporności” to nazwa produktu (koncepcja ukraińska), nie termin z ustawy o ochronie ludności.

Dla kogo: wójt / burmistrz / prezydent (organ ochrony ludności), OSP, operatorzy gminy. Mieszkaniec korzysta z mapy na Wi-Fi remizy.

## Jak uruchomić wyspę

```bash
cp .env.example .env
# zmień NODE_ID, NODE_NAME, hasła superuserów
docker compose up --build
```

Wejdź na `http://<IP-węzła>/` (albo `http://127.0.0.1/` na samym urządzeniu).

Konta demo (**usuń przed produkcją**):

- administrator aplikacji: `admin@demo.local` / `demo12345` (panel `/admin` — dodawanie kont)
- operator: `operator@demo.local` / `demo12345`
- mieszkaniec: `mieszkaniec@demo.local` / `demo12345`
- superuser PocketBase: wartości z `.env` (`PB_SUPERUSER_EMAIL`) — to **nie** jest konto w aplikacji

Panel PocketBase: `http://<IP>/_/`. Kolejka operatora: `/operator`. Panel kont: `/admin`.

## Jak dołączyć centralę

```bash
docker compose --profile central up --build
```

Na węźle w `.env`:

```
CENTRAL_URL=http://central-caddy
```

albo `PEERS=[{"node_id":"central-01","base_url":"http://central-caddy"}]`.

1. Na węźle otwórz `/status` (operator) i skopiuj klucz publiczny.
2. Na centrali (`http://<host>:8092/operator/wezly`) wklej klucz, **Zaufaj**.
3. Analogicznie zaufaj węzłowi na stronie centrali i centrali na węźle (klucz centrali: `GET /sync/v1/health`).

Centrala nie loguje użytkowników innych węzłów. Użytkownicy są zawsze lokalni.

## Sieć węzłów (mesh)

Węzły łączą się między sobą bez centrali: operator dodaje sąsiada na `/operator/wezly` (adres + identyfikator), porównuje odcisk klucza przez telefon lub radio i klika **Zaufaj**. Zaufani sąsiedzi ogłaszają sobie nawzajem katalog znanych węzłów (klucze, adresy), a zweryfikowane punkty wędrują przez pośredników z podpisem węzła źródłowego. Szczegóły, model zaufania i co NIE wędruje: [docs/mesh.md](docs/mesh.md).

## Jak działa awaria

1. Zatrzymaj centralę albo sieć (`scripts/chaos.sh down-central`).
2. W ciągu ok. minuty baner: **TRYB WYSPA — centrala niedostępna**.
3. Logowanie, dodawanie i weryfikacja punktów działają na lokalnym SQLite.
4. Uruchom centralę (`scripts/chaos.sh up-central`). Sync-worker dopycha zweryfikowane rekordy (z podpisem Ed25519) zwykle w ≤ 60 s.
5. Bez sieci w ogóle: operator na `/status` pobiera paczkę USB, sąsiad wczytuje ją w `/operator` (porównaj odcisk klucza przez telefon / radio).

## Kafelki

Na stronie **Węzeł** (`/status`, operator): **Pobierz gminę** / województwo / Polskę. Węzeł wycina PMTiles z **aktualnego** dziennego buildu Protomaps (HTTP range; `PMTILES_SOURCE=auto`) do `./tiles/poland.pmtiles`. Datowane URL-e znikają po ok. tygodniu — nie wklejaj starej daty na sztywno. Pobieranie idzie przez **tiles-agent** na sieci hosta (kontenery Dockera bywają bez NAT). Potem mapa nie woła internetu.

Albo z USB: **Wgraj plik PMTiles**. Albo na hoście:

```bash
scripts/make-tiles.sh
# albo: docker compose exec sync-worker sh -c 'pmtiles extract "$PMTILES_SOURCE" /tiles/poland.pmtiles --bbox=18.82,50.30,18.98,50.42 --maxzoom=14'
```

Cała Polska przy z14 to kilka GB; powiat przy z14 — dziesiątki MB (zalecane dla OSP). Atrybucja: © OpenStreetMap, Protomaps. Bez pliku mapa pokaże ostrzeżenie i — tylko gdy jest internet — raster OSM.

Nazwa pliku jest dowolna (na Sietchu leży np. `slask-z13.pmtiles`). Aplikacja czyta `/tiles/index.json`, a gdy go nie ma — próbuje znanych nazw; `pmtiles:///tiles/poland.pmtiles` w `style.json` to tylko placeholder, zawsze nadpisywany. Zasięg i maxzoom bierze z nagłówka PMTiles: powyżej maxzoom działa overzoom (ulice zostają), a po wyjechaniu poza bbox pliku mapa pokazuje komunikat „Poza zasięgiem mapy offline (Śląsk)” zamiast pustki bez wyjaśnienia.

Trzy pułapki, które już raz położyły mapę:

- **Glify.** W `/glyphs` jest wyłącznie `Noto Sans Regular`. Inna czcionka w stylu → Caddy oddaje `index.html` (fallback SPA) → MapLibre sypie `Unimplemented type: 4`. `MapView` przed załadowaniem stylu wymusza Regular na każdej warstwie `symbol`.
- **Service Worker.** `/tiles/*` musi być `NetworkOnly` i nie może trafiać do precache — `CacheFirst` psuje żądania Range i ulice znikają. `tiles/index.json` też nie idzie do precache (byłby wiecznie pusty).
- **`background-color` na warstwie `fill`** (np. `earth`) unieważnia cały styl — MapLibre nie rysuje wtedy nic.

Do sprawdzenia stylu bez węzła: `npm run dev` i `/?demo=1&tiles=https://…/plik.pmtiles` (tylko w trybie dev; zdalny plik musi mieć CORS i Range).

## AED z OpenAEDMap

Przy starcie węzeł wgrywa defibrylatory z paczki `data/openaedmap-pl.geojson.gz` (eksport [OpenAEDMap](https://openaedmap.org/api/v1/countries/PL.geojson), dane OSM). To nie jest skrapanie. Rekordy mają `external_ref=osm:…`, status zweryfikowany, interwał potwierdzenia 365 dni — **potwierdź w terenie**.

Operator: `/status` → **Wgraj z paczki węzła** albo **Pobierz z OpenAEDMap** (gdy jest sieć). `AED_IMPORT=off` wyłącza autoimport (tak jest w testach). `AED_BBOX` ogranicza wycinek.

## HTTPS i tryb offline (PWA)

`TLS_MODE` w `.env`:

- `off` — HTTP. Aplikacja działa, ale service worker się nie zainstaluje (poza localhost).
- `internal` — certyfikat Caddy. Pobierz `/ca.crt`, instrukcja: `/instalacja-certyfikatu`.
- `file` — własny certyfikat gminy (`TLS_CERT_FILE`, `TLS_KEY_FILE`), uzyskany **przed** wdrożeniem, nigdy w runtime z internetu.

## Sprzęt węzła

Zobacz [docs/sprzet.md](docs/sprzet.md): Raspberry Pi 5 (8 GB) albo mini-PC, 32 GB, UPS, **moduł RTC DS3231 albo czas z GPS**. Bez RTC po zaniku zasilania zegar wraca do 1970 i psuje synchronizację.

## Kategorie i OPSEC

Nie mapujemy IK (elektrownia, GPZ, gazociąg, magazyn paliw, jednostka wojskowa, …) — hook odrzuca zgłoszenie bez wyjątku dla admina. Łączność / prywatny prąd: publicznie gmina, nie antena. Zdjęcia: bez GPS EXIF; zakaz zdjęć dla `lacznosc`. `potrzeba` nigdy publiczna (TTL 72 h + 7 dni czyszczenia).

Punkt „gotowy na papierze” dostaje pola `activation`, `autonomy_h`, `last_confirmed_at`. UI pokazuje **Niepotwierdzony od N dni**. Operator: **Potwierdź działanie**.

Szczegóły: [docs/opsec.md](docs/opsec.md).

## RODO

Administrator danych: `NODE_OPERATOR_NAME` (strona `/prywatnosc`). Minimalizacja, zgoda przy zgłoszeniu, potrzeby niewidoczne publicznie, retencja 72 h + 7 dni. Konta nie są synchronizowane między węzłami.

## Role i weryfikacja

- mieszkaniec — zgłasza, widzi swoje pending
- zaufany — personel OSP/gminy (kolejka wyżej; opcjonalnie `AUTO_VERIFY_TRUSTED`)
- operator — weryfikuje, potwierdza, potrzeby
- admin — role i zaufanie węzłów

Checklista operatora: czy punkt istnieje, kto prowadzi, kiedy działa, kontakt do gospodarza, autonomia, czy nie ujawnia IK.

## Kopie zapasowe

`scripts/backup.sh` — API kopii PocketBase do `./backups`, 7 dni. Odtwarzanie: wgraj archiwum przez API `/api/backups` albo podmień wolumen `pb_data` przy zatrzymanym kontenerze.

## Testy

```bash
docker compose --profile central -f docker-compose.yml -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner
```

Scenariusze (także ręcznie):

1. Rejestracja → AED → `/moje` status Oczekuje
2. Operator Weryfikuj → punkt na mapie bez logowania
3. Odłącz centralę → baner TRYB WYSPA → dodaj i zweryfikuj lokalnie
4. Podłącz centralę → w ≤ 60 s rekord z `sig` na centrali
5. Offline po jednej wizycie: powłoka, kolejka `/dodaj`
6. `lacznosc`: publicznie zaokrąglone współrzędne, operator — dokładne
7. `potrzeba` nie w `/api/feed.geojson`; wygasa po TTL
8. Push z nieznanego węzła → 403 i peer `trusted=false`; po Zaufaj — OK
9. Zbudowany frontend bez angielskich etykiet (Login, Submit, Save, …)

## Znane ograniczenia

- P2 (nie zbudowane): portalcaptive Wi-Fi `MAPA-KRYZYSOWA`, mDNS `mapa.local`, wklejka Alert RCB, discovery LAN, bramka SMS.
- Re-encode EXIF (P1 pełny): P0 odrzuca JPEG z GPS.
- Locale `uk` — P1.
- „Otwarte teraz” z OSM `opening_hours` — P1.
- Przypisanie gminy z `gminy.geojson` — P1.
- Service worker wymaga HTTPS albo localhost.
- Na części hostów mostek Dockera tnie ruch między kontenerami (`bridge-nf-call-iptables=1`). Wtedy: `sudo scripts/fix-docker-icc.sh`.
- Brak kafelków PMTiles = pusta podkładka offline (punkty i tak się rysują).
- PocketBase wymaga klucza głównego 15–40 znaków `[a-z0-9-]`. Frontend nadal nadaje UUIDv7 (36 znaków ze myślnikami); singleton `node_status` / `hlc_state` ma stałe id `self00000000000`.
- Centrala nie wgrywa punktów demo (unikamy kolizji identyfikatorów przy sync).
- Zegary bez RTC psują HLC — czytaj docs/sprzet.md.
- Cluster na mapie bez etykiet liczbowych (brak lokalnych glifów PBF).

Profil `dev`: `docker compose --profile dev up` (Vite :5173 z proxy).
