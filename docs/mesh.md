# Sieć węzłów (mesh) — jak mapa aktualizuje się bez centrali

Cel: kilka remiz OSP i sołectw w powiecie ma własne węzły. Internet pada, centrala pada, ale
węzły w zasięgu Wi-Fi / kabla / radiolinii nadal widzą się nawzajem i wymieniają zweryfikowane punkty.
Nie ma „serwera”. Każdy węzeł jest równorzędny; centrala (jeśli jest) to tylko jeszcze jeden sąsiad
z uprawnieniem do `blocked`.

## Co już było, co jest nowe

| Warstwa | Było (hub-and-spoke) | Jest (mesh) |
| --- | --- | --- |
| Połączenia | `CENTRAL_URL` albo `PEERS` w `.env`, zaufanie klik przez admina | operator dodaje sąsiada w UI (`/operator/wezly`), katalog węzłów rozchodzi się po sieci |
| Klucze | klucz sąsiada tylko z jego `/sync/v1/health` | zaufany sąsiad ogłasza klucze **swoich** zaufanych; zapisujemy je jako *niezaufane, poznane przez X* (TOFU, zmiana klucza = alarm w `sync_log`). Do weryfikacji podpisów służą wyłącznie klucze węzłów zaufanych wprost |
| Przepływ wierszy | węzeł wypycha tylko własne; cudze przyjmował tylko z podpisem `relay_sig` centrali | `MESH_RELAY=1`: węzeł wypycha też cudze zweryfikowane wiersze z **podpisem origin**; odbiorca weryfikuje kluczem węzła, któremu ufa wprost — pośrednik nic nie podpisuje ani nie zmienia |
| Status sąsiadów | tylko centrala zbierała `/sync/v1/status` | każdy węzeł zapamiętuje stan zaufanych sąsiadów (widać na `/status`) |
| Bez sieci | paczka USB `export.bundle` / `import.bundle` | bez zmian — działa jako „sneakernet” między dowolnymi dwoma węzłami |

## Model zaufania

1. **Podpis origin** (`sig`, Ed25519) jest przy każdym zweryfikowanym wierszu i wędruje z nim przez dowolną liczbę pośredników. Pośrednik nie może zmienić treści.
2. **Zaufanie do połączenia** (`peers.trusted`) nadaje operator ręcznie po porównaniu odcisku klucza (telefon, PMR, spotkanie). Bez tego nie ma pull/push z tym węzłem.
3. **Klucz z katalogu nie wpuszcza rekordów.** Podpis pochodzenia weryfikujemy wyłącznie kluczami węzłów zaufanych wprost. Klucz poznany „przez sąsiada” służy do rozpoznania węzła w panelu i do porównania odcisku — nic więcej. Wiersze węzła C przekazane przez B leżą odrzucone (z wpisem w dzienniku „czekają na zaufanie”), dopóki operator nie zaufa C.

   Powód jest konkretny. Gdyby klucz z katalogu wystarczał, zaufany sąsiad mógłby ogłosić wymyślony węzeł z kluczem, który sam kontroluje, i podpisywać jego nazwą dowolne zweryfikowane punkty. Węzły o znanym już kluczu chroni zasada pierwszego kontaktu, nowe nie miałyby żadnej ochrony. Relay dalej działa i dalej ma sens: skraca drogę do węzła, któremu ufasz, gdy bezpośrednie łącze padło.
4. `blocked` dalej tylko z zaufanej centrali (`shared/merge.mjs`). Węzeł zwykły nie może zablokować cudzego punktu w całej sieci — może usunąć u siebie.
5. **Potrzeby (`potrzeba`) nigdy nie opuszczają węzła** — ani relay, ani paczka USB. To dane osobowe sąsiadów; zobacz `docs/opsec.md`.

## Jak dane się rozchodzą

