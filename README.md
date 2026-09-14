# Mapa Kryzysowa

**English: [README.en.md](README.en.md) · Dokumentacja: [docs/](docs/README.md)**

Lokalna mapa pomocy ludności dla jednej gminy. Pokazuje, gdzie jest woda, prąd do naładowania
telefonu, schron, defibrylator, warsztat i ludzie, którzy otworzą drzwi, kiedy zabraknie prądu.
Węzeł stoi zwykle w remizie OSP albo w urzędzie gminy i **działa bez internetu, bez centrali i bez GPS**.

Mieszkaniec wchodzi na mapę z telefonu przez Wi-Fi remizy albo lokalną sieć. Nic nie instaluje,
nie zakłada konta, żeby patrzeć, i nie potrzebuje zasięgu operatora.

## Czym to nie jest

- Nie jest systemem alarmowania. Alert RCB i RSO działają osobno, ta mapa ich nie zastępuje.
- Nie wyznacza tras ewakuacji ani nie wydaje poleceń.
- Nie mapuje infrastruktury krytycznej. Elektrownie, stacje transformatorowe, gazociągi, magazyny
  paliw i obiekty wojskowe są odrzucane przez serwer, bez wyjątku dla administratora.
- Nie jest usługą w chmurze. Nie ma konta centralnego, nie ma abonamentu, nie ma telemetrii.

„Punkt Odporności” to nazwa produktowa wzorowana na rozwiązaniach ukraińskich, a nie termin
z ustawy o ochronie ludności.

## Dla kogo

| Rola | Co robi |
| --- | --- |
| mieszkaniec | patrzy na mapę, zgłasza punkt albo błąd |
| zaufany | personel OSP i gminy: widzi zgłoszenia potrzeb, bierze je i zamyka |
| operator | weryfikuje zgłoszenia, potwierdza gotowość punktów, zarządza kafelkami i sąsiadami |
| administrator | zakłada konta i nadaje role |

Organem prowadzącym jest wójt, burmistrz albo prezydent jako organ ochrony ludności; w praktyce
węzeł obsługuje OSP.

## Co potrafi

**Mapa offline.** Podkład to jeden plik PMTiles na dysku węzła. Po pobraniu mapa nie odzywa się do
internetu. Poza pobranym obszarem mówi wprost, że go brakuje, zamiast pokazywać pustkę.

**Kategorie punktów.** Punkty Odporności, schrony i miejsca doraźnego schronienia, defibrylatory,
woda, ładowanie i prąd, łączność, przemysł i zaplecze (warsztat, spawanie, magazyn, agregat).

**Gotowość, nie tylko istnienie.** Punkt ma pola „kiedy się otwiera” (stale, po alarmie, po N godzinach
bez prądu), „na ile godzin starcza autonomii” i „kiedy ktoś ostatnio to sprawdził”. Mapa pokazuje
**Niepotwierdzony od N dni**, bo obiekt gotowy na papierze to nie jest obiekt gotowy.

**Kto potwierdził.** Przy punkcie widać inicjały i organizację osoby, która go dopuściła, na przykład
„J.K., OSP Szombierki”. Zaufanie w społeczności lokalnej buduje się na nazwiskach, nie na statusie.

**Potrzeby sąsiadów.** Zgłoszenie potrzeby (leki, woda, ewakuacja) trafia do zaufanych i OSP, nigdy na
mapę publiczną i nigdy poza węzeł. Kto może pomóc, klika „Biorę to”, a inni widzą, że sprawa jest zajęta.

**Zgłoszenie w kilkanaście sekund.** Przytrzymanie palca na mapie otwiera formularz w tym miejscu.
Konto jest potrzebne dopiero przy zapisie, a wpisana treść czeka na czas logowania.

**Tryb offline na telefonie.** Po jednej wizycie aplikacja działa bez sieci, a zgłoszenie wysłane
bez łączności czeka w telefonie i idzie do węzła po powrocie zasięgu.

**Wydruk A4.** Mapa gminy z punktami, kodem QR do węzła i wykazem. Dla tych, którzy nie zainstalują
niczego na telefonie: remiza, sklep, tablica parafialna.

**Sieć węzłów.** Sąsiednie gminy wymieniają zweryfikowane punkty bezpośrednio między sobą.
Gdy padnie łącze, każdy węzeł pracuje dalej sam i dosyła zmiany po powrocie sieci. Gdy nie ma
łącza w ogóle, zostaje paczka na pendrive.

## Uruchomienie

```bash
cp .env.example .env
# ustaw NODE_ID, NODE_NAME, NODE_GMINA_*, hasła superuserów
docker compose up --build
```

Mapa: `http://<ip-węzła>/`. Kolejka operatora: `/operator`. Panel kont: `/admin`.
Stan węzła i kafelki: `/status`. Panel PocketBase: `/_/`.

Konta demo (**usuń przed wdrożeniem**): `admin@demo.local`, `operator@demo.local`,
`mieszkaniec@demo.local`, hasło `demo12345`. Superuser PocketBase to konto z `.env` i nie służy
do pracy w aplikacji.

Pełny opis zmiennych, HTTPS, kopii zapasowych i awarii: [docs/eksploatacja.md](docs/eksploatacja.md).

