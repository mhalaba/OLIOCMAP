# Mapa Kryzysowa (Crisis Map)

**Polski: [README.md](README.md) · Documentation: [docs/](docs/README.md)**

A local civil-protection map for a single municipality. It shows where to find water, a socket to
charge a phone, a shelter, a defibrillator, a workshop, and the people who will open the door when
the power goes out. The node usually sits in a volunteer fire station or the municipal office and
**works with no internet, no central server and no GPS**.

Residents open the map on a phone over the fire station's Wi-Fi or a local network. They install
nothing, need no account to look, and need no mobile coverage.

The interface is Polish only, because it is built for Polish municipalities and volunteer fire
brigades. This document and the English documentation exist for integrators, reviewers and anyone
adapting the project elsewhere.

## What it is not

- Not an alerting system. National warning services run separately; this map does not replace them.
- It does not plan evacuation routes and it issues no orders.
- It does not map critical infrastructure. Power plants, substations, pipelines, fuel depots and
  military sites are rejected by the server, with no admin exemption.
- Not a cloud service. No central account, no subscription, no telemetry.

"Resilience Point" is a product name borrowed from Ukrainian practice, not a legal term.

## Who uses it

| Role | What they do |
| --- | --- |
| resident | looks at the map, reports a point or an error |
| trusted | fire brigade and municipal staff: sees need reports, takes them, closes them |
| operator | verifies submissions, confirms readiness, manages tiles and neighbours |
| admin | creates accounts and grants roles |

Legal responsibility sits with the mayor as the civil-protection authority; in practice the node is
run by the volunteer fire brigade.

## What it does

**Offline map.** The basemap is a single PMTiles file on the node's disk. Once downloaded, the map
never calls the internet. Outside the downloaded area it says so plainly instead of showing a void.

**Point categories.** Resilience points, shelters, defibrillators, water, charging and power,
communications, and industrial backup (workshop, welding, storage, generator).

**Readiness, not mere existence.** A point records when it opens (always, after an alert, or after
N hours without power), how many hours it can run unsupported, and when somebody last checked it.
The map shows **unconfirmed for N days**, because a facility that is ready on paper is not ready.

**Who confirmed it.** Each point shows the initials and organisation of whoever admitted it, for
example "J.K., OSP Szombierki". Local trust is built on names, not on a status flag.

**Neighbours' needs.** A need report (medicine, water, evacuation) reaches trusted users and the fire
brigade, never the public map and never another node. Whoever can help taps "I'll take it", and
others see that it is covered.

**Reporting in seconds.** A **pin** button turns on a crosshair: you move the map, see the coordinates
and tap **report here**. Long-pressing the map does the same. An account is required only at save time,
and whatever was typed survives the login.

**Search without internet.** One field searches both the points (name, address, category) and the
street and place names taken from the downloaded map. There is no geocoder, so nothing leaves the
node and nothing stops working when the link is cut. The basemap carries no house numbers, and streets
cover the area that has already loaded. The same list offers **my location**, to see where you stand.

**Offline on the phone.** After one visit the app works without a network, and a report submitted
offline waits on the phone and reaches the node when connectivity returns.

**A4 printout.** A map of the municipality with points, a QR code to the node, and a list. For people
who will not install anything: the fire station, the shop, the parish noticeboard.

**Node network.** Neighbouring municipalities exchange verified points directly. When a link drops,
each node keeps working alone and catches up later. With no link at all, a USB bundle remains.

## Getting started

```bash
cp .env.example .env
# set NODE_ID, NODE_NAME, NODE_GMINA_*, superuser passwords
docker compose up --build
```

Map: `http://<node-ip>/`. Operator queue: `/operator`. Accounts: `/admin`.
Node state and tiles: `/status`. PocketBase admin UI: `/_/`.

Demo accounts (**delete before going live**): `admin@demo.local`, `operator@demo.local`,
`mieszkaniec@demo.local`, password `demo12345`. The PocketBase superuser comes from `.env` and is
not an application account.

Full variable reference, HTTPS, backups and troubleshooting: [docs/en/operations.md](docs/en/operations.md).

