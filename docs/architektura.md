# Architektura

English: [en/architecture.md](en/architecture.md)

## Założenie

Węzeł ma działać, gdy nie działa nic innego: bez internetu, bez DNS, bez centrali, bez GPS.
Wszystko, co potrzebne do pokazania mapy i przyjęcia zgłoszenia, leży na dysku węzła.
Sieć jest opcjonalnym udogodnieniem, nie warunkiem działania.

Z tego wynikają decyzje, które inaczej wyglądałyby dziwnie:

- baza to SQLite w jednym kontenerze, nie klaster,
- kafelki mapy to plik PMTiles na dysku, nie serwer kafelków,
- czcionki map, ikony i paczka AED są w obrazie, nie w CDN,
- synchronizacja jest asynchroniczna i zbieżna, bez blokad i bez „głównego” serwera.

## Kontenery

| Usługa | Obraz / port | Rola |
| --- | --- | --- |
| `caddy` | `caddy/Dockerfile`, 80/443 | jedyne wejście z zewnątrz: statyczny frontend, TLS, proxy do reszty |
| `pocketbase` | `pocketbase/Dockerfile`, 8090 | SQLite, REST, reguły dostępu, hooki JS, serwuje `/tiles` z `pb_public/tiles` |
| `sync-worker` | `sync/Dockerfile`, 8091 | pętla synchronizacji, API `/sync/v1/*`, klucze Ed25519, kafelki, import AED |
| `tiles-agent` | `sync/Dockerfile`, sieć hosta | wycinanie PMTiles przez HTTP Range; osobno, bo kontenery bywają bez NAT |
| `web` | `web/Dockerfile` | build frontendu; wypełnia wolumen `web_static` i kończy pracę |

Profile dodatkowe: `central` (centrala: `central-pocketbase`, `central-sync`, `central-caddy` na porcie 8092)
oraz `dev` (Vite na 5173 z proxy do PocketBase).

## Ścieżki w Caddy

```
/api/*       → pocketbase:8090     (REST, feed, status, config)
/_/*         → pocketbase:8090     (panel PocketBase)
/sync/v1/*   → sync-worker:8091    (federacja, kafelki, AED, paczki USB)
/tiles/*     → pocketbase:8090     (pliki PMTiles; BEZ gzip, Range musi działać)
/ca.crt      → certyfikat CA       (tylko TLS_MODE=internal)
/*           → /srv + SPA fallback (statyczny frontend)
```

`encode gzip` jest celowo wyłączone dla `/tiles/*`. Kompresja psuje żądania zakresowe, a PMTiles
opiera się wyłącznie na nich.

## Frontend

React 18 + Vite, router `react-router-dom`, mapa MapLibre GL z protokołem `pmtiles://`.
Bez CDN: czcionki, ikony i style leżą w `web/public`.

- `MapView.tsx` — jedyne miejsce, które tworzy mapę. Buduje styl, podmienia źródło PMTiles na plik
  realnie leżący na węźle, wymusza dostępny krój pisma, dodaje warstwy punktów, skalę i GPS.
- `lib/tiles.ts` — znajduje plik kafelków (`/tiles/index.json`, potem znane nazwy), czyta bbox
  i maxzoom z nagłówka PMTiles.
- `lib/glyphs.ts` — protokół `ocglyphs://`. Gdy styl poprosi o nieobecny krój lub zakres znaków,
  podstawia dostępny albo pusty poprawny bufor. Bez tego SPA-fallback oddaje HTML, a MapLibre
  wywala kafelek z etykietami.
- `lib/queue.ts` — IndexedDB. Zgłoszenie wysłane bez sieci czeka tu i idzie do bazy po powrocie łącza.
- `vite.config.ts` — PWA (Workbox). Powłoka aplikacji w precache, `/tiles/*` jako `NetworkOnly`.

## Backend: PocketBase i hooki

Logika domenowa siedzi w hookach JS (`pb_hooks/`), nie w kliencie. Klient może wysłać cokolwiek;
hook i tak nadpisze pola wrażliwe.

- `points_handlers.create` — nadaje `id` (UUIDv7), `source_node`, status (`pending`, chyba że autor
  jest personelem), HLC i `field_hlc`, liczy współrzędne publiczne, sprawdza denylistę infrastruktury
  krytycznej, odrzuca zdjęcia z GPS w EXIF, ustawia TTL dla potrzeb.
- `points_handlers.update` — pilnuje, kto może zmienić status, przelicza HLC per pole, zapisuje
  „kto potwierdził”, ogranicza zaufanego sąsiada przy potrzebach do pól `assigned_to` i `resolved_at`.
