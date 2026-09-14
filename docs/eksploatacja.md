# Eksploatacja węzła

English: [en/operations.md](en/operations.md)

Dokument dla osoby, która ma węzeł uruchomić i utrzymać: operatora OSP albo informatyka gminy.

## Pierwsze uruchomienie

```bash
cp .env.example .env
# ustaw NODE_ID, NODE_NAME, NODE_GMINA_*, hasła superuserów
docker compose up --build
```

Węzeł jest pod `http://<ip-węzła>/`. Panel PocketBase pod `/_/`.

Pierwszy start zakłada konta demo. **Usuń je przed wdrożeniem**: `admin@demo.local`,
`operator@demo.local`, `mieszkaniec@demo.local`, wszystkie z hasłem `demo12345`.
Superuser PocketBase to osobne konto z `.env` i nie służy do pracy w aplikacji.

## Zmienne środowiskowe

### Tożsamość

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `NODE_ID` | `bytom-01` | unikalny w całej sieci, `[a-z0-9-]`; wchodzi do każdego znacznika HLC |
| `NODE_ROLE` | `node` | `node` albo `central` |
| `NODE_NAME` | `OSP Bytom-Szombierki` | nazwa widoczna w interfejsie |
| `NODE_GMINA_NAME`, `NODE_GMINA_TERYT` | `Bytom`, `2462011` | gmina wpisywana nowym punktom |
| `NODE_OPERATOR_NAME` | jak `NODE_NAME` | administrator danych na stronie prywatności |

Zmiana `NODE_ID` po starcie zrywa ciągłość: stare rekordy zostają przypisane do starego węzła,
a sąsiedzi znają stary klucz. Traktuj to jak zmianę nazwy serwera produkcyjnego.

### Sieć i synchronizacja

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `PEERS` | puste | JSON `[{node_id, base_url}]`; adresuj Caddy sąsiada, nie PocketBase |
| `CENTRAL_URL` | puste | skrót dodający peera `central-01` |
| `PUBLIC_URL` | puste | adres, pod jakim sąsiedzi mają nas widzieć (katalog mesh) |
| `SYNC_INTERVAL_S` | `30` | odstęp między cyklami; minimum 5 |
| `MESH_RELAY` | `1` | przekazuj cudze zweryfikowane wiersze dalej |
| `MESH_DIRECTORY` | `1` | ogłaszaj i przyjmuj katalog węzłów |

### Bezpieczeństwo i prywatność

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `PUBLIC_GEOM_MODE` | `gmina` | publiczna geometria dla łączności i prywatnego prądu |
| `REGISTRATION_MODE` | `open` | `open`, `invite` albo `closed` |
| `AUTO_VERIFY_TRUSTED` | `false` | czy rola `zaufany` publikuje bez kolejki |
| `POTRZEBA_TTL_H` | `72` | ile godzin żyje zgłoszenie potrzeby |
| `CONFIRM_INTERVAL_DAYS` | `14` | po ilu dniach punkt jest „niepotwierdzony” |
| `TLS_MODE` | `off` | `off`, `internal`, `file` |

### Kafelki i AED

`TILES_DIR`, `TILES_BBOX`, `TILES_MAXZOOM`, `PMTILES_SOURCE`, `TILES_AGENT_SOCK`,
`AED_IMPORT`, `AED_BBOX`, `AED_BUNDLE_PATH`. Opis w README i niżej.

## HTTPS

Service worker, a więc tryb offline, wymaga HTTPS albo localhost. Warianty:

- `off` — HTTP. Aplikacja działa, ale bez trybu offline poza samym urządzeniem.
- `internal` — Caddy generuje własne CA. Mieszkaniec instaluje `/ca.crt`, instrukcja jest
  pod `/instalacja-certyfikatu`. Najczęstszy wybór dla remizy.
- `file` — certyfikat gminy z `TLS_CERT_FILE` i `TLS_KEY_FILE`. Zdobądź go **przed** wdrożeniem;
  węzeł nigdy nie pobiera certyfikatu z internetu w trakcie pracy.

