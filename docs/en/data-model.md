# Data model

Polski: [../model-danych.md](../model-danych.md)

The schema is created by the migrations in `pb_migrations/`. The same field names appear in the hooks
(`pb_hooks/`), in synchronisation (`sync/`, `shared/`) and in the frontend types (`web/src/types.ts`).
`scripts/check-schema.mjs` guards against these drifting apart.

Field and enum values are Polish in the database, because the node's operators and its UI are Polish.
This document translates the meaning, not the identifiers.

## Collections

| Collection | Contents |
| --- | --- |
| `users` | node-local accounts: role, organisation, invite code |
| `points` | everything visible on the map, plus need reports |
| `peers` | neighbouring nodes: public key, address, trust flag, sync cursors |
| `sync_log` | pull / push / health journal, trimmed to 2000 entries |
| `node_status` | own state (singleton `self00000000000`) and remembered neighbour state |
| `audit` | who verified, rejected, confirmed or deleted a point |
| `reports` | error reports from residents |
| `invites` | invitation codes when `REGISTRATION_MODE=invite` |
| `hlc_state` | hybrid logical clock state (singleton) |

PocketBase primary keys must be 15–40 characters of `[a-z0-9-]`. The frontend issues UUIDv7, and
singletons use the fixed id `self00000000000`.

## `points`

One collection serves two things: a resource on the map, and a need report (`category = "potrzeba"`).
They differ in visibility, retention, and the fact that needs never leave the node.

### Sync envelope

| Field | Meaning |
| --- | --- |
| `source_node` | the node where the record was created; immutable |
| `hlc` | hybrid stamp for the whole record |
| `field_hlc` | map of `field → hlc`, the basis of per-field merging |
| `updated_at` | last modification time |
| `deleted_at` | tombstone; non-empty means deleted |
| `sig` | originating node's signature over canonical JSON |
| `relay_sig` | hub signature over a foreign row |
| `conflict` | a local edit beat a remote one; an operator should look |
| `schema_version` | currently `2` |

### Content

`category`, `title` (3–80 chars), `description` (up to 1000), `address`, `hours`, `opening_hours`,
`host_type`, `services`, `link_type`, `capability`, `capacity`, `photo`, `photo_sha256`.

Categories: `odpornosc` (resilience point), `schron` (shelter), `aed`, `woda` (water), `prad`
(power and charging), `lacznosc` (communications), `przemysl` (workshops and logistics),
`potrzeba` (need report).

### Location

| Field | Meaning |
| --- | --- |
| `lat`, `lon` | exact; visible to operators only |
| `public_lat`, `public_lon` | what reaches the map and the feed |
| `public_geom` | `precise`, `gmina` (municipality) or `hidden` |
| `gmina_teryt`, `gmina_name` | the node's municipality, filled in automatically |

`gmina` means rounding to two decimal places plus deterministic jitter of ±0.005° derived from the
record id. The jitter is reproducible, so a point does not jump on every refresh, and it is not a
kilometre grid from which the true position could be recovered.

The default is `precise`, but the `lacznosc` category and privately hosted `prad` take the value of
`PUBLIC_GEOM_MODE` (default `gmina`), and `potrzeba` is always `hidden`.

### State and readiness

| Field | Meaning |
| --- | --- |
| `status` | `pending`, `verified`, `rejected`, `expired` |
| `blocked` | hidden by hub decision |
| `activation` | always open, opens after an alert, or opens after N hours without power |
| `activation_hours` | how many hours without power before the point opens |
| `autonomy_h` | hours it can run without outside utilities |
| `verified_by_node`, `verified_at` | who admitted the point to the map and when |
| `verified_by_name`, `confirmed_by_name` | initials and organisation, e.g. "J.K., OSP Szombierki" |
| `last_confirmed_at`, `confirm_interval_days` | drive the "unconfirmed for N days" label |
| `external_ref` | import provenance, e.g. `osm:node/123` |

`verified_by_name` and `confirmed_by_name` are derived in the hook from the account's `name` and
`org_name`. A full surname never reaches the map.

### Needs

`need_type`, `people`, `urgency`, `assigned_to`, `resolved_at`, `expires_at`, `ttl_purged`.

Lifecycle: a report lives `POTRZEBA_TTL_H` hours (72 by default), then cron sets `expired`.
Seven days later it wipes the text and contacts, sets the title to "report deleted" and
`ttl_purged = true`.

## Roles

| Role | May |
| --- | --- |
| `citizen` | submit points, see their own pending ones |
| `zaufany` (trusted) | additionally see needs, take them and close them; optional auto-verification (`AUTO_VERIFY_TRUSTED`) |
| `operator` | verify, reject, confirm, manage neighbours and tiles |
| `admin` | grant roles and create accounts |

Roles do not travel between nodes. An account created at fire station A does not exist at station B.

## Access rules

The public sees only points that are verified, not blocked, not deleted and outside the `potrzeba`
category. Authors see their own submissions. The `zaufany` role additionally sees open needs.
Operators and admins see everything.

Writing: any signed-in account may create a point. It may be edited by its author while still
`pending`, and by staff. On a need, a trusted user may change only `assigned_to` and `resolved_at` —
the hook restores every other field from the previous revision.

Deletion is always a tombstone, never a row removal.

## What is never synchronised

`created_by`, `contact_operator`, `photo`, `assigned_to`, and the entire `potrzeba` category.
That data stays on the node where it was created. The outgoing field list is `SYNCABLE_FIELDS` in
`shared/constants.mjs`; signature exclusions are `SIGN_EXCLUDE`.

## Vocabularies

Enum values live in one place (`shared/constants.mjs`) and are mirrored in the frontend types:
categories, services, link types, industrial capabilities, host types, activation modes, statuses,
public geometries, need types, urgencies and roles.
