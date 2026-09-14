# Transport radiowy — szkic, nie implementacja

Ten dokument istnieje po to, żeby decyzje podejmowane dziś nie zamknęły drogi do łącza radiowego.
Kodu nie ma i świadomie na razie nie będzie: patrz [plan.md](plan.md), etap 5.

## Dlaczego obecny protokół tam nie wejdzie

Dziś węzeł wymienia dane przez HTTP i JSON, paczkami do dwustu rekordów. Jeden rekord punktu
to rząd 600–900 bajtów po serializacji, a do tego podpis Ed25519 w base64, czyli 88 bajtów.

Meshtastic na LoRa daje realnie rząd stu bajtów na sekundę przy dobrym zasięgu, z pakietem
użytkowym poniżej 240 bajtów. Pełna synchronizacja gminy to tam godziny, a przy pakietach
gubionych po drodze — nigdy.

## Co przenieść, a czego nie

Radio nie służy do przesyłania mapy. Służy do odpowiedzi na jedno pytanie: **czy u sąsiada
zmieniło się coś, o czym powinienem wiedzieć**. Treść dociera inną drogą: gdy ktoś pojedzie
do sąsiedniej remizy, gdy wróci Wi-Fi, albo pendrivem.

| Warstwa | Radio | Wi-Fi, kabel, pendrive |
| --- | --- | --- |
| Kto żyje i kiedy się odezwał | tak | tak |
| Liczniki: ile punktów, ile otwartych potrzeb | tak | tak |
| Nagłówki zmian: co się zmieniło i u kogo | tak | tak |
| Treść rekordu, geometria, zdjęcia | nie | tak |
| Zgłoszenia potrzeb | nigdy | nigdy między węzłami |

## Szkic ramki

Trzy typy komunikatów, każdy poniżej dwustu bajtów, w formacie binarnym, nie JSON.

**Puls** (wysyłany co kilkanaście minut, około 20 bajtów): identyfikator węzła skrócony do czterech
bajtów, znacznik czasu, liczba zweryfikowanych punktów, liczba otwartych potrzeb, stan zasilania.
Sam puls wystarcza, żeby na mapie sąsiada pokazać, że remiza w sąsiedniej gminie żyje.

**Skrót zmian** (na żądanie albo po zmianie, około 100–200 bajtów): lista skrótów rekordów, które
zmieniły się od podanego znacznika. Dla każdego rekordu osiem bajtów identyfikatora i cztery bajty
skrótu treści. Odbiorca wie, czego mu brakuje, i czego nie ma sensu prosić.

**Prośba o treść** (około 20 bajtów): identyfikator rekordu. Odpowiedź nie idzie radiem, tylko
trafia do kolejki „do wysłania przy najbliższym łączu”. Radio negocjuje, co przesłać; przesyła co innego.

## Czego nie wolno przy okazji zepsuć

- **Podpis zostaje.** Skrót treści w ramce nie zastępuje podpisu. Rekord bez ważnego podpisu węzła
  źródłowego nie wchodzi do bazy, niezależnie od tego, jak został zapowiedziany.
- **Radio nie nadaje zaufania.** Węzeł usłyszany w eterze to węzeł nieznany, dopóki operator nie
  porówna odcisku klucza. Tak samo jak przy katalogu przez HTTP.
- **Potrzeby nie wychodzą.** Również jako liczniki z podziałem na rodzaj, bo w małej gminie
  „jedna prośba o leki” bywa wskazaniem konkretnego domu.
- **Zegar.** Ramki niosą znacznik nadania, ale przy łączu z opóźnieniem minutowym nie wolno
  ich używać do korygowania zegara. Hybrydowy zegar logiczny sobie poradzi, czas ścienny nie.

## Kolejność prac, gdy przyjdzie na to czas

1. Kolejka wychodząca jako osobna tabela, niezależna od transportu. Dziś push czyta punkty wprost
   z bazy i zakłada, że sąsiad odpowie w tej samej sekundzie.
2. Binarna serializacja pulsu i skrótu zmian, z testami jednostkowymi na wielkość ramki.
3. Most do Meshtastic jako osobny proces, gadający z węzłem po HTTP na localhost. Dzięki temu
   sterownik radia nie wchodzi do sync-worker i można go wymienić na inny sprzęt.
4. Dopiero na końcu interfejs: na stronie Węzeł widok sąsiadów słyszanych radiem, osobno od tych
   osiągalnych przez sieć.

## Alternatywy warte rozważenia przed LoRa

- **Pendrive.** Działa dziś, przenosi wszystko i ma przepustowość, o jakiej radio nie marzy.
  Kurier na rowerze bywa najlepszym łączem w kryzysie.
- **PMR446 głosem plus wydruk.** Nie wymaga niczego od projektu, a w gminie i tak będzie używane.
- **Kabel między sąsiednimi budynkami.** Nudne i skuteczne, jeżeli remiza i urząd stoją blisko.
