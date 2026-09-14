# Running a node

Polski: [../eksploatacja.md](../eksploatacja.md)

For whoever has to deploy and keep a node alive: a fire brigade operator or a municipal IT person.

## First start

```bash
cp .env.example .env
# set NODE_ID, NODE_NAME, NODE_GMINA_*, superuser passwords
docker compose up --build
```

The node is at `http://<node-ip>/`. The PocketBase admin UI is at `/_/`.

The first start seeds demo accounts. **Delete them before going live**: `admin@demo.local`,
`operator@demo.local`, `mieszkaniec@demo.local`, all with the password `demo12345`.
The PocketBase superuser is a separate account from `.env` and is not meant for daily work.

## Environment variables

### Identity

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ID` | `bytom-01` | unique across the network, `[a-z0-9-]`; embedded in every HLC stamp |
| `NODE_ROLE` | `node` | `node` or `central` |
| `NODE_NAME` | `OSP Bytom-Szombierki` | name shown in the interface |
| `NODE_GMINA_NAME`, `NODE_GMINA_TERYT` | `Bytom`, `2462011` | municipality stamped onto new points |
| `NODE_OPERATOR_NAME` | same as `NODE_NAME` | data controller shown on the privacy page |

Changing `NODE_ID` after the first start breaks continuity: existing records stay attached to the old
node and neighbours still know the old key. Treat it like renaming a production server.

### Network and synchronisation

| Variable | Default | Meaning |
| --- | --- | --- |
| `PEERS` | empty | JSON `[{node_id, base_url}]`; point at the neighbour's Caddy, not its PocketBase |
| `CENTRAL_URL` | empty | shorthand that adds the `central-01` peer |
| `PUBLIC_URL` | empty | the address neighbours should reach us on (mesh directory) |
| `SYNC_INTERVAL_S` | `30` | seconds between cycles; minimum 5 |
| `MESH_RELAY` | `1` | forward other nodes' verified rows |
| `MESH_DIRECTORY` | `1` | advertise and accept the node directory |

### Safety and privacy

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_GEOM_MODE` | `gmina` | public geometry for communications and private power points |
| `REGISTRATION_MODE` | `open` | `open`, `invite` or `closed` |
| `AUTO_VERIFY_TRUSTED` | `false` | whether the trusted role publishes without the queue |
| `POTRZEBA_TTL_H` | `72` | hours a need report stays alive |
| `CONFIRM_INTERVAL_DAYS` | `14` | days before a point counts as unconfirmed |
| `TLS_MODE` | `off` | `off`, `internal`, `file` |

### Tiles and AED

`TILES_DIR`, `TILES_BBOX`, `TILES_MAXZOOM`, `PMTILES_SOURCE`, `TILES_AGENT_SOCK`,
`AED_IMPORT`, `AED_BBOX`, `AED_BUNDLE_PATH`. See below and the README.

## HTTPS

The service worker, and therefore offline mode, needs HTTPS or localhost. Options:

- `off` — plain HTTP. The app works, but there is no offline mode beyond the device itself.
- `internal` — Caddy issues its own CA. Residents install `/ca.crt`; instructions live at
  `/instalacja-certyfikatu`. The usual choice for a fire station.
- `file` — a municipal certificate from `TLS_CERT_FILE` and `TLS_KEY_FILE`. Obtain it **before**
  deployment; the node never fetches a certificate from the internet at runtime.

## Offline map

On the **Node** page (`/status`, operator): download the municipality, the voivodeship or Poland.
The node cuts a fragment of the current daily Protomaps build using range requests and writes a
PMTiles file into `./tiles`. The download runs through the `tiles-agent` container on the host network.

Sizes: a municipality at zoom 14 is tens of megabytes, and that is the recommended choice for a fire
brigade. All of Poland at high zoom is gigabytes.

With no internet: upload a PMTiles file from a USB stick. The filename is free-form (`slask-z13.pmtiles`,
a municipality, anything) — the app reads `/tiles/index.json` and takes coverage from the file header.
`style.json` does not assume `poland.pmtiles`.

Outside the file's area the map says so explicitly instead of showing an empty screen. Above the
file's maximum zoom, existing tiles are scaled up, so streets remain visible
(on a node with `slask-z13.pmtiles` the dense grid stops at z13).

## AED

At startup the node imports defibrillators from `data/openaedmap-pl.geojson.gz` (OpenStreetMap data
via OpenAEDMap). Records get a 365-day confirmation interval. **Confirm them on the ground** — OSM
data is often stale. `AED_IMPORT=off` disables the automatic import.

## Hub (optional)