- `points_handlers.remove` — nie kasuje wiersza. Stawia `deleted_at` (nagrobek), żeby usunięcie
  rozeszło się po sieci zamiast wrócić przy najbliższej synchronizacji.
- `points_handlers.enrich` — ukrywa przed publicznością `lat`/`lon`, kontakt operatora, `created_by`.
- `routes_handlers` — `/api/feed.geojson` (z ETagiem i 30-sekundowym cache), `/api/status`, `/api/config`.
- `cron.pb.js` — co minutę wygaszanie potrzeb, co dwie minuty liczniki.

## Tożsamość węzła i podpisy

Przy pierwszym starcie `sync-worker` generuje parę Ed25519 i zapisuje ją w wolumenie `node_keys`
(`node.key`, `node.pub`). Klucz prywatny nie opuszcza węzła i nie idzie na USB razem z danymi.

Każdy zweryfikowany rekord jest podpisywany kanonicznym JSON-em (`shared/canonical.mjs`), z pominięciem
pól lokalnych (`sig`, `relay_sig`, `created_by`, `contact_operator`, `photo`, `assigned_to`).
Podpis `sig` należy do węzła źródłowego i wędruje z rekordem przez dowolną liczbę pośredników.
`relay_sig` to podpis centrali nad cudzym wierszem, używany tylko w układzie z centralą.

Odcisk klucza (`fingerprint`) to trzy grupy po osiem znaków heksadecymalnych. Operatorzy porównują go
głosem przez telefon albo radio, zanim klikną **Zaufaj**.

## Zegar i scalanie zmian

Zegar to HLC (hybrydowy zegar logiczny): `<ms 13 cyfr>-<licznik 4 hex>-<node_id>`.
Stan trzyma singleton `hlc_state`. Tik jest monotoniczny, więc cofnięcie zegara systemowego
(Raspberry Pi bez modułu RTC) nie psuje porządku zdarzeń.

Rekord ma jeden `hlc` i mapę `field_hlc` z osobnym znacznikiem dla każdego pola. Scalanie
(`shared/merge.mjs`) jest czystą funkcją i zachowuje się tak:

1. Rekord z czasem ponad 10 minut w przyszłość idzie do kwarantanny, nie do bazy.
2. Każde pole osobno: wygrywa nowszy znacznik; przy remisie rozstrzyga alfabetycznie `source_node`.
3. Lokalne zgłoszenie w stanie `pending` nigdy nie przegrywa ze zdalnym — zostaje oznaczone jako konflikt.
4. Nagrobek (`deleted_at`) rywalizuje z edycją po znaczniku; nowszy wygrywa.
5. Własne `lat`/`lon` są chronione, gdy rekord należy do tego węzła. Zdalny węzeł nie przesuwa cudzego punktu.
6. `created_by` i `contact_operator` nie przychodzą z sieci nigdy.
7. `blocked = true` przyjmujemy wyłącznie od zaufanej centrali.

Scalanie jest idempotentne, więc echo (własny rekord wracający przez sąsiada) niczego nie psuje,
a pętle w grafie połączeń są nieszkodliwe.

## Synchronizacja i mesh

Co `SYNC_INTERVAL_S` sekund węzeł odpytuje każdego zaufanego sąsiada:
`health` → nauka katalogu węzłów → `pull` → `push` → `status`.
Kursorem jest HLC, a nie czas serwera. Sąsiad, który nie odpowiada, dostaje narastające opóźnienie
do pięciu minut; reszta sieci działa dalej.

Model zaufania, relay i katalog węzłów opisuje [mesh.md](mesh.md).

## Kafelki mapy

`tiles-agent` stoi w sieci hosta i wycina fragment dziennego buildu Protomaps przez HTTP Range,
bo kontenery Dockera na części hostów nie mają NAT. Gotowy plik ląduje w `./tiles`, a PocketBase
serwuje ten katalog pod `/tiles`. Nazwa pliku jest dowolna: front czyta `/tiles/index.json`,
a zasięg i maksymalne przybliżenie bierze z nagłówka PMTiles.

## Czego tu nie ma

- Kolejki komunikatów, brokera, Redisa. Stan trzyma SQLite, a synchronizacja jest odpytywaniem.
- Geokodera adresów. Adres jest tekstem, miejsce wskazuje się na mapie.
- Systemu alarmowania. To mapa zasobów, nie RCB ani RSO.
- Multicastu i mDNS. W sieci radiowej i tak trzeba podać adres, a Docker często nie przepuszcza multicastu.
