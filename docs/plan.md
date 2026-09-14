# Plan rozwoju

Stan na 14 września 2026, po scaleniu P0 i warstwy mesh do `main`.

Kolejność wynika z jednego kryterium: czy dana rzecz zmienia to, czy mapa zadziała
w prawdziwym kryzysie. Ładne, ale nieistotne dla tego pytania, czeka.

## Etap 1 — uszczelnić zaufanie w sieci węzłów

**Problem.** Klucz poznany przez poręczenie sąsiada trafiał do tabeli `peers` jako niezaufany,
ale weryfikacja podpisu pochodzenia używała każdego klucza z tej tabeli. Zaufany sąsiad mógł
wymyślić nieistniejący węzeł, ogłosić dla niego klucz, który sam kontroluje, i wstrzykiwać
zweryfikowane punkty na cudze mapy. Węzły o znanym już kluczu były chronione zasadą pierwszego
kontaktu, ale nowe nie.

**Rozwiązanie.** Podpis pochodzenia weryfikujemy wyłącznie kluczami węzłów zaufanych wprost.
Katalog zostaje narzędziem odkrywania: pokazuje operatorowi, kto jeszcze jest w sieci, i podaje
adres oraz klucz do porównania. Wpuszczenie cudzych rekordów wymaga jednej ludzkiej decyzji,
zgodnie z resztą modelu zaufania w tym projekcie.

**Status: zrobione.** Reguła jest czystą funkcją z testami jednostkowymi, a scenariusz ataku
ma test integracyjny na dwóch węzłach.

## Etap 2 — dwa prawdziwe węzły w testach

**Problem.** Mesh miał testy jednostkowe katalogu i testy węzeł–centrala. Wymiana między dwoma
równorzędnymi węzłami nie była sprawdzona end to end, a to najnowszy i najmniej przećwiczony kod.

**Rozwiązanie.** `docker-compose.mesh.yml` stawia drugi pełny węzeł i sprawdza: zaufanie w obie
strony, wędrówkę zweryfikowanego punktu z podpisem, to że potrzeby nie opuszczają węzła, oraz
scenariusz podszycia się z etapu 1 przed zaufaniem i po nim.

**Status: zrobione.** Osobne zadanie w CI.

## Etap 3 — pętla potwierdzania

**Problem.** Mapa umie pokazać „niepotwierdzony od N dni”, ale nic nie zmusza nikogo do obchodu.
Bez tego mapa skłamie w ciągu roku, a kłamiąca mapa kryzysowa jest gorsza niż jej brak.

**Rozwiązanie.** Strona `/obchod` dla operatora: lista posortowana od najbardziej zaległych,
potwierdzenie jednym dotknięciem w terenie i wydruk listy do obejścia z miejscem na podpis.
Na stronie operatora widoczne przypomnienie, gdy są zaległości.

**Status: zrobione.**

## Etap 4 — dostęp w blackoucie

**Problem.** Żeby zobaczyć mapę, trzeba znać adres i być w dobrej sieci. W scenariuszu, dla którego
to powstało, jedno i drugie bywa nieprawdą.

**Rozwiązanie.** Węzeł odpowiada na adresy, którymi telefony sprawdzają dostęp do internetu, więc
po wejściu w sieć remizy telefon sam pokazuje okno z mapą. Do tego skrypt konfigurujący punkt
dostępowy na Raspberry Pi.

**Status: część w Caddy zrobiona i sprawdzona, skrypt punktu dostępowego wymaga weryfikacji
na sprzęcie.** Nie da się go przetestować bez Pi z kartą Wi-Fi.

## Etap 5 — transport radiowy

**Problem.** Protokół to dziś HTTP i JSON w paczkach po dwieście rekordów. Na łączu radiowym
o przepustowości rzędu setek bajtów na sekundę to nie przejdzie.

**Decyzja: świadomie odłożone.** Ma sens dopiero, gdy w powiecie stoją dwa działające węzły,
a ludzie na nie trafiają. Żeby nie zamykać sobie drogi, szkic protokołu skróconych nagłówków
zmian jest w [radio.md](radio.md).

## Co dalej, poza tym planem

- Import schronów i miejsc doraźnego schronienia z inwentaryzacji PSP (CSV, GeoJSON).
  Formularz już o tym wspomina, ścieżki importu nie ma. Zabiera gminę od pustej mapy do używalnej
  w jedno popołudnie.
- Ukraińska wersja językowa. Pliki tłumaczeń to jeden JSON, koszt mały, grupa odbiorców realna.
- Podział paczki frontendu. Jeden plik waży ponad megabajt, a wchodzi przez słabe Wi-Fi remizy.
- Naprawa `npm run test:en`, który wskazuje na nieistniejący skrypt.