## Offline map

On the **Node** page (operator): download the municipality, the voivodeship or the whole country.
The node cuts a fragment of the current daily Protomaps build over range requests and stores a
PMTiles file in `./tiles`. A municipality at zoom 14 is tens of megabytes, which is enough for a
fire station.

Without internet, upload a PMTiles file from a USB stick, or build one on the host:

```bash
scripts/make-tiles.sh
```

The filename is free-form. The app reads `/tiles/index.json` and takes coverage and maximum zoom
from the file header. Attribution: © OpenStreetMap, Protomaps.

Three traps that have taken the map down before are documented in
[docs/en/operations.md](docs/en/operations.md): a font missing from the glyph directory, a service
worker caching tiles, and `background-color` on a `fill` layer.

## Node network

An operator adds a neighbour at `/operator/wezly` (identifier and address), compares the key
fingerprint over the phone or radio, and clicks Trust. Trusted neighbours advertise their directory
of known nodes, so further municipalities appear by themselves and wait only for a decision.

Every verified record is signed with the Ed25519 key of the node where it was created, and the
signature travels with it through relays. A relay cannot alter the content. Need reports never leave
a node. Details: [docs/en/mesh.md](docs/en/mesh.md).

A hub is optional (`docker compose --profile central up --build`). It holds one extra power: it can
hide a point network-wide. User accounts are always node-local and are never synchronised.

## What happens during an outage

1. Cut the network (`scripts/chaos.sh down-central`).
2. Within about a minute an island-mode banner appears.
3. Login, submissions and verification keep working against the local database.
4. Once the network returns, records usually catch up within a minute.
5. With no network at all, the operator exports a USB bundle and a neighbour imports it after
   comparing key fingerprints.

## Privacy and OPSEC

A public map is also information for anyone looking for targets. Communications sites and privately
hosted power are therefore shown at municipality precision, with deterministic jitter rather than a
kilometre grid. Photos carrying GPS data are rejected, and communications points carry no photos at
all. Nothing is public before an operator verifies it.

The data controller is the entity named in `NODE_OPERATOR_NAME` (see `/prywatnosc`). Need reports
live 72 hours, then expire; seven days later personal fields are wiped.

Details: [docs/opsec.md](docs/opsec.md) (Polish).

## Hardware

Raspberry Pi 5 (8 GB) or a mini PC, 32 GB of storage, a UPS and **an RTC module**. Without an RTC the
clock returns to 1970 after a power cut and breaks synchronisation. Details:
[docs/sprzet.md](docs/sprzet.md) (Polish).

## Tests

```bash
docker compose --profile central -f docker-compose.yml -f docker-compose.test.yml \
  up --build --abort-on-container-exit --exit-code-from test-runner
```

Without Docker: `cd tests && node --test unit/*.test.mjs`, `node scripts/check-schema.mjs`,
`cd web && npm run build`.

End-to-end scenarios cover registration, verification, island mode, signatures after the network
returns, the offline queue, coordinate rounding for communications points, need retention, rejecting
an unknown node, and the absence of English labels in the interface.

## Known limitations

- Not built (deferred scope): Wi-Fi captive portal, mDNS `mapa.local`, pasting national alerts,
  local-network node discovery, SMS gateway.
- Low-bandwidth radio transport (LoRa, Meshtastic) is unsupported; the protocol is HTTP and JSON.
- Photos with GPS data are rejected rather than stripped.
- No "open now" evaluation from `opening_hours`, and no municipality assignment from administrative
  boundaries.
- Polish-only interface; a Ukrainian locale is planned.
- The service worker needs HTTPS or localhost.
- On some hosts the Docker bridge blocks inter-container traffic: `sudo scripts/fix-docker-icc.sh`.
- A clock without an RTC module breaks synchronisation.

## Licence and data

Basemap: © OpenStreetMap (ODbL), tiles by Protomaps. Defibrillators: OpenAEDMap, built on
OpenStreetMap data. Data entered on a node belongs to the municipality that runs it.
