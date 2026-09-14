# Architecture

Polski: [../architektura.md](../architektura.md)

## Premise

A node must work when nothing else does: no internet, no DNS, no central server, no GPS.
Everything needed to draw the map and accept a report sits on the node's own disk.
The network is an optional convenience, never a precondition.

That premise explains decisions that would otherwise look odd:

- the database is SQLite in a single container, not a cluster,
- map tiles are one PMTiles file on disk, not a tile server,
- map fonts, icons and the AED dataset ship inside the image, not from a CDN,
- synchronisation is asynchronous and convergent, with no locks and no primary node.

## Containers

| Service | Image / port | Role |
| --- | --- | --- |
| `caddy` | `caddy/Dockerfile`, 80/443 | the only entry point: static frontend, TLS, reverse proxy |
| `pocketbase` | `pocketbase/Dockerfile`, 8090 | SQLite, REST, access rules, JS hooks, serves `/tiles` from `pb_public/tiles` |
| `sync-worker` | `sync/Dockerfile`, 8091 | sync loop, `/sync/v1/*` API, Ed25519 keys, tiles, AED import |
| `tiles-agent` | `sync/Dockerfile`, host network | cuts PMTiles over HTTP Range; separate because containers often lack NAT |
| `web` | `web/Dockerfile` | frontend build; fills the `web_static` volume and exits |

Extra profiles: `central` (hub: `central-pocketbase`, `central-sync`, `central-caddy` on port 8092)
and `dev` (Vite on 5173 proxying to PocketBase).

## Caddy routes

```
/api/*       → pocketbase:8090     (REST, feed, status, config)
/_/*         → pocketbase:8090     (PocketBase admin UI)
/sync/v1/*   → sync-worker:8091    (federation, tiles, AED, USB bundles)
/tiles/*     → pocketbase:8090     (PMTiles files; NO gzip, Range must work)
/ca.crt      → CA certificate      (TLS_MODE=internal only)
/*           → /srv + SPA fallback (static frontend)
```

`encode gzip` is deliberately disabled for `/tiles/*`. Compression breaks range requests, and
PMTiles relies on nothing else.

## Frontend

React 18 + Vite, `react-router-dom`, MapLibre GL with the `pmtiles://` protocol.
No CDN: fonts, icons and styles live in `web/public`.

- `MapView.tsx` — the only place that constructs a map. It builds the style, repoints the PMTiles
  source at the file actually present on the node, forces an available font, then adds point layers,
  the scale bar and the GPS control.
- `lib/tiles.ts` — locates the tile file (`/tiles/index.json`, then known names) and reads the
  bounding box and max zoom from the PMTiles header.
- `lib/glyphs.ts` — the `ocglyphs://` protocol. When a style asks for a missing font or glyph range,
  it substitutes an available one or an empty but valid buffer. Without this the SPA fallback returns
  HTML and MapLibre drops the whole label tile.
- `lib/queue.ts` — IndexedDB. A report submitted with no connectivity waits here and reaches the
  database when the link returns.
- `vite.config.ts` — PWA (Workbox). App shell precached, `/tiles/*` set to `NetworkOnly`.

## Backend: PocketBase and hooks

Domain logic lives in JS hooks (`pb_hooks/`), not in the client. The client may send anything;
the hook overwrites every sensitive field regardless.

- `points_handlers.create` — assigns `id` (UUIDv7), `source_node`, status (`pending` unless the author
  is staff), HLC and `field_hlc`, computes public coordinates, checks the critical-infrastructure
  denylist, rejects photos carrying GPS EXIF, sets the TTL for needs.
- `points_handlers.update` — controls who may change status, recomputes per-field HLC, records who
  confirmed the point, and restricts a trusted neighbour on a need to `assigned_to` and `resolved_at`.
- `points_handlers.remove` — does not delete the row. It sets `deleted_at` (a tombstone) so the
  deletion propagates instead of being resurrected on the next sync.
- `points_handlers.enrich` — hides `lat`/`lon`, the operator contact and `created_by` from the public.
- `routes_handlers` — `/api/feed.geojson` (ETag, 30-second cache), `/api/status`, `/api/config`.
- `cron.pb.js` — expires needs every minute, refreshes counters every two minutes.

## Node identity and signatures

On first start `sync-worker` generates an Ed25519 keypair into the `node_keys` volume
(`node.key`, `node.pub`). The private key never leaves the node and never travels on the USB stick
that carries data.

Every verified record is signed over canonical JSON (`shared/canonical.mjs`), excluding local-only
fields (`sig`, `relay_sig`, `created_by`, `contact_operator`, `photo`, `assigned_to`).
The `sig` signature belongs to the originating node and travels with the record through any number
of relays. `relay_sig` is the hub's signature over a foreign row and is used only in hub deployments.

The key fingerprint is three groups of eight hexadecimal characters. Operators read it aloud over
the phone or radio before clicking **Trust**.

## Clock and merge

The clock is an HLC (hybrid logical clock): `<ms, 13 digits>-<counter, 4 hex>-<node_id>`.
State lives in the `hlc_state` singleton. The tick is monotonic, so a system clock jumping backwards
(a Raspberry Pi without an RTC module) does not corrupt event ordering.

A record carries one `hlc` plus a `field_hlc` map holding a separate stamp per field. The merge
(`shared/merge.mjs`) is a pure function and behaves as follows:

1. A record stamped more than 10 minutes in the future is quarantined, not stored.
2. Field by field: the newer stamp wins; ties break alphabetically on `source_node`.
3. A local record still `pending` never loses to a remote one; it is flagged as a conflict instead.
4. A tombstone (`deleted_at`) competes with an edit by stamp; the newer one wins.
5. Local `lat`/`lon` are protected while the record belongs to this node. A remote node cannot move
   someone else's point.
6. `created_by` and `contact_operator` are never accepted from the network.
7. `blocked = true` is accepted only from a trusted hub.

The merge is idempotent, so echo (your own record returning via a neighbour) is harmless and loops
in the connection graph do no damage.

## Synchronisation and mesh

Every `SYNC_INTERVAL_S` seconds a node polls each trusted neighbour:
`health` → learn the node directory → `pull` → `push` → `status`.
The cursor is an HLC, not server time. A neighbour that fails gets exponential backoff up to five
minutes while the rest of the network keeps working.

The trust model, relaying and node directory are described in [mesh.md](mesh.md).

## Map tiles

`tiles-agent` runs on the host network and cuts a fragment of the daily Protomaps build over HTTP
Range, because Docker containers on some hosts have no NAT. The finished file lands in `./tiles`,
which PocketBase serves under `/tiles`. The filename is free-form: the frontend reads
`/tiles/index.json` and takes coverage and max zoom from the PMTiles header.

## What is deliberately absent

- Message queues, brokers, Redis. SQLite holds state and synchronisation is polling.
- An address geocoder. The address is free text; the location is picked on the map.
- An alerting system. This is a resource map, not a public warning service.
- Multicast and mDNS. A radio link needs an explicit address anyway, and Docker frequently drops multicast.