## Mapa offline

Na stronie **Węzeł** (`/status`, operator): **Pobierz gminę**, **województwo** albo **Polskę**.
Węzeł wycina fragment aktualnego dziennego buildu Protomaps przez żądania zakresowe i zapisuje
plik PMTiles w `./tiles`. Pobieranie idzie przez kontener `tiles-agent` na sieci hosta.

Rozmiary: gmina przy z14 to dziesiątki megabajtów i to jest zalecany wybór dla OSP.
Polska przy wysokim przybliżeniu to gigabajty.

Bez internetu: **Wgraj plik PMTiles** z pendrive'a. Nazwa pliku jest dowolna (`slask-z13.pmtiles`,
gmina, cokolwiek) — aplikacja czyta `/tiles/index.json`, a zasięg bierze z nagłówka pliku.
`style.json` nie zakłada `poland.pmtiles`.

Poza obszarem pliku mapa pokazuje komunikat „Poza zasięgiem mapy offline”, a nie pustkę.
Powyżej maksymalnego przybliżenia działa powiększanie istniejących kafelków, więc ulice zostają
(na węźle ze `slask-z13.pmtiles` gęsta siatka kończy się na z13).

## AED

Przy starcie węzeł wgrywa defibrylatory z paczki `data/openaedmap-pl.geojson.gz` (dane OpenStreetMap
przez OpenAEDMap). Rekordy dostają interwał potwierdzenia 365 dni. **Potwierdź w terenie** —
dane OSM bywają nieaktualne. `AED_IMPORT=off` wyłącza autoimport.

## Centrala (opcjonalnie)

Centrala nie jest potrzebna do działania. Daje jedno uprawnienie: może ukryć punkt w całej sieci
(`blocked`) i pośredniczyć między węzłami, które nie widzą się bezpośrednio.

```bash
docker compose --profile central up --build
```

Na węźle w `.env`: `CENTRAL_URL=http://central-caddy` albo wpis w `PEERS`.

1. Na węźle otwórz `/status` jako operator i skopiuj klucz publiczny.
2. Na centrali (`http://<host>:8092/operator/wezly`) wklej klucz i kliknij **Zaufaj**.
3. Zrób to samo w drugą stronę: zaufaj centrali na węźle. Klucz centrali zwraca
   `GET /sync/v1/health`.

Zaufanie jest osobne w każdą stronę. Centrala nie loguje użytkowników innych węzłów — konta
są zawsze lokalne.

## Tryb deweloperski

```bash
docker compose --profile dev up
```

Vite na porcie 5173 z proxy do PocketBase. Do sprawdzenia samego stylu mapy, bez kafelków na węźle,
działa `npm run dev` w `web/` i adres `/?demo=1&tiles=https://…/plik.pmtiles` — parametr `tiles`
jest honorowany wyłącznie w trybie deweloperskim, a zdalny plik musi obsługiwać CORS i żądania
zakresowe.

## Pułapki przy zmianie stylu mapy

Cztery rzeczy, które już raz położyły mapę na produkcji:

1. **Czcionka spoza katalogu glifów.** W `web/public/glyphs` leży wyłącznie `Noto Sans Regular`.
   Prośba o inny krój dostaje w odpowiedzi `index.html` z SPA-fallbacku, a MapLibre zgłasza
   `Unimplemented type: 4` i gubi cały kafelek z etykietami. Frontend wymusza dostępny krój,
   ale styl na dysku i tak warto trzymać w ryzach.
2. **Service worker cache'ujący kafelki.** `/tiles/*` musi być `NetworkOnly` i nie może trafiać do
   precache. Strategia typu `CacheFirst` psuje żądania zakresowe i ulice znikają.
3. **`background-color` na warstwie `fill`.** MapLibre uznaje wtedy cały styl za niepoprawny
   i nie rysuje nic. Tła używa wyłącznie warstwa typu `background`.
