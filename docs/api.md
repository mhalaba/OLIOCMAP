# API

English: [en/api.md](en/api.md)

Wszystko idzie przez Caddy na porcie 80/443 węzła. Dwa backendy: PocketBase pod `/api` i `/_`,
sync-worker pod `/sync/v1`. Pliki kafelków pod `/tiles`.

## Uwierzytelnianie

Konta są lokalne dla węzła. Logowanie to standardowe PocketBase:
`POST /api/collections/users/auth-with-password` z `{identity, password}`.
Token wraca w polu `token` i idzie w nagłówku `Authorization` przy kolejnych żądaniach.

Endpointy `/sync/v1/*` przeznaczone dla operatora sprawdzają ten sam token: sync-worker odpytuje
PocketBase (`auth-refresh`) i przepuszcza wyłącznie rolę `operator`, `admin` albo superusera PocketBase.

Endpointy federacyjne nie używają tokenów. Rozpoznają węzeł po nagłówku `X-Node-Id`, a wiarygodność
danych opiera się na podpisie Ed25519 wiersza, nie na uwierzytelnieniu połączenia.

## PocketBase

### `GET /api/feed.geojson`

Publiczna warstwa mapy. Bez uwierzytelniania.

Zwraca `FeatureCollection`. Pomija rekordy niezweryfikowane, zablokowane, skasowane, kategorię
`potrzeba` oraz punkty z `public_geom = hidden`. Współrzędne to zawsze `public_lat` / `public_lon`,
czyli po zaokrągleniu i rozmyciu tam, gdzie wymaga tego OPSEC.

Nagłówki: `ETag`, `Cache-Control: public, max-age=30`. Odpowiedź jest trzymana w pamięci
przez 30 sekund; przy zgodnym `If-None-Match` wraca `304`.

Właściwości cechy: `id`, `category`, `title`, `services`, `host_type`, `hours`, `activation`,
`activation_hours`, `autonomy_h`, `capacity`, `status`, `source_node`, `last_confirmed_at`,
`verified_at`, `verified_by_name`, `confirmed_by_name`, `stale`, `public_geom`.

### `GET /api/status`

Stan węzła dla strony **Węzeł** i dla sąsiadów. Uruchamia przy okazji wygaszanie potrzeb.

```json
{
  "node_id": "bytom-01", "node_name": "OSP Bytom-Szombierki", "role": "node",
  "gmina": "Bytom", "gmina_teryt": "2462011", "operator_name": "OSP Bytom-Szombierki",
  "registration_mode": "open", "mode": "wyspa",
  "last_pull": "", "last_push": "", "last_error": "",
  "peers": [{ "node_id": "radzionkow-01", "ok": true, "last_seen": "…", "trusted": true }],
  "counts": { "by_category": {}, "by_status": {} },
  "potrzeba_open": 0, "version": "0.1.0", "tls_mode": "internal", "public_key": "…"
}
```

`mode` przyjmuje `wyspa` (brak łączności z sąsiadami) albo `sync`.

### `GET /api/config`

Dane potrzebne przy starcie aplikacji: `node_id`, `node_name`, `gmina`, `role`,
`registration_mode`, `operator_name`, `confirm_interval_days`, `tls_mode`.

### `GET /api/health`

Wbudowany health PocketBase. Używany przez healthcheck kontenerów.

### `/api/collections/<kolekcja>/records`

Standardowy REST PocketBase z regułami dostępu opisanymi w [model-danych.md](model-danych.md).
Kolekcje: `users`, `points`, `peers`, `sync_log`, `node_status`, `audit`, `reports`, `invites`.

Reguły są egzekwowane po stronie serwera, a hooki nadpisują pola wrażliwe niezależnie od tego,
co przyśle klient. Pola `lat`, `lon`, `contact_operator`, `created_by` i `field_hlc` są ukrywane
przed użytkownikiem bez roli operatora.

### `/_/` oraz `/api/backups`

Panel administracyjny PocketBase i API kopii zapasowych. Tylko superuser PocketBase, czyli konto
z `.env`, a nie konto aplikacji.

## sync-worker (`/sync/v1`)

### `GET /sync/v1/health`

Bez uwierzytelniania. Wizytówka węzła i punkt wejścia do sieci.

```json
{
  "node_id": "bytom-01", "role": "node", "time_ms": 1789377600000,
  "public_key": "MCowBQYDK2Vw…", "version": "0.1.0",
  "mesh": { "relay": true, "directory": true },
  "known_nodes": [{ "node_id": "radzionkow-01", "public_key": "…", "base_url": "https://…", "role": "node" }]
}
```

