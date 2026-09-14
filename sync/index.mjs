import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { advertisedNodes, isVouchedOnly, mergeDirectory, originKeys } from "../shared/directory.mjs";
import { cfg, parsePeersEnv } from "./config.mjs";
import { createPb } from "./pb.mjs";
import { merge } from "../shared/merge.mjs";
import { generateNodeKeyPair, privateKeyFromB64, publicKeyFromB64, signRow, verifyRow, fingerprint, sha256hex } from "../shared/sign.mjs";
import { parseHlc, formatHlc, wallMs } from "../shared/hlc.mjs";
import { recordToRow, rowToBody } from "./rows.mjs";
import { canonicalJson } from "../shared/canonical.mjs";
import { createAedImporter } from "./import_aed.mjs";
import { createTileManager } from "./tiles.mjs";

const pb = createPb();
const aed = createAedImporter({ pb, cfg, log: console });
const tiles = createTileManager({ cfg, log: console });
const SELF_STATUS_ID = "self00000000000";
const backoff = new Map();
let keyPair = null;
let publicB64 = "";
let privateKey = null;

async function loadKeys() {
  await mkdir(cfg.keysDir, { recursive: true });
  const privPath = join(cfg.keysDir, "node.key");
  const pubPath = join(cfg.keysDir, "node.pub");
  if (existsSync(privPath) && existsSync(pubPath)) {
    const privateB64 = (await readFile(privPath, "utf8")).trim();
    publicB64 = (await readFile(pubPath, "utf8")).trim();
    privateKey = privateKeyFromB64(privateB64);
    keyPair = { publicB64, privateB64 };
  } else {
    const gen = generateNodeKeyPair();
    await writeFile(privPath, gen.privateB64, { mode: 0o600 });
    await writeFile(pubPath, gen.publicB64);
    publicB64 = gen.publicB64;
    privateKey = privateKeyFromB64(gen.privateB64);
    keyPair = gen;
  }
  console.log(`[sync] NODE_ID=${cfg.nodeId} rola=${cfg.nodeRole}`);
  console.log(`[sync] klucz publiczny (przekaż administratorowi centrali): ${publicB64}`);
  console.log(`[sync] odcisk: ${fingerprint(publicB64)}`);
  if (cfg.buildTime && Date.now() < cfg.buildTime - 60_000) {
    console.warn("[sync] UWAGA: czas lokalny wcześniejszy niż build obrazu. Podłącz RTC (DS3231) lub GPS. Sync będzie zawodny.");
  }
}

async function logSync(direction, peer, ok, count, error) {
  try {
    await pb.post("/api/collections/sync_log/records", {
      direction,
      peer,
      ok,
      count: count || 0,
      error: error ? String(error).slice(0, 500) : "",
      at: new Date().toISOString().replace("T", " "),
    });
  } catch (err) {
    console.error("sync_log", err.message);
  }
}

async function updateSelfStatus(patch) {
  try {
    const body = { node_id: cfg.nodeId, public_key: publicB64 };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) body[k] = v;
    }
    await pb.upsert("node_status", SELF_STATUS_ID, body);
  } catch (err) {
    console.error("node_status", err.message);
  }
}

async function upsertRemoteNodeStatus(nid, body) {
  const safe = String(nid).replace(/"/g, "");
  const items = await pb.listAll("node_status", `node_id="${safe}"`);
  const existing = items.find((r) => r.id !== SELF_STATUS_ID) || items[0];
  const payload = { ...body, node_id: nid };
  if (existing) {
    return pb.patch(`/api/collections/node_status/records/${existing.id}`, payload);
  }
  return pb.post("/api/collections/node_status/records", payload);
}

async function getPeerRecords() {
  let rows = [];
  try {
    rows = await pb.listAll("peers", "");
  } catch {
    rows = [];
  }
  return rows;
}

async function upsertPeerRow(data) {
  const existing = (await getPeerRecords()).find((p) => p.node_id === data.node_id);
  if (existing) {
    const body = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) body[k] = v;
    }
    delete body.id;
    return pb.patch(`/api/collections/peers/records/${existing.id}`, body);
  }
  return pb.post("/api/collections/peers/records", data);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms) {
  return Math.floor(ms * (0.8 + Math.random() * 0.4));
}

