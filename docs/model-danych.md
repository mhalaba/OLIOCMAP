# Model danych

English: [en/data-model.md](en/data-model.md)

Schemat powstaje z migracji w `pb_migrations/`. Te same nazwy pól występują w hookach
(`pb_hooks/`), w synchronizacji (`sync/`, `shared/`) i w typach frontendu (`web/src/types.ts`).
Skrypt `scripts/check-schema.mjs` pilnuje, żeby nie rozjechały się między tymi miejscami.

## Kolekcje

| Kolekcja | Zawartość |
| --- | --- |
| `users` | konta lokalne węzła: rola, organizacja, kod zaproszenia |
| `points` | wszystko, co widać na mapie, oraz zgłoszenia potrzeb |
| `peers` | sąsiednie węzły: klucz publiczny, adres, zaufanie, kursory synchronizacji |
| `sync_log` | dziennik pull / push / health, przycinany do 2000 wpisów |
| `node_status` | stan własny (singleton `self00000000000`) i stan zapamiętanych sąsiadów |
| `audit` | kto zweryfikował, odrzucił, potwierdził albo skasował punkt |
| `reports` | zgłoszenia błędów od mieszkańców |
| `invites` | kody zaproszeń przy `REGISTRATION_MODE=invite` |
| `hlc_state` | stan zegara hybrydowego (singleton) |

Klucz główny w PocketBase musi mieć 15–40 znaków `[a-z0-9-]`. Frontend nadaje UUIDv7, a singletony
mają stałe `self00000000000`.

## `points`

Jedna kolekcja obsługuje dwa byty: zasób na mapie oraz zgłoszenie potrzeby (`category = "potrzeba"`).
Różni je widoczność, retencja i to, że potrzeby nigdy nie opuszczają węzła.

### Koperta synchronizacyjna

| Pole | Znaczenie |
| --- | --- |
| `source_node` | węzeł, na którym rekord powstał; niezmienny |
| `hlc` | znacznik hybrydowy całego rekordu |
| `field_hlc` | mapa `pole → hlc`, podstawa scalania per pole |
| `updated_at` | czas ostatniej zmiany |
| `deleted_at` | nagrobek; niepuste znaczy skasowany |
| `sig` | podpis węzła źródłowego nad kanonicznym JSON-em |
| `relay_sig` | podpis centrali nad cudzym wierszem |
| `conflict` | lokalna edycja wygrała ze zdalną, operator powinien spojrzeć |
| `schema_version` | obecnie `2` |

### Treść

`category`, `title` (3–80 znaków), `description` (do 1000), `address`, `hours`, `opening_hours`,
`host_type`, `services`, `link_type`, `capability`, `capacity`, `photo`, `photo_sha256`.

### Położenie

| Pole | Znaczenie |
| --- | --- |
| `lat`, `lon` | dokładne; widoczne tylko dla operatora |
| `public_lat`, `public_lon` | to, co trafia na mapę i do feedu |
| `public_geom` | `precise`, `gmina` albo `hidden` |
| `gmina_teryt`, `gmina_name` | gmina węzła, uzupełniane automatycznie |

`gmina` oznacza zaokrąglenie do dwóch miejsc po przecinku plus deterministyczne rozmycie ±0,005°
liczone z identyfikatora rekordu. Rozmycie jest powtarzalne, więc punkt nie skacze przy każdym
odświeżeniu, i nie jest siatką kilometrową, z której dałoby się odtworzyć pozycję.

Domyślnie `precise`, ale kategoria `lacznosc` oraz prywatny `prad` dostają wartość z `PUBLIC_GEOM_MODE`
(domyślnie `gmina`), a `potrzeba` zawsze `hidden`.

### Stan i gotowość

| Pole | Znaczenie |
| --- | --- |
| `status` | `pending`, `verified`, `rejected`, `expired` |
| `blocked` | ukrycie wymuszone przez centralę |
| `activation` | `stale`, `po_alarmie`, `po_godzinach_bez_pradu` |
| `activation_hours` | po ilu godzinach bez prądu punkt rusza |
| `autonomy_h` | ile godzin działa bez sieci zewnętrznej |
| `verified_by_node`, `verified_at` | kto i kiedy dopuścił punkt na mapę |
| `verified_by_name`, `confirmed_by_name` | inicjały i organizacja, np. „J.K., OSP Szombierki” |
| `last_confirmed_at`, `confirm_interval_days` | podstawa etykiety „Niepotwierdzony od N dni” |
| `external_ref` | pochodzenie importu, np. `osm:node/123` |

`verified_by_name` i `confirmed_by_name` powstają w hooku z pól `name` i `org_name` konta. Pełne
nazwisko nigdy nie trafia na mapę.

### Potrzeby

`need_type`, `people`, `urgency`, `assigned_to`, `resolved_at`, `expires_at`, `ttl_purged`.

Cykl życia: zgłoszenie żyje `POTRZEBA_TTL_H` godzin (domyślnie 72), potem cron ustawia `expired`.
Po kolejnych siedmiu dniach czyści treść i kontakty, ustawia tytuł „Zgłoszenie usunięte”
i `ttl_purged = true`.

## Role

| Rola | Może |
| --- | --- |
| `citizen` | zgłaszać punkty, widzieć własne oczekujące |
| `zaufany` | dodatkowo widzieć potrzeby, brać je i zamykać; opcjonalnie auto-weryfikacja (`AUTO_VERIFY_TRUSTED`) |
| `operator` | weryfikować, odrzucać, potwierdzać, zarządzać sąsiadami i kafelkami |
| `admin` | nadawać role i zakładać konta |

Rola nie przechodzi między węzłami. Konto założone w remizie A nie istnieje w remizie B.

## Reguły dostępu

Publicznie widać wyłącznie punkty zweryfikowane, niezablokowane, nieskasowane i spoza kategorii
`potrzeba`. Autor widzi swoje zgłoszenia. Rola `zaufany` widzi dodatkowo otwarte potrzeby.
Operator i administrator widzą wszystko.

Zapis: każde zalogowane konto może utworzyć punkt. Edytować może autor, dopóki punkt jest
`pending`, oraz personel. Zaufany przy potrzebie może zmienić wyłącznie `assigned_to` i `resolved_at`
— hook przywraca pozostałe pola z poprzedniej wersji rekordu.

Kasowanie to zawsze nagrobek, nigdy usunięcie wiersza.

## Co nie jest synchronizowane

`created_by`, `contact_operator`, `photo`, `assigned_to` oraz cała kategoria `potrzeba`.
Te dane zostają na węźle, na którym powstały. Listę pól wychodzących definiuje `SYNCABLE_FIELDS`
w `shared/constants.mjs`, a wyłączenia z podpisu `SIGN_EXCLUDE`.

## Słowniki

Wartości enumeracji są w jednym miejscu (`shared/constants.mjs`) i powielone w typach frontendu:
kategorie, usługi, rodzaje łączności, zdolności przemysłowe, typy gospodarza, tryby aktywacji,
statusy, geometrie publiczne, rodzaje potrzeb, pilności i role.
