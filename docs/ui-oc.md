# Warstwa graficzna Obrony Cywilnej

Instrukcja podmiany znaczników i palety podkładki. **Nie** dokładaj CDN-ów czcionek ani sprite’ów w runtime — węzeł ma działać offline.

## Paleta (podkładka)

Plik: `web/public/style.json`. Fallback tych samych kolorów jest w `web/src/components/MapView.tsx` (`FALLBACK_LAYERS`), gdy brak `style.json`.

| Element | Kolor |
| --- | --- |
| tło / ziemia | `#e8eef4` / `#e6edf4` |
| woda | `#5b8fb8` |
| budynki | `#b8c4d0` |
| obwódka dróg | `#1e3a5f` |
| wypełnienie dróg | `#ffffff` |
| etykiety | `#0f2744` + halo `#e8eef4` |

Glify (Noto Sans Regular / Medium) leżą lokalnie w `web/public/glyphs/{fontstack}/{range}.pbf`. URL w stylu:

```json
"glyphs": "/glyphs/{fontstack}/{range}.pbf"
```

Warstwy `road-labels` i `place-labels` muszą zostać. Po zmianie kolorów sprawdź kontrast na z11–z14 (remiza, jasny monitor).

## Znaczniki kategorii

Źródło: `web/public/icons/map/<kategoria>.svg` (okrągła plakietka, kreska ~2–2.5 px).

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
- pozostałe zweryfikowane — cienka obwódka granatowa.

## Chrome UI

Zmienne w `web/src/styles.css`: `--navy`, `--paper`, `--bg`. Czerwień tylko dla wyspy / niebezpieczeństwa / licznika kolejki. Baner sync: granat, nie zieleń. PWA `theme_color`: `#1e3a5f` (`web/vite.config.ts`, `web/index.html`).

Po zmianie assetów: `npm run build` w `web/`. Nie pobieraj ponownie PMTiles ani nie ruszaj skryptów Dockera, chyba że dodajesz nowe glify (wtedy skopiuj PBF do `web/public/glyphs/`).