async function fetchJson(url, opts = {}, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function verifyIncomingRow(row, peerRows, sender) {
  if (!row || !row.sig) return { ok: false, error: "brak podpisu" };
  const keys = originKeys(peerRows, cfg.nodeId, publicB64);
  const originKey = keys.get(row.source_node);
  if (originKey) {
    try {
      const pk = publicKeyFromB64(originKey);
      if (verifyRow(row, pk, row.sig)) return { ok: true };
      return { ok: false, error: "zły podpis origin" };
    } catch {
      return { ok: false, error: "klucz origin nieczytelny" };
    }
  }
  const senderRow = peerRows.find((p) => p.node_id === sender);
  if (senderRow && senderRow.role === "central" && senderRow.trusted && row.relay_sig && senderRow.public_key) {
    try {
      const pk = publicKeyFromB64(senderRow.public_key);
      if (verifyRow(row, pk, row.relay_sig)) return { ok: true, relayed: true };
      return { ok: false, error: "zły relay_sig" };
    } catch {
      return { ok: false, error: "klucz centrali nieczytelny" };
    }
  }
  if (isVouchedOnly(peerRows, row.source_node)) {
    return {
      ok: false,
      vouchedOnly: true,
      error: `węzeł ${row.source_node} znany z katalogu, ale bez zaufania — zaufaj mu na /operator/wezly`,
    };
  }
  return { ok: false, error: "nieznany węzeł źródłowy" };
}

async function applyRow(remote, peerMeta) {
  const localRec = await pb.findById("points", remote.id);
  const local = localRec ? recordToRow(localRec) : null;
  const result = merge(local, remote, {
    nowMs: Date.now(),
    localNodeId: cfg.nodeId,
    remotePeerRole: peerMeta.role || "node",
    remotePeerTrusted: peerMeta.trusted !== false,
  });
  if (result.action === "quarantine" || result.action === "reject") {
    await logSync("pull", peerMeta.node_id, false, 0, result.error);
    return result;
  }
  if (result.action === "keep_local") {
    if (result.conflict && localRec) {
      await pb.patch(`/api/collections/points/records/${remote.id}`, { conflict: true });
    }
    return result;
  }
  const body = rowToBody(result.record);
  if (peerMeta.role === "central" && remote.blocked === true) body.blocked = true;
  await pb.upsert("points", remote.id, body);
  return result;
}

async function learnDirectory(peerRows, advertised, viaNodeId) {
  try {
    const r = mergeDirectory(peerRows, advertised, viaNodeId, cfg.nodeId);
    for (const ins of r.inserts) await pb.post("/api/collections/peers/records", ins);
    for (const up of r.updates) {
      const { id, node_id, ...patch } = up;
      await pb.patch(`/api/collections/peers/records/${id}`, patch);
    }
    for (const a of r.alerts) await logSync("health", a.node_id, false, 0, `katalog od ${a.via}: ${a.error}`);
    if (r.inserts.length) await logSync("health", viaNodeId, true, r.inserts.length, "nowe węzły z katalogu (czekają na zaufanie)");
  } catch (err) {
    console.warn("[mesh] katalog", err.message);
  }
}

async function pullPeer(peer, peerRows) {
  const since = peer.last_pull_cursor || "";
  let sinceParam = since;
  const parsed = parseHlc(since);
  if (parsed) {
    sinceParam = formatHlc(Math.max(0, parsed.wall - 1000), 0, parsed.nodeId);
  }
  const url = `${peer.base_url}/sync/v1/changes?since=${encodeURIComponent(sinceParam)}&limit=200`;
  const res = await fetchJson(
    url,
    { headers: { "X-Node-Id": cfg.nodeId } },
    15000
  );
  if (!res.ok) throw new Error(`pull HTTP ${res.status}`);
  const rows = (res.data && res.data.rows) || [];
  let applied = 0;
  // Sąsiad może przekazywać wiele rekordów z węzła, któremu jeszcze nie ufamy.
  // Logujemy to raz na cykl, a nie raz na rekord, żeby nie zalać dziennika.
  const czekaNaZaufanie = new Set();
  for (const row of rows) {
    if (row.category === "potrzeba") continue;
    const v = verifyIncomingRow(row, peerRows, peer.node_id);
    if (!v.ok) {
      if (v.vouchedOnly) czekaNaZaufanie.add(row.source_node);
      else await logSync("pull", peer.node_id, false, 0, `odrzucono ${row.id}: ${v.error}`);
      continue;
    }
    const r = await applyRow(row, peer);
    if (r.action === "insert" || r.action === "update") applied += 1;
  }
  for (const nodeId of czekaNaZaufanie) {
    await logSync("pull", peer.node_id, false, 0, `rekordy z węzła ${nodeId} czekają na zaufanie — /operator/wezly`);
  }
  const next = (res.data && res.data.next_cursor) || (rows.length ? rows[rows.length - 1].hlc : since);
  if (peer.id) {
    await pb.patch(`/api/collections/peers/records/${peer.id}`, {
      last_pull_cursor: next,
      last_seen: new Date().toISOString().replace("T", " "),
    });
  }
  return { applied, next };
}

async function signAndStore(row) {
  const sig = signRow(row, privateKey);
  row.sig = sig;
  try {
    await pb.patch(`/api/collections/points/records/${row.id}`, { sig });
  } catch {
    /* still push */
  }
  return sig;
}

async function pushPeer(peer) {
  const since = peer.last_push_cursor || "";
  // Mesh relay: wypychamy też cudze zweryfikowane wiersze (z podpisem origin) — sąsiad zweryfikuje
  // podpis kluczem z katalogu. Bez relay: tylko własne.
  let filter = cfg.meshRelay
    ? `status = "verified" && category != "potrzeba"`
    : `status = "verified" && source_node = "${cfg.nodeId}" && category != "potrzeba"`;
  if (since) filter += ` && hlc > "${since}"`;
  const recs = await pb.listAll("points", filter, { sort: "hlc" });
  const all = recs.slice(0, 200).map(recordToRow);
  const batch = [];
  for (const row of all) {
    if (row.source_node === cfg.nodeId) {
      if (!row.sig) await signAndStore(row);
      else {
        const ok = verifyRow(row, publicKeyFromB64(publicB64), row.sig);
        if (!ok) await signAndStore(row);
      }
      batch.push(row);
    } else if (row.sig) {
      // Cudzy wiersz idzie dalej nietknięty; bez podpisu origin nie ma czego przekazywać.
      batch.push(row);
    }
  }
  if (!batch.length && all.length) {
    if (peer.id) await pb.patch(`/api/collections/peers/records/${peer.id}`, { last_push_cursor: all[all.length - 1].hlc });
    return { pushed: 0 };
  }
  if (!batch.length) return { pushed: 0 };
  const res = await fetchJson(
    `${peer.base_url}/sync/v1/changes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Node-Id": cfg.nodeId },
      body: JSON.stringify({ node_id: cfg.nodeId, rows: batch }),
    },
    20000
  );
  if (res.status === 409 && res.data && res.data.row) {
    await applyRow(res.data.row, peer);
    return { pushed: 0, conflict: true };
  }
  if (!res.ok) throw new Error(`push HTTP ${res.status} ${JSON.stringify(res.data)}`);
  const last = batch[batch.length - 1].hlc;
  if (peer.id) {
    await pb.patch(`/api/collections/peers/records/${peer.id}`, { last_push_cursor: last });
  }
  return { pushed: batch.length };
}

async function pushStatus(peer) {
  try {
    const st = await fetch(`${cfg.pbUrl}/api/status`).then((r) => r.json());
    await fetchJson(
      `${peer.base_url}/sync/v1/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Node-Id": cfg.nodeId },
        body: JSON.stringify(st),
      },
      5000
    );
  } catch {
    /* ignore */
  }
}

