# Warstwa graficzna Obrony Cywilnej

Instrukcja podmiany znaczników i palety podkładki. **Nie** dokładaj CDN-ów czcionek ani sprite’ów w runtime — węzeł ma działać offline.

## Paleta (podkładka)

Plik: `web/public/style.json`. Fallback tych samych kolorów jest w `web/src/components/MapView.tsx` (`FALLBACK_LAYERS`), gdy brak `style.json`.

URL źródła w `style.json` (`pmtiles:///tiles/local.pmtiles`) jest **placeholderem**. `MapView` zawsze nadpisuje go plikiem z `/tiles/index.json` (na produkcji często `slask-z13.pmtiles`, maxzoom 13). Brak `poland.pmtiles` nie oznacza braku mapy.

Warstwy dróg malują Protomaps `kind`: `highway`, `major_road`, **`medium_road`**, `minor_road`. Bez `medium_road` znikają typowe ulice w mieście. Kontrast i grubość są strojone pod z12–z13 (telefon, słońce). Poza bbox pliku albo powyżej maxzoom nie ma gęstszej siatki — overzoom zostawia to, co jest.

| Element | Kolor |
| --- | --- |
| tło / ziemia | `#d7dee6` / `#d9e0e8` |
| woda | `#2f6a96` |
| budynki | `#8e9caa` |
| obwódka dróg | `#0a1e36` |
| wypełnienie autostrad | `#f2b632` |
| wypełnienie głównych / średnich / lokalnych | `#ffe08a` / `#fff4c8` / `#f7fafc` |
| etykiety | `#0a1e36` + halo `#f4f7fa` |

Glify (tylko Noto Sans Regular — inne kroje są mapowane na Regular przez `lib/glyphs.ts`) leżą lokalnie w `web/public/glyphs/{fontstack}/{range}.pbf`. URL w stylu:

```json
"glyphs": "/glyphs/{fontstack}/{range}.pbf"
```

Warstwy `road-labels` i `place-labels` muszą zostać. Po zmianie kolorów sprawdź kontrast na z12–z13 (remiza, jasny monitor). Nie wpisuj `Noto Sans Medium` — na węźle go nie ma.

## Skala

`WalkScaleControl` (`web/src/lib/walkScale.ts`): pasek metryczny (m/km) oraz czas pieszo przy ~5 km/h, z kreskami 5 min / 15 min gdy mieszczą się na pasku. Polski `aria-label`. Aktualizuje się przy zoomie.

## Znaczniki kategorii

Źródło: `web/public/icons/map/<kategoria>.svg`. Każda kategoria ma **własny kształt** (tarcza, bunkier, serce, kropla, bateria, romb, nakrętka, dymek) — nie jedną okrągłą plakietkę; kreska ~2 px, obrys `#0f2744`.

Ścieżki eksportuje `CATEGORY_ICONS` w `web/src/icons.ts`. Te same pliki idą do:

- MapLibre (`map.addImage` z SVG→canvas, nie per punkt),
- legendy, chipów filtrów, `cat-badge` w popupie i kolejkach.

Żeby podmienić ikonę: nadpisz SVG o tej samej nazwie (`odpornosc.svg`, `schron.svg`, `aed.svg`, `woda.svg`, `prad.svg`, `lacznosc.svg`, `przemysl.svg`, `potrzeba.svg`). Zachowaj `viewBox="0 0 32 32"` i atrybuty `width`/`height`, żeby rasteryzacja na mapie była ostra.

Kolory plakietek: `CATEGORY_COLORS` w `web/src/types.ts`.

Klastry zostają kółkami w granacie OC (`#1e3a5f`); plik `cluster.svg` jest wzorcem, nie jest wpinany jako `icon-image`.

Podgląd bez bazy: `/?demo=1` dokłada kilka punktów (ikony + skupisko AED do sprawdzenia klastrów po oddaleniu).

## Obwódka gotowości

Rysowana na rastrze ikony (MapLibre 4 nie ma kreskowanego `circle-stroke`):

- `pending` — niższa przezroczystość + kreskowana obwódka granatowa,
- `stale` — bursztynowa obwódka,
- `readiness=ok` gdy `autonomy_h >= 24` — zielona obwódka,
- pozostałe zweryfikowane — bez obwódki (sam kształt).

Obwódka jest rysowana **za** kształtem (`icons.ts`), więc działa z każdą sylwetką.

## Chrome UI

Zmienne w `web/src/styles.css`: `--navy`, `--paper`, `--bg`. Czerwień tylko dla wyspy / niebezpieczeństwa / licznika kolejki. Baner sync: granat, nie zieleń. PWA `theme_color`: `#1e3a5f` (`web/vite.config.ts`, `web/index.html`).

Po zmianie assetów: `npm run build` w `web/`. Nie pobieraj ponownie PMTiles ani nie ruszaj skryptów Dockera, chyba że dodajesz nowe glify (wtedy skopiuj PBF do `web/public/glyphs/`).
