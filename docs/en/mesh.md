# Mesh — how the map updates without a hub

Polski: [../mesh.md](../mesh.md)

The goal: several fire stations and villages in a county each run their own node. The internet dies,
the hub dies, but nodes within Wi-Fi, cable or radio-link range still see each other and exchange
verified points. There is no "server". Every node is a peer; a hub, if present, is just one more
neighbour that additionally holds the right to set `blocked`.

## What existed, what is new

| Layer | Before (hub and spoke) | Now (mesh) |
| --- | --- | --- |
| Connections | `CENTRAL_URL` or `PEERS` in `.env`, trust granted by an admin | the operator adds a neighbour in the UI (`/operator/wezly`); the node directory spreads across the network |
| Keys | a neighbour's key came only from its own `/sync/v1/health` | a trusted neighbour advertises the keys of **its** trusted peers; we store them as *untrusted, learned via X* (trust on first use, a changed key raises an alert). Only explicitly trusted nodes' keys verify signatures |
| Row flow | a node pushed only its own rows; foreign rows were accepted only with the hub's `relay_sig` | with `MESH_RELAY=1` a node also pushes foreign verified rows carrying their **origin signature**; the receiver verifies with the key of a node it trusts directly, and the relay signs and alters nothing |
| Neighbour status | only the hub collected `/sync/v1/status` | every node remembers the state of its trusted neighbours (visible on `/status`) |
| No network at all | USB bundle via `export.bundle` / `import.bundle` | unchanged — it works as sneakernet between any two nodes |

## Trust model

1. **Origin signature** (`sig`, Ed25519) is attached to every verified row and travels with it through
   any number of relays. A relay cannot alter the content.
2. **Connection trust** (`peers.trusted`) is granted manually by an operator after comparing key
   fingerprints (phone, handheld radio, meeting). Without it there is no pull or push with that node.
3. **A key from the directory does not admit records.** Origin signatures are verified only with the
   keys of explicitly trusted nodes. A key learned "via a neighbour" serves to recognise that node in
   the panel and to compare fingerprints, nothing more. Rows from node C relayed by B stay rejected
   (with a "waiting for trust" line in the log) until an operator trusts C.

   The reason is concrete. If a directory key were enough, a trusted neighbour could advertise an
   invented node with a key it controls and sign arbitrary verified points in that node's name.
   Nodes whose key is already known are protected by trust on first use; new ones would have no
   protection at all. Relaying still works and still pays off: it shortens the path to a node you
   trust when the direct link is down.
4. `blocked` still comes only from a trusted hub (`shared/merge.mjs`). An ordinary node cannot block
   someone else's point network-wide; it can only remove it locally.
5. **Needs (`potrzeba`) never leave a node** — not by relay, not in a USB bundle. That is neighbours'
   personal data; see `docs/opsec.md`.

## How data spreads

- Every `SYNC_INTERVAL_S` (30 s) a node polls each trusted neighbour: `health` → learn directory →
  `pull` (`GET /sync/v1/changes?since=<hlc>`) → `push` (`POST /sync/v1/changes`) → `status`.
- The cursor is an HLC (hybrid logical clock). Rows carry `field_hlc` per field, so two nodes may edit
  the same point and the newer field wins, with `source_node` breaking ties. Echo (your own row
  returning via a neighbour) is harmless: the merge keeps the local copy.
- Convergence: with a connected graph, every verified point reaches everyone in roughly
  (graph diameter × interval). Loops do no harm because the merge is idempotent.
- Exponential backoff up to 5 minutes for an unresponsive neighbour; the rest of the network continues.

## Neighbour discovery

Deliberately **without** mDNS or multicast (Docker containers often cannot see host multicast, and on
a radio network you have to type the address anyway). Instead:

1. The operator enters a neighbour's address once (`/operator/wezly` → *Add neighbouring node*).
2. After the first `health` call the neighbour returns its directory: further nodes appear on their own
   as "learned via …" with addresses. The operator clicks Trust after comparing fingerprints.
3. `PUBLIC_URL` in `.env` is the address others should reach us on (for example
   `https://mapa-bytom.local` or an IP on the radio link). Without it we advertise no address and a
   neighbour has to type ours by hand.

## Failures and clocks

- A node with no neighbours shows island mode; everything works locally and the queue waits.
- The HLC rejects rows stamped more than 10 minutes in the future (`CLOCK_SKEW_MS`). A node without an
  RTC has a wrong clock after a restart, so its new rows may lose the merge. See `docs/sprzet.md`
  (RTC, or NTP from a neighbour).
- Compromised node key: the neighbours' operators click *Revoke trust*; rows with that `source_node`
  stop being accepted. Withdrawing old rows still requires `blocked` from a hub or manual deletion.

## Variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `MESH_RELAY` | `1` | also push foreign verified rows (with their origin signature) |
| `MESH_DIRECTORY` | `1` | advertise and learn the node directory from trusted neighbours |
| `PUBLIC_URL` | empty | this node's address as advertised in the directory |
| `PEERS` / `CENTRAL_URL` | empty | neighbours from configuration (still supported; trust is still manual) |

## Not built yet

- Low-bandwidth radio transport (Meshtastic/LoRa): today the protocol is HTTP and JSON with batches of
  200 rows. LoRa would need a separate compressed "change headers only" stream, with bodies fetched
  over Wi-Fi.
- Suggesting trust based on the number of vouches (today a vouch only creates a panel entry; trust is
  always manual).
- Signing the directory itself (today it is credible only because it arrived over a trusted,
  authenticated connection).

## What is checked automatically

`docker-compose.mesh.yml` brings up two peer nodes with no hub, and `tests/integration/mesh.mjs`
checks four things: a point travels from A to B carrying its origin signature, a need report never
leaves its node (neither on its own nor pushed directly), a trusted neighbour cannot impersonate a
node it merely vouched for, and once that node is trusted the very same record is accepted. It runs
as a separate CI job.