async function buildPeerList() {
  const fromDb = await getPeerRecords();
  const fromEnv = parsePeersEnv();
  const byId = new Map();
  for (const p of fromDb) {
    if (p.trusted) byId.set(p.node_id, { ...p, fromDb: true });
  }
  for (const p of fromEnv) {
    const existing = fromDb.find((r) => r.node_id === p.node_id);
    byId.set(p.node_id, {
      ...(existing || {}),
      ...p,
      trusted: existing ? existing.trusted : false,
      id: existing ? existing.id : undefined,
      last_pull_cursor: existing ? existing.last_pull_cursor : "",
      last_push_cursor: existing ? existing.last_push_cursor : "",
      public_key: existing ? existing.public_key : "",
      role: p.role || (existing && existing.role) || "node",
    });
  }
  for (const p of fromDb) {
    if (!byId.has(p.node_id) && p.trusted) byId.set(p.node_id, p);
  }
  return [...byId.values()].filter((p) => p.node_id && p.base_url);
}

async function signLocalVerified() {
  try {
    const recs = await pb.listAll(
      "points",
      `status = "verified" && source_node = "${cfg.nodeId}" && category != "potrzeba"`
    );
    for (const rec of recs.slice(0, 200)) {
      const row = recordToRow(rec);
      if (!row.sig) await signAndStore(row);
      else {
        try {
          if (!verifyRow(row, publicKeyFromB64(publicB64), row.sig)) await signAndStore(row);
        } catch {
          await signAndStore(row);
        }
      }
    }
  } catch (err) {
    console.warn("[sync] podpisywanie lokalne", err.message);
  }
}

