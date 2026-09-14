# OPSEC i kategorie

Publiczna mapa to dane o celach. Generatory, terminale Starlink, składy paliw i węzły łączności były rażone. Dlatego:

- `lacznosc` i prywatny prąd: domyślnie geometria gminy (`PUBLIC_GEOM_MODE=gmina`), jitter ±0,005°, nie siatka kilometrowa.
- Operator może wymusić `precise` tylko przy `civilians_ok` — i powinien mieć powód.
- Zakaz zdjęć dla `lacznosc`. Inne zdjęcia: odrzut plików z GPS EXIF.
- Denylist tytułów (bez wyjątku admina): elektrownia, elektrociepłownia, EC, GPZ, stacja transformatorowa, rozdzielnia, gazociąg, tłocznia, magazyn/baza paliw, rafineria, oczyszczalnia, ujęcie wody (wyjątek: kategoria woda + gospodarz gmina), zakład chemiczny, jednostka wojskowa, koszary, poligon, radar, maszt, serwerownia, węzeł telekomunikacyjny, brama zakładu, portiernia, magazyn broni, WKU, WCR.
- `potrzeba` nigdy w `/api/feed.geojson` ani na mapie publicznej i nigdy między węzłami (ani relay, ani paczka USB). Widzą ją: zgłaszający, operatorzy i **zaufani sąsiedzi** (rola `zaufany`) — jako listę bez współrzędnych; zaufany może ją wziąć („Biorę to”), oddać i zamknąć swoją. TTL 72 h, potem 7 dni i czyszczenie pól. Na centralę idzie tylko licznik.
- Kto potwierdził: `verified_by_name` / `confirmed_by_name` to inicjały + organizacja (np. „J.K., OSP Szombierki”), nigdy pełne nazwisko ani kontakt.
- Nic nie jest publiczne przed weryfikacją operatora. Rekord wychodzący z węzła jest podpisany kluczem origin. Centrala nie podrabia cudzych wierszy (tylko `relay_sig` i flaga `blocked`).
- `blocked` z zaufanej centrali wygrywa z lokalnym HLC.

## Punkt gotowy na papierze

Doświadczenie z Kijowa (2025): zamknięte przedszkola, brak paliwa, internet padający z siecią, kartka „otwarte po 24 h bez prądu”. W rekordzie są `activation` (w tym po N godzinach bez prądu), `autonomy_h`, `last_confirmed_at`. Operator ma jeden przycisk **Potwierdź działanie**. UI pokazuje **Niepotwierdzony od N dni**.