A hub is not required. It grants one power: hiding a point network-wide (`blocked`), and relaying
between nodes that cannot see each other directly.

```bash
docker compose --profile central up --build
```

On the node, in `.env`: `CENTRAL_URL=http://central-caddy`, or an entry in `PEERS`.

1. On the node open `/status` as an operator and copy the public key.
2. On the hub (`http://<host>:8092/operator/wezly`) paste the key and click Trust.
3. Do the same in reverse: trust the hub from the node. The hub's key comes from
   `GET /sync/v1/health`.

Trust is granted per direction. The hub never authenticates other nodes' users — accounts are
always local.

## Development mode

```bash
docker compose --profile dev up
```

Vite on port 5173 proxying to PocketBase. To check the map style alone, with no tiles on a node,
run `npm run dev` in `web/` and open `/?demo=1&tiles=https://…/file.pmtiles` — the `tiles` parameter
is honoured in development mode only, and the remote file must support CORS and range requests.

## Traps when changing the map style

Four things that have taken the map down in production before:

1. **A font outside the glyph directory.** `web/public/glyphs` holds `Noto Sans Regular` and nothing
   else. A request for any other font is answered with `index.html` from the SPA fallback, MapLibre
   reports `Unimplemented type: 4`, and the whole label tile is dropped. The frontend forces an
   available font, but the on-disk style is still worth keeping honest.
2. **A service worker caching tiles.** `/tiles/*` must be `NetworkOnly` and must stay out of the
   precache. A `CacheFirst` strategy breaks range requests and the streets disappear.
3. **`background-color` on a `fill` layer.** MapLibre then treats the entire style as invalid and
   draws nothing. Only a `background` layer may carry a background colour.
4. **Road filters without `medium_road`.** Protomaps tags ordinary city streets as `medium_road`.
   The `roads` / `roads-casing` / `road-labels` layers must paint that `kind`, or at z12–z13 only
   the main corridors remain.

The palette and icons are described in [../ui-oc.md](../ui-oc.md) (Polish).

## Backups

```bash
scripts/backup.sh
```

The script calls the PocketBase backup API and keeps seven days in `./backups`. To restore: upload
the archive through `/api/backups`, or swap the `pb_data` volume with the container stopped.

Backups do not cover the node keys (the `node_keys` volume). Losing `node.key` means every neighbour
must trust a new key from scratch. Back the keys up separately and keep them off the USB stick that
carries data.

## Upgrading

```bash
git pull
docker compose up --build -d
```

PocketBase migrations run when the container starts. Take a backup first. After interface changes,
force a refresh on phones, because an old service worker can keep serving the previous build:
`Ctrl+Shift+R` or unregister it in the browser tools.

## Tests

```bash
docker compose --profile central -f docker-compose.yml -f docker-compose.test.yml \
  up --build --abort-on-container-exit --exit-code-from test-runner
```

Unit tests without Docker:

```bash
cd tests && node --test unit/*.test.mjs
node scripts/check-schema.mjs
cd web && npm run build
```

## When something breaks

### The map is blank or has no streets

1. Check that a tile file exists: `GET /tiles/index.json` should list a `.pmtiles` file.
2. Open the browser console. `Unimplemented type: 4` means a font or tile request was answered with
   an HTML page. The usual culprit is a stale service worker — unregister it.
3. Check that Caddy is not compressing `/tiles/*`. Compression breaks range requests.
4. Check whether the view has left the downloaded file's area.

### A neighbour is visible but nothing arrives

Look at `sync_log` on the Node page. The usual causes: trust granted on only one side (trust is
per-direction), a wrong `base_url` (point at the neighbour's Caddy, not its PocketBase), or clocks
that disagree.

### Records are quarantined over time

A stamp more than ten minutes in the future is rejected. Check the clock on both nodes. A Raspberry
Pi without an RTC module starts from 1970 after a power cut — see [../sprzet.md](../sprzet.md) (Polish).

### Containers can see each other but traffic does not pass

On some hosts the Docker bridge filters inter-container traffic. Then:

```bash
sudo scripts/fix-docker-icc.sh
```

### A submission is rejected on save

The critical-infrastructure denylist applies with no admin exemption. Check the title and description.
Photos carrying GPS EXIF and contacts that look like a national ID number are rejected too.

## Failure drills

```bash
scripts/chaos.sh down-central          # cut the hub off
scripts/chaos.sh up-central            # restore it
scripts/chaos.sh clock-skew <node> <±minutes>
scripts/chaos.sh fill-queue <n>
```

After the cut, an island-mode banner appears within about a minute, and adding and verifying points
keep working against the local database. After restoring, records usually catch up within a minute.