async function syncLoopOnce() {
  const healthy = await pb.health();
  if (!healthy) {
    console.warn("[sync] PocketBase niedostępny");
    await updateSelfStatus({ mode: "wyspa", last_error: "pocketbase down" });
    return;
  }
  await signLocalVerified();
  const peers = await buildPeerList();
  if (!peers.length) {
    await updateSelfStatus({ mode: "wyspa", peers: [], last_error: "" });
    return;
  }
  const peerState = [];
  let anyOk = false;
  for (const peer of peers) {
    const wait = backoff.get(peer.node_id) || 0;
    if (wait > Date.now()) continue;
    try {
      const h = await fetchJson(`${peer.base_url}/sync/v1/health`, {}, 3000);
      if (!h.ok || !h.data) throw new Error("health");
      anyOk = true;
      backoff.set(peer.node_id, 0);
      backoff.set(peer.node_id + ":ms", 0);
      if (h.data.public_key) {
        await upsertPeerRow({
          node_id: peer.node_id,
          base_url: peer.base_url,
          public_key: h.data.public_key,
          role: h.data.role || peer.role || "node",
          last_seen: new Date().toISOString().replace("T", " "),
        });
        peer.public_key = h.data.public_key;
      }
      const freshDb = await getPeerRecords();
      const row = freshDb.find((p) => p.node_id === peer.node_id);
      const trusted = row ? row.trusted : false;
      peer.trusted = trusted;
      peer.id = row ? row.id : peer.id;
      peer.role = (row && row.role) || peer.role;
      if (trusted && cfg.meshDirectory && Array.isArray(h.data.known_nodes)) {
        await learnDirectory(freshDb, h.data.known_nodes, peer.node_id);
      }
      if (trusted) {
        let pullErr = "";
        let pushErr = "";
        let pulled = { applied: 0 };
        let pushed = { pushed: 0 };
        try {
          pulled = await pullPeer(peer, freshDb);
          await logSync("pull", peer.node_id, true, pulled.applied, "");
        } catch (err) {
          pullErr = err.message;
          await logSync("pull", peer.node_id, false, 0, pullErr);
        }
        try {
          pushed = await pushPeer(peer);
          await logSync("push", peer.node_id, true, pushed.pushed, "");
        } catch (err) {
          pushErr = err.message;
          await logSync("push", peer.node_id, false, 0, pushErr);
        }
        await pushStatus(peer);
        await updateSelfStatus({
          last_pull: pullErr ? undefined : new Date().toISOString().replace("T", " "),
          last_push: pushErr ? undefined : new Date().toISOString().replace("T", " "),
          last_error: pushErr || pullErr || "",
        });
      } else {
        await logSync("health", peer.node_id, true, 0, "węzeł widoczny, czeka na zaufanie");
      }
      peerState.push({ node_id: peer.node_id, ok: true, last_seen: new Date().toISOString(), trusted });
    } catch (err) {
      const failMs = Math.min(5 * 60 * 1000, Math.max(cfg.interval * 1000, (backoff.get(peer.node_id + ":ms") || 1000) * 2));
      backoff.set(peer.node_id + ":ms", failMs);
      backoff.set(peer.node_id, Date.now() + jitter(failMs));
      await logSync("health", peer.node_id, false, 0, err.message);
      peerState.push({ node_id: peer.node_id, ok: false, last_seen: "", trusted: !!peer.trusted });
      await updateSelfStatus({ last_error: String(err.message).slice(0, 500) });
    }
  }
  await updateSelfStatus({
    mode: anyOk ? "sync" : "wyspa",
    peers: peerState,
    public_key: publicB64,
  });
}

async function loop() {
  for (;;) {
    try {
      await syncLoopOnce();
    } catch (err) {
      console.error("[sync] pętla", err);
    }
    await sleep(cfg.interval * 1000);
  }
}