`known_nodes` zawiera sam węzeł oraz jego zaufanych sąsiadów z kluczami. Pusta lista oznacza
wyłączony katalog (`MESH_DIRECTORY=0`) albo brak zaufanych sąsiadów.

### `GET /sync/v1/changes?since=<hlc>&limit=<1..200>`

Wymaga nagłówka `X-Node-Id` wskazującego **zaufanego** sąsiada. W przeciwnym razie `403`.

Zwraca `{ "rows": [...], "next_cursor": "<hlc>" }`. Wychodzą wyłącznie rekordy zweryfikowane
i nigdy kategoria `potrzeba`. Kursor `since` jest przesuwany o sekundę wstecz, żeby nie zgubić
rekordów o zbliżonym znaczniku.

### `POST /sync/v1/changes`

Body: `{ "node_id": "<nadawca>", "rows": [ … ] }`, nagłówek `X-Node-Id`.

Nieznany nadawca zakłada wpis w `peers` z `trusted=false` i dostaje `403` — dzięki temu operator
widzi go w panelu i może zaufać po porównaniu odcisku. Nadawca znany, ale niezaufany, dostaje `403`
bez zapisu.

Każdy wiersz jest sprawdzany podpisem węzła źródłowego. Odpowiedź: `{ "accepted": <n>, "rejected": [{ "id", "error" }] }`.

### `POST /sync/v1/status`

Body jak z `GET /api/status`. Centrala zapisuje stan każdego węzła. Zwykły węzeł zapisuje wyłącznie
zaufanych sąsiadów, a pozostałym odpowiada `{ "ok": true, "ignored": true }`.

### Kafelki (operator)

| Metoda i ścieżka | Znaczenie |
| --- | --- |
| `GET /sync/v1/tiles/status` | `{ files: [{name, bytes}], job, presets: {gmina, wojewodztwo, polska}, source }` |
| `POST /sync/v1/tiles/download` | `{ preset: "gmina" \| "wojewodztwo" \| "polska" }`, odpowiedź `202` ze stanem zadania |
| `POST /sync/v1/tiles/upload` | surowy plik PMTiles w ciele żądania (USB) |

Zadanie ma pola `state` (`idle`, `running`, `ok`, `error`), `preset`, `error`, `file`, `bytes`,
`startedAt`, `source`.

### AED (operator)

| Metoda i ścieżka | Znaczenie |
| --- | --- |
| `GET /sync/v1/aed/status` | `{ state, total, done, skipped, error, source }` |
| `POST /sync/v1/aed/import` | `{ source: "bundled" \| "fetch", bbox?: "minLon,minLat,maxLon,maxLat" }`, odpowiedź `202` |

Import w toku zwraca `202` z bieżącym stanem zamiast startować drugi raz.

### Paczka USB (operator)

`GET /sync/v1/export.bundle` oddaje `application/gzip` z nazwą pliku `mapa-<node_id>-<data>.json.gz`.
W środku: `node_id`, `public_key`, `exported_at`, `rows` oraz `bundle_sig`. Potrzeby nie wchodzą do paczki.

`POST /sync/v1/import.bundle` przyjmuje ten plik (gzip albo czysty JSON). Gdy węzeł źródłowy jest
nieznany, tworzy wpis w `peers` i zwraca `409` z odciskiem klucza do porównania. Gdy znany, ale
niezaufany — `403` z odciskiem. Po zaufaniu: `{ "ok": true, "applied": <n> }`.

## `/tiles`

`GET /tiles/index.json` — lista plików PMTiles leżących na węźle, generowana po pobraniu albo wgraniu.
`GET /tiles/<plik>.pmtiles` — plik kafelków. Musi obsługiwać żądania zakresowe i nie może być
kompresowany przez Caddy, bo PMTiles czyta wyłącznie fragmentami.

## Kody odpowiedzi

| Kod | Kiedy |
| --- | --- |
| `304` | `/api/feed.geojson` przy zgodnym `If-None-Match` |
| `400` | brak `node_id`, zły plik, treść odrzucona przez denylistę albo walidację |
| `403` | węzeł niezaufany, brak roli operatora, rejestracja zamknięta |
| `409` | paczka USB od węzła o nieznanym kluczu (w odpowiedzi jest odcisk) |
| `202` | zadanie w tle przyjęte (kafelki, AED) |

Klient synchronizacji toleruje dodatkowo `409` z polem `row` przy wypychaniu zmian, ale obecna
wersja serwera takiej odpowiedzi nie wysyła.