4. **Filtrowanie dróg bez `medium_road`.** Protomaps oznacza typowe ulice miejskie jako
   `medium_road`. Warstwy `roads` / `roads-casing` / `road-labels` muszą ten `kind` malować,
   inaczej na z12–z13 zostają tylko główne ciągi.

Paletę i ikony opisuje [ui-oc.md](ui-oc.md).

## Kopie zapasowe

```bash
scripts/backup.sh
```

Skrypt woła API kopii PocketBase i trzyma siedem dni w `./backups`. Odtworzenie: wgraj archiwum
przez `/api/backups` albo podmień wolumen `pb_data` przy zatrzymanym kontenerze.

Kopia nie obejmuje kluczy węzła (wolumen `node_keys`). Utrata `node.key` oznacza, że sąsiedzi
muszą zaufać nowemu kluczowi od nowa. Zrób kopię kluczy osobno i trzymaj ją poza pendrive'em
z danymi.

## Aktualizacja

```bash
git pull
docker compose up --build -d
```

Migracje PocketBase wykonują się przy starcie kontenera. Zrób kopię przed aktualizacją.
Po zmianach w interfejsie wymuś odświeżenie na telefonach, bo stary service worker potrafi
trzymać poprzednią wersję: `Ctrl+Shift+R` albo wyrejestrowanie w narzędziach przeglądarki.

## Testy

```bash
docker compose --profile central -f docker-compose.yml -f docker-compose.test.yml \
  up --build --abort-on-container-exit --exit-code-from test-runner
```

Testy jednostkowe bez Dockera:

```bash
cd tests && node --test unit/*.test.mjs
node scripts/check-schema.mjs
cd web && npm run build
```

## Gdy coś nie działa

### Mapa jest pusta albo bez ulic

1. Sprawdź, czy plik kafelków istnieje: `GET /tiles/index.json` powinien wymienić plik `.pmtiles`.
2. Otwórz konsolę przeglądarki. `Unimplemented type: 4` oznacza, że żądanie czcionki albo kafelka
   dostało w odpowiedzi stronę HTML. Zwykle winny jest stary service worker — wyrejestruj go.
3. Sprawdź, czy Caddy nie kompresuje `/tiles/*`. Kompresja psuje żądania zakresowe.
4. Sprawdź, czy widok nie wyjechał poza obszar pobranego pliku.

### Sąsiad widoczny, ale nic nie przychodzi

Zajrzyj w `sync_log` na stronie Węzeł. Najczęstsze przyczyny: brak zaufania po jednej ze stron
(zaufanie jest osobne w każdą stronę), zły adres w `base_url` (wskazuj Caddy sąsiada, nie PocketBase),
albo rozjechane zegary.

### Rekordy wracają z kwarantanny przez czas

Znacznik ponad dziesięć minut w przyszłość jest odrzucany. Sprawdź zegar na obu węzłach.
Raspberry Pi bez modułu RTC po zaniku zasilania startuje od 1970 — patrz [sprzet.md](sprzet.md).

### Kontenery się widzą, ale ruch nie przechodzi

Na części hostów mostek Dockera filtruje ruch między kontenerami. Wtedy:

```bash
sudo scripts/fix-docker-icc.sh
```

### Zgłoszenie odrzucone przy zapisie

Denylist infrastruktury krytycznej działa bez wyjątku dla administratora. Sprawdź tytuł i opis.
Odrzucane są też zdjęcia z danymi GPS w EXIF oraz kontakt wyglądający jak PESEL.

## Symulacja awarii

```bash
scripts/chaos.sh down-central   # odetnij centralę
scripts/chaos.sh up-central     # przywróć
```

Po odcięciu w ciągu około minuty pojawia się baner **TRYB WYSPA**, a dodawanie i weryfikacja
działają dalej na lokalnej bazie. Po przywróceniu rekordy dopychają się zwykle w minutę.