function readBody(req, limit = 12_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("za duże"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function listOutgoing(since, limit) {
  let filter = `status = "verified" && category != "potrzeba"`;
  const parsed = parseHlc(since);
  if (parsed) {
    const lower = formatHlc(Math.max(0, parsed.wall - 1000), 0, parsed.nodeId);
    filter += ` && hlc > "${lower}"`;
  }
  const recs = await pb.listAll("points", filter, { sort: "hlc" });
  const rows = recs.slice(0, limit).map(recordToRow);
  if (cfg.nodeRole === "central" && privateKey) {
    for (const row of rows) {
      if (row.source_node !== cfg.nodeId) {
        row.relay_sig = signRow(row, privateKey);
      } else if (!row.sig) {
        row.sig = signRow(row, privateKey);
      }
    }
  }
  const next_cursor = rows.length ? rows[rows.length - 1].hlc : since || "";
  return { rows, next_cursor };
}

async function authorizeOperator(req) {
  const auth = req.headers.authorization || "";
  if (!auth) return null;
  const res = await fetch(`${cfg.pbUrl}/api/collections/users/auth-refresh`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const su = await fetch(`${cfg.pbUrl}/api/collections/_superusers/auth-refresh`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    if (su.ok) return { role: "admin", superuser: true };
    return null;
  }
  const data = await res.json();
  const role = data.record && data.record.role;
  if (role === "operator" || role === "admin") return data.record;
  return null;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Node-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...cors });
    res.end(JSON.stringify(obj));
  };

  try {
    if (req.method === "GET" && url.pathname === "/sync/v1/health") {
      let known = [];
      if (cfg.meshDirectory) {
        try {
          known = advertisedNodes({
            selfId: cfg.nodeId,
            publicKey: publicB64,
            baseUrl: cfg.publicUrl,
            role: cfg.nodeRole,
            peers: await getPeerRecords(),
          });
        } catch {
          known = [];
        }
      }
      json(200, {
        node_id: cfg.nodeId,
        role: cfg.nodeRole,
        time_ms: Date.now(),
        public_key: publicB64,
        version: cfg.appVersion,
        mesh: { relay: cfg.meshRelay, directory: cfg.meshDirectory },
        known_nodes: known,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/sync/v1/changes") {
      const sender = req.headers["x-node-id"];
      const peers = await getPeerRecords();
      const p = peers.find((x) => x.node_id === sender);
      if (!sender || !p || !p.trusted) {
        json(403, { error: "węzeł nie zaufany" });
        return;
      }
      const since = url.searchParams.get("since") || "";
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 200)));
      const out = await listOutgoing(since, limit);
      json(200, out);
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync/v1/changes") {
      const sender = req.headers["x-node-id"];
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const peers = await getPeerRecords();
      let p = peers.find((x) => x.node_id === sender);
      if (!sender) {
        json(403, { error: "brak X-Node-Id" });
        return;
      }
      if (!p) {
        await upsertPeerRow({
          node_id: sender,
          base_url: "",
          trusted: false,
          role: "node",
          note: "Nowy węzeł czeka na zaufanie",
          public_key: "",
        });
        json(403, { error: "Nowy węzeł czeka na zaufanie" });
        return;
      }
      if (!p.trusted) {
        json(403, { error: "węzeł nie zaufany" });
        return;
      }
      if (!p.public_key) {
        json(403, { error: "brak klucza publicznego peera" });
        return;
      }
      const rows = body.rows || [];
      const accepted = [];
      const rejected = [];
      for (const row of rows) {
        // Potrzeby to dane osobowe sąsiadów. Nie wysyłamy ich i nie przyjmujemy,
        // nawet od zaufanego węzła, który zmodyfikowałby swojego klienta.
        if (row && row.category === "potrzeba") {
          rejected.push({ id: row.id, error: "potrzeby nie wędrują między węzłami" });
          continue;
        }
        const v = verifyIncomingRow(row, peers, sender);
        if (!v.ok) {
          rejected.push({ id: row.id, error: v.error });
          continue;
        }
        try {
          await applyRow(row, p);
          accepted.push(row.id);
        } catch (err) {
          rejected.push({ id: row.id, error: err.message });
        }
      }
      json(200, { accepted: accepted.length, rejected });
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync/v1/status") {
      const raw = await readBody(req);
      const st = JSON.parse(raw.toString("utf8") || "{}");
      const nid = st.node_id || req.headers["x-node-id"];
      if (!nid) {
        json(400, { error: "brak node_id" });
        return;
      }
      if (cfg.nodeRole !== "central") {
        // Węzeł zwykły zapamiętuje stan tylko zaufanych sąsiadów (mesh), reszta jest ignorowana.
        const known = (await getPeerRecords()).find((x) => x.node_id === nid);
        if (!known || !known.trusted) {
          json(200, { ok: true, ignored: true });
          return;
        }
      }
      await upsertRemoteNodeStatus(nid, {
        node_id: nid,
        mode: st.mode || "wyspa",
        last_pull: st.last_pull || "",
        last_push: st.last_push || "",
        last_error: st.last_error || "",
        counts: st.counts || {},
        peers: st.peers || [],
        public_key: st.public_key || "",
      });
      json(200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/sync/v1/tiles/status") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      json(200, await tiles.status());
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync/v1/tiles/download") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      const raw = await readBody(req, 4000);
      let body = {};
      try {
        body = JSON.parse(raw.toString("utf8") || "{}");
      } catch {
        body = {};
      }
      const preset = body.preset || "gmina";
      json(202, tiles.startExtract(preset));
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync/v1/tiles/upload") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      try {
        const st = await tiles.saveUpload(req);
        json(200, st);
      } catch (err) {
        json(400, { error: String(err.message || err).slice(0, 300) });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/sync/v1/aed/status") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      json(200, aed.snapshot());
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync/v1/aed/import") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      const raw = await readBody(req, 4000);
      let body = {};
      try {
        body = JSON.parse(raw.toString("utf8") || "{}");
      } catch {
        body = {};
      }
      if (aed.job.state === "running") {
        json(202, aed.snapshot());
        return;
      }
      aed.run({ source: body.source || "bundled", bbox: body.bbox }).catch(() => {});
      json(202, aed.snapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/sync/v1/export.bundle") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      const recs = await pb.listAll(
        "points",
        `status = "verified" && category != "potrzeba"`,
        { sort: "hlc" }
      );
      const rows = recs.map(recordToRow);
      for (const row of rows) {
        if (row.source_node === cfg.nodeId && privateKey) {
          row.sig = signRow(row, privateKey);
        }
      }
      const bundle = {
        node_id: cfg.nodeId,
        public_key: publicB64,
        exported_at: new Date().toISOString(),
        rows,
      };
      bundle.bundle_sig = signRow(
        { id: "bundle", source_node: cfg.nodeId, hlc: formatHlc(Date.now(), 0, cfg.nodeId), rows_sha256: sha256hex(canonicalJson({ rows })) },
        privateKey
      );
      const gz = gzipSync(Buffer.from(JSON.stringify(bundle)));
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="mapa-${cfg.nodeId}-${new Date().toISOString().slice(0, 10)}.json.gz"`,
        ...cors,
      });
      res.end(gz);
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync/v1/import.bundle") {
      const user = await authorizeOperator(req);
      if (!user) {
        json(403, { error: "tylko operator" });
        return;
      }
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(gunzipSync(raw).toString("utf8"));
      } catch {
        parsed = JSON.parse(raw.toString("utf8"));
      }
      const peers = await getPeerRecords();
      let origin = peers.find((p) => p.node_id === parsed.node_id);
      if (!origin && parsed.public_key) {
        await upsertPeerRow({
          node_id: parsed.node_id,
          public_key: parsed.public_key,
          trusted: false,
          role: "node",
          note: "Paczka USB — porównaj odcisk i zaufaj",
          base_url: "",
        });
        json(409, {
          error: "nowy klucz — porównaj odcisk i zaufaj węzłowi",
          fingerprint: fingerprint(parsed.public_key),
          node_id: parsed.node_id,
        });
        return;
      }
      if (!origin.trusted) {
        json(403, { error: "węzeł paczki nie jest zaufany", fingerprint: fingerprint(origin.public_key || parsed.public_key || "") });
        return;
      }
      let applied = 0;
      for (const row of parsed.rows || []) {
        const v = verifyIncomingRow(row, await getPeerRecords(), parsed.node_id);
        if (!v.ok) continue;
        await applyRow(row, origin);
        applied += 1;
      }
      json(200, { ok: true, applied });
      return;
    }

    json(404, { error: "nie znaleziono" });
  } catch (err) {
    console.error(err);
    json(500, { error: "błąd węzła" });
  }
}

await loadKeys();
await updateSelfStatus({ public_key: publicB64, mode: "wyspa" });
createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    res.writeHead(500);
    res.end("{}");
  });
}).listen(cfg.listen, "0.0.0.0", () => {
  console.log(`[sync] nasłuch :${cfg.listen}`);
  aed.boot();
});
loop();