## Mapa offline

Na stronie **Węzeł** (operator): **Pobierz gminę**, województwo albo Polskę. Węzeł wycina fragment
aktualnego dziennego buildu Protomaps przez żądania zakresowe i zapisuje plik PMTiles w `./tiles`.
Gmina przy przybliżeniu 14 to dziesiątki megabajtów i tyle wystarczy remizie.

Bez internetu: **Wgraj plik PMTiles** z pendrive'a. Albo na hoście:

```bash
scripts/make-tiles.sh
```

Nazwa pliku jest dowolna. Aplikacja czyta `/tiles/index.json`, a zasięg i maksymalne przybliżenie
bierze z nagłówka pliku. Atrybucja: © OpenStreetMap, Protomaps.

Trzy pułapki, które już raz położyły mapę, opisuje [docs/eksploatacja.md](docs/eksploatacja.md):
brakująca czcionka w katalogu glifów, service worker cache'ujący kafelki i `background-color`
na warstwie typu `fill`.

## Sieć węzłów

Operator dodaje sąsiada na `/operator/wezly` (identyfikator i adres), porównuje odcisk klucza przez
telefon albo radio i klika **Zaufaj**. Zaufani sąsiedzi ogłaszają sobie katalog znanych węzłów,
więc kolejne gminy pojawiają się same i czekają tylko na decyzję operatora.

Każdy zweryfikowany rekord jest podpisany kluczem Ed25519 węzła, na którym powstał, i podpis wędruje
z nim przez pośredników. Pośrednik nie może zmienić treści. Zgłoszenia potrzeb nie opuszczają węzła
nigdy. Szczegóły: [docs/mesh.md](docs/mesh.md).

Centrala jest opcjonalna (`docker compose --profile central up --build`). Ma jedno dodatkowe
uprawnienie: może ukryć punkt w całej sieci. Konta użytkowników są zawsze lokalne dla węzła
i nie synchronizują się nigdzie.

## Awaria — co się dzieje

1. Odetnij sieć (`scripts/chaos.sh down-central`).
2. W ciągu około minuty pojawia się baner **TRYB WYSPA**.
3. Logowanie, dodawanie i weryfikacja działają dalej na lokalnej bazie.
4. Po przywróceniu sieci rekordy dosyłają się zwykle w minutę.
5. Bez sieci w ogóle: operator pobiera paczkę na pendrive, sąsiad ją wczytuje po porównaniu odcisku klucza.

## Prywatność i OPSEC

Publiczna mapa to również informacja dla kogoś, kto szuka celów. Dlatego łączność i prywatny prąd
pokazujemy z dokładnością do gminy, z deterministycznym rozmyciem zamiast siatki kilometrowej.
Zdjęcia z danymi GPS są odrzucane, a przy łączności zdjęć nie ma wcale. Nic nie jest publiczne przed
weryfikacją operatora.

Administratorem danych jest podmiot z `NODE_OPERATOR_NAME` (strona `/prywatnosc`). Zgłoszenia potrzeb
żyją 72 godziny, potem wygasają, a po kolejnych siedmiu dniach pola osobowe są czyszczone.

Szczegóły: [docs/opsec.md](docs/opsec.md).

## Sprzęt

Raspberry Pi 5 (8 GB) albo mini-PC, 32 GB pamięci, UPS i **moduł RTC**. Bez RTC po zaniku zasilania
zegar wraca do 1970 i psuje synchronizację. Szczegóły: [docs/sprzet.md](docs/sprzet.md).

## Testy

```bash
docker compose --profile central -f docker-compose.yml -f docker-compose.test.yml \
  up --build --abort-on-container-exit --exit-code-from test-runner
```

Bez Dockera: `cd tests && node --test unit/*.test.mjs`, `node scripts/check-schema.mjs`,
`cd web && npm run build`.

Scenariusze end-to-end obejmują rejestrację, weryfikację, tryb wyspa, podpisy po powrocie sieci,
kolejkę offline, zaokrąglanie współrzędnych łączności, retencję potrzeb, odrzucenie nieznanego węzła
i brak angielskich etykiet w interfejsie.

## Znane ograniczenia

- Nie zbudowane (P2): captive portal Wi-Fi, mDNS `mapa.local`, wklejka Alert RCB, wykrywanie węzłów
  w sieci lokalnej, bramka SMS.
- Transport radiowy o małej przepustowości (LoRa, Meshtastic) nie jest obsługiwany; protokół to HTTP i JSON.
- Zdjęcia z GPS są odrzucane, a nie czyszczone z metadanych.
- Brak lokalizacji „otwarte teraz” z `opening_hours` i brak przypisania gminy z granic administracyjnych.
- Interfejs tylko po polsku; wersja ukraińska planowana.
- Service worker wymaga HTTPS albo localhost.
- Na części hostów mostek Dockera tnie ruch między kontenerami: `sudo scripts/fix-docker-icc.sh`.
- Zegar bez modułu RTC psuje synchronizację.

## Licencja i dane

Podkład mapowy: © OpenStreetMap (ODbL), kafelki Protomaps. Defibrylatory: OpenAEDMap na danych
OpenStreetMap. Dane wprowadzone na węźle należą do gminy, która go prowadzi.