- Co `SYNC_INTERVAL_S` (30 s) węzeł odpytuje każdego zaufanego sąsiada: `health` → nauka katalogu → `pull` (`GET /sync/v1/changes?since=<hlc>`) → `push` (`POST /sync/v1/changes`) → `status`.
- Kursor to HLC (zegar hybrydowy). Wiersze mają `field_hlc` per pole — dwa węzły mogą edytować ten sam punkt, wygrywa nowsze pole, remis rozstrzyga `source_node`. Echo (własny wiersz wraca przez sąsiada) jest neutralne: merge zostawia lokalny.
- Zbieżność: przy grafie spójnym każdy zweryfikowany punkt dociera wszędzie w czasie ~ (średnica grafu × interwał). Pętle nie szkodzą, bo merge jest idempotentny.
- Backoff wykładniczy do 5 min na sąsiada, który nie odpowiada; reszta sieci działa.

## Wykrywanie sąsiadów

Świadomie **bez** mDNS/multicastu (kontenery Dockera często nie widzą multicastu hosta, a w sieci radiowej i tak trzeba wpisać adres). Zamiast tego:

1. Operator wpisuje adres sąsiada raz (`/operator/wezly` → *Dodaj sąsiedni węzeł*).
2. Po pierwszym `health` sąsiad odsyła swój katalog: kolejne węzły pojawiają się same jako „poznany przez …” z adresem. Operator klika Zaufaj po porównaniu odcisku.
3. `PUBLIC_URL` w `.env` — adres, pod jakim inni mają nas widzieć (np. `https://mapa-bytom.local` albo IP w radiolinii). Bez niego ogłaszamy się bez adresu i sąsiad musi wpisać go ręcznie.

## Awarie i zegary

- Węzeł bez sąsiadów → `TRYB WYSPA`, wszystko działa lokalnie, kolejka czeka.
- HLC odrzuca wiersze z czasem > 10 min w przyszłość (`CLOCK_SKEW_MS`). Węzeł bez RTC po restarcie ma zły zegar → jego nowe wiersze mogą przegrać merge. Patrz `docs/sprzet.md` (RTC / NTP z sąsiada).
- Kompromitacja klucza węzła: operatorzy sąsiadów klikają *Cofnij zaufanie*; wiersze z tym `source_node` przestają wchodzić. Wycofanie starych wymaga `blocked` z centrali albo ręcznego usunięcia.

## Zmienne

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `MESH_RELAY` | `1` | wypychaj też cudze zweryfikowane wiersze (z podpisem origin) |
| `MESH_DIRECTORY` | `1` | ogłaszaj i ucz się katalogu węzłów od zaufanych sąsiadów |
| `PUBLIC_URL` | pusty | adres tego węzła ogłaszany w katalogu |
| `PEERS` / `CENTRAL_URL` | pusty | sąsiedzi z konfiguracji (nadal działają, zaufanie i tak w UI) |

## Co dalej (nie zbudowane)

- Transport radiowy o małej przepustowości (Meshtastic/LoRa): dziś protokół to HTTP+JSON, batch 200 wierszy. Dla LoRa trzeba osobnego, skompresowanego strumienia „tylko nagłówki zmian” i pobierania treści po Wi-Fi.
- Automatyczne podpowiadanie zaufania na podstawie liczby poręczeń (dziś: poręczenie daje tylko wpis w panelu, zaufanie zawsze ręczne).
- Podpisywanie katalogu (dziś katalog jest wiarygodny tylko dlatego, że przyszedł z zaufanego, uwierzytelnionego połączenia).

## Co jest sprawdzane automatycznie

`docker-compose.mesh.yml` stawia dwa równorzędne węzły bez centrali, a `tests/integration/mesh.mjs`
sprawdza cztery rzeczy: punkt wędruje z A do B z podpisem węzła źródłowego, potrzeba nie opuszcza
węzła (ani sama, ani wypchnięta wprost), zaufany sąsiad nie może podszyć się pod węzeł, który tylko
poręczył, a po zaufaniu temu węzłowi ten sam rekord wchodzi normalnie. Osobne zadanie w CI.
