# API

Polski: [../api.md](../api.md)

Everything goes through Caddy on the node's port 80/443. Two backends: PocketBase under `/api`
and `/_`, sync-worker under `/sync/v1`. Tile files live under `/tiles`.

## Authentication

Accounts are local to a node. Login is plain PocketBase:
`POST /api/collections/users/auth-with-password` with `{identity, password}`.
The token comes back in the `token` field and is sent in the `Authorization` header afterwards.

Operator-facing `/sync/v1/*` endpoints check that same token: sync-worker calls PocketBase
(`auth-refresh`) and admits only the `operator` and `admin` roles, or a PocketBase superuser.

Federation endpoints use no tokens. They identify the peer by the `X-Node-Id` header, and data
trustworthiness rests on the Ed25519 signature of each row, not on connection authentication.

## PocketBase

### `GET /api/feed.geojson`

The public map layer. No authentication.

Returns a `FeatureCollection`. Skips unverified, blocked, deleted records, the `potrzeba` (need)
category and points with `public_geom = hidden`. Coordinates are always `public_lat` / `public_lon`,
that is rounded and jittered wherever OPSEC requires it.

Headers: `ETag`, `Cache-Control: public, max-age=30`. The response is memoised for 30 seconds;
a matching `If-None-Match` yields `304`.

Feature properties: `id`, `category`, `title`, `services`, `host_type`, `hours`, `activation`,
`activation_hours`, `autonomy_h`, `capacity`, `status`, `source_node`, `last_confirmed_at`,
`verified_at`, `verified_by_name`, `confirmed_by_name`, `stale`, `public_geom`.

### `GET /api/status`

Node state for the **Node** page and for neighbours. It also triggers need expiry as a side effect.

```json
{
  "node_id": "bytom-01", "node_name": "OSP Bytom-Szombierki", "role": "node",
  "gmina": "Bytom", "gmina_teryt": "2462011", "operator_name": "OSP Bytom-Szombierki",
  "registration_mode": "open", "mode": "wyspa",
  "last_pull": "", "last_push": "", "last_error": "",
  "peers": [{ "node_id": "radzionkow-01", "ok": true, "last_seen": "…", "trusted": true }],
  "counts": { "by_category": {}, "by_status": {} },
  "potrzeba_open": 0, "version": "0.1.0", "tls_mode": "internal", "public_key": "…"
}
```

`mode` is either `wyspa` (island: no neighbour reachable) or `sync`.

### `GET /api/config`

Startup data for the app: `node_id`, `node_name`, `gmina`, `role`, `registration_mode`,
`operator_name`, `confirm_interval_days`, `tls_mode`.

### `GET /api/health`

PocketBase's built-in health endpoint, used by container healthchecks.

### `/api/collections/<collection>/records`

Standard PocketBase REST with the access rules described in [data-model.md](data-model.md).
Collections: `users`, `points`, `peers`, `sync_log`, `node_status`, `audit`, `reports`, `invites`.

Rules are enforced server-side, and hooks overwrite sensitive fields regardless of what the client
sends. The fields `lat`, `lon`, `contact_operator`, `created_by` and `field_hlc` are hidden from
anyone below operator role.

### `/_/` and `/api/backups`

PocketBase admin UI and the backup API. PocketBase superuser only, meaning the account from `.env`,
not an application account.

## sync-worker (`/sync/v1`)

### `GET /sync/v1/health`

Unauthenticated. The node's calling card and the entry point into the network.

```json
{
  "node_id": "bytom-01", "role": "node", "time_ms": 1789377600000,
  "public_key": "MCowBQYDK2Vw…", "version": "0.1.0",
  "mesh": { "relay": true, "directory": true },
  "known_nodes": [{ "node_id": "radzionkow-01", "public_key": "…", "base_url": "https://…", "role": "node" }]
}
```

`known_nodes` holds the node itself plus its trusted neighbours with their keys. An empty list means
the directory is off (`MESH_DIRECTORY=0`) or there are no trusted neighbours yet.

### `GET /sync/v1/changes?since=<hlc>&limit=<1..200>`

Requires an `X-Node-Id` header naming a **trusted** peer. Otherwise `403`.

Returns `{ "rows": [...], "next_cursor": "<hlc>" }`. Only verified records leave the node, and the
`potrzeba` category never does. The `since` cursor is rewound by one second so records with nearly
identical stamps are not skipped.

### `POST /sync/v1/changes`

Body: `{ "node_id": "<sender>", "rows": [ … ] }`, plus the `X-Node-Id` header.

An unknown sender causes a `peers` row with `trusted=false` and gets `403` — this is how the operator
sees it in the panel and can trust it after comparing fingerprints. A known but untrusted sender gets
`403` with no write.

Every row is checked against the originating node's signature. Response:
`{ "accepted": <n>, "rejected": [{ "id", "error" }] }`.

### `POST /sync/v1/status`

Body as returned by `GET /api/status`. A hub stores every node's state. A plain node stores only
trusted neighbours and answers everyone else with `{ "ok": true, "ignored": true }`.

### Tiles (operator)

| Method and path | Meaning |
| --- | --- |
| `GET /sync/v1/tiles/status` | `{ files: [{name, bytes}], job, presets: {gmina, wojewodztwo, polska}, source }` |
| `POST /sync/v1/tiles/download` | `{ preset: "gmina" \| "wojewodztwo" \| "polska" }`, answers `202` with job state |
| `POST /sync/v1/tiles/upload` | raw PMTiles file in the request body (USB path) |

A job carries `state` (`idle`, `running`, `ok`, `error`), `preset`, `error`, `file`, `bytes`,
`startedAt`, `source`.

### AED (operator)

| Method and path | Meaning |
| --- | --- |
| `GET /sync/v1/aed/status` | `{ state, total, done, skipped, error, source }` |
| `POST /sync/v1/aed/import` | `{ source: "bundled" \| "fetch", bbox?: "minLon,minLat,maxLon,maxLat" }`, answers `202` |

An import already running returns `202` with current state instead of starting a second one.

### USB bundle (operator)

`GET /sync/v1/export.bundle` returns `application/gzip` named `mapa-<node_id>-<date>.json.gz`.
Inside: `node_id`, `public_key`, `exported_at`, `rows` and `bundle_sig`. Needs are never bundled.

`POST /sync/v1/import.bundle` accepts that file (gzip or plain JSON). If the originating node is
unknown it creates a `peers` row and returns `409` with the key fingerprint to compare. If known but
untrusted, `403` with the fingerprint. Once trusted: `{ "ok": true, "applied": <n> }`.

## `/tiles`

`GET /tiles/index.json` — list of PMTiles files present on the node, written after a download or upload.
`GET /tiles/<file>.pmtiles` — the tile file. It must serve range requests and must not be compressed
by Caddy, because PMTiles reads nothing but fragments.

## Response codes

| Code | When |
| --- | --- |
| `304` | `/api/feed.geojson` with a matching `If-None-Match` |
| `400` | missing `node_id`, bad file, content rejected by the denylist or validation |
| `403` | untrusted node, missing operator role, registration closed |
| `409` | USB bundle from a node whose key is unknown (the fingerprint is in the response) |
| `202` | background job accepted (tiles, AED) |

The sync client additionally tolerates a `409` carrying a `row` field when pushing changes, but the
current server never sends that response.
