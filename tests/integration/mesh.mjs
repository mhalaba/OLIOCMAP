/**
 * Dwa równorzędne węzły bez centrali.
 *
 * Sprawdza to, czego nie da się sprawdzić testem jednostkowym:
 *  1. zweryfikowany punkt wędruje z A do B z podpisem węzła źródłowego,
 *  2. zgłoszenie potrzeby nie opuszcza węzła,
 *  3. zaufany sąsiad NIE może podszyć się pod węzeł, który tylko poręczył,
 *  4. po zaufaniu temu węzłowi jego rekordy wchodzą normalnie.
 *
 * Punkt 3 to regresja dla dziury znalezionej po wdrożeniu relayu: klucz poznany
 * z katalogu nie może służyć do weryfikacji podpisu pochodzenia.
 */
import { randomUUID } from "node:crypto";
import { generateNodeKeyPair, privateKeyFromB64, signRow } from "../../shared/sign.mjs";
import { formatHlc } from "../../shared/hlc.mjs";

const A = process.env.BASE_URL || "http://127.0.0.1";
const B = process.env.PEER_URL || "http://b-caddy";
const SUPER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@node.local";
const SUPER_PASS = process.env.PB_SUPERUSER_PASSWORD || "change-me";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealth(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* jeszcze wstaje */
    }
    await sleep(1000);
  }
  throw new Error("timeout health " + url);
}

async function token(base, identity, password, collection = "users") {
  const { res, data } = await json(`${base}/api/collections/${collection}/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password }),
  });
  assert(res.ok, `auth ${identity} na ${base}: ${res.status} ${JSON.stringify(data)}`);
  return data.token;
}

async function upsertPeer(base, tok, peer) {
  const q = encodeURIComponent(`node_id="${peer.node_id}"`);
  const list = await json(`${base}/api/collections/peers/records?filter=${q}`, {
    headers: { Authorization: tok },
  });
  const existing = (list.data.items || [])[0];
  const headers = { Authorization: tok, "Content-Type": "application/json" };
  const out = existing
    ? await json(`${base}/api/collections/peers/records/${existing.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(peer),
      })
    : await json(`${base}/api/collections/peers/records`, {
        method: "POST",
        headers,
        body: JSON.stringify(peer),
      });
  assert(out.res.ok, `peer ${peer.node_id} na ${base}: ${JSON.stringify(out.data)}`);
  return out.data;
}

async function findPoint(base, id, tok) {
  const headers = tok ? { Authorization: tok } : {};
  const q = encodeURIComponent(`id="${id}"`);
  const { data } = await json(`${base}/api/collections/points/records?filter=${q}`, { headers });
  return (data && data.items && data.items[0]) || null;
}

async function waitForPoint(base, id, seconds = 120) {
  for (let i = 0; i < seconds; i++) {
    const p = await findPoint(base, id);
    if (p) return p;
    await sleep(1000);
  }
  return null;
}

/** Rekord podpisany dowolnym kluczem — udajemy węzeł źródłowy. */
function forgedRow(sourceNode, privateB64, title) {
  const now = Date.now();
  const hlc = formatHlc(now, 0, sourceNode);
  const row = {
    id: randomUUID(),
    source_node: sourceNode,
    hlc,
    field_hlc: { title: hlc, status: hlc, category: hlc },
    updated_at: new Date(now).toISOString(),
    schema_version: 2,
    category: "odpornosc",
    title,
    status: "verified",
    blocked: false,
    lat: 50.4,
    lon: 18.9,
    public_lat: 50.4,
    public_lon: 18.9,
    public_geom: "precise",
    consent: true,
    civilians_ok: true,
  };
  row.sig = signRow(row, privateKeyFromB64(privateB64));
  return row;
}

async function pushRows(base, senderNodeId, rows) {
  return json(`${base}/sync/v1/changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Node-Id": senderNodeId },
    body: JSON.stringify({ node_id: senderNodeId, rows }),
  });
}

const run = async () => {
  await waitHealth(`${A}/api/health`);
  await waitHealth(`${A}/sync/v1/health`);
  await waitHealth(`${B}/api/health`);
  await waitHealth(`${B}/sync/v1/health`);

  const aHealth = (await json(`${A}/sync/v1/health`)).data;
  const bHealth = (await json(`${B}/sync/v1/health`)).data;
  assert(aHealth.node_id && bHealth.node_id, "oba węzły mają identyfikator");
  assert(aHealth.node_id !== bHealth.node_id, "węzły muszą mieć różne identyfikatory");
  console.log(`węzły: ${aHealth.node_id} ↔ ${bHealth.node_id}`);

  const suA = await token(A, SUPER_EMAIL, SUPER_PASS, "_superusers");
  const suB = await token(B, SUPER_EMAIL, SUPER_PASS, "_superusers");

  // 0. Zaufanie w obie strony — to, co operator robi w panelu po porównaniu odcisku.
  await upsertPeer(A, suA, {
    node_id: bHealth.node_id,
    base_url: B,
    public_key: bHealth.public_key,
    trusted: true,
    role: "node",
    note: "test mesh",
  });
  await upsertPeer(B, suB, {
    node_id: aHealth.node_id,
    base_url: "http://caddy",
    public_key: aHealth.public_key,
    trusted: true,
    role: "node",
    note: "test mesh",
  });
  console.log("zaufanie ustawione w obie strony");

  // 1. Punkt zweryfikowany na A ma trafić na B z podpisem węzła źródłowego.
  const opA = await token(A, "operator@demo.local", "demo12345");
  const stamp = Date.now();
  const created = await json(`${A}/api/collections/points/records`, {
    method: "POST",
    headers: { Authorization: opA, "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "odpornosc",
      title: `Mesh punkt ${stamp}`,
      lat: 50.3481,
      lon: 18.9231,
      consent: true,
    }),
  });
  assert(created.res.ok, "zapis punktu na A: " + JSON.stringify(created.data));
  assert(created.data.status === "verified", "operator publikuje od razu");
  const pointId = created.data.id;

  const onB = await waitForPoint(B, pointId);
  assert(onB, `punkt ${pointId} nie dotarł na B w 120 s`);
  assert(onB.source_node === aHealth.node_id, "na B zachowane pochodzenie: " + onB.source_node);
  assert(onB.sig, "rekord na B ma podpis węzła źródłowego");
  assert(onB.title === `Mesh punkt ${stamp}`, "treść bez zmian");
  console.log("1/4 punkt przewędrował z podpisem");

  // 2. Potrzeba nie opuszcza węzła — ani sama, ani wypchnięta wprost.
  const needOnA = await json(`${A}/api/collections/points/records`, {
    method: "POST",
    headers: { Authorization: opA, "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "potrzeba",
      title: `Mesh potrzeba ${stamp}`,
      need_type: "woda",
      people: 3,
      urgency: "wysoka",
      lat: 50.349,
      lon: 18.924,
      consent: true,
    }),
  });
  assert(needOnA.res.ok, "zapis potrzeby na A: " + JSON.stringify(needOnA.data));
  await sleep(20000);
  const needOnB = await findPoint(B, needOnA.data.id, suB);
  assert(!needOnB, "potrzeba nie może pojawić się na sąsiednim węźle");

  // Potrzeba wypchnięta wprost, z pominięciem normalnej ścieżki: odrzucana po kategorii,
  // zanim ktokolwiek spojrzy na podpis.
  const needPush = await pushRows(B, aHealth.node_id, [
    {
      id: randomUUID(),
      source_node: aHealth.node_id,
      hlc: formatHlc(Date.now(), 0, aHealth.node_id),
      category: "potrzeba",
      title: `Potrzeba wprost ${stamp}`,
      status: "verified",
      sig: "nieistotny",
    },
  ]);
  assert(needPush.res.ok, "B odpowiada na push");
  assert(needPush.data.accepted === 0, "potrzeba wypchnięta wprost też odrzucona");
  console.log("2/4 potrzeby zostają na węźle");

  // 3. Zaufany sąsiad podszywa się pod węzeł, który tylko poręczył.
  const widmo = generateNodeKeyPair();
  await upsertPeer(B, suB, {
    node_id: "widmo-01",
    base_url: "",
    public_key: widmo.publicB64,
    trusted: false,
    role: "node",
    note: `poznany przez ${aHealth.node_id}`,
  });
  const forged = forgedRow("widmo-01", widmo.privateB64, `Podszycie ${stamp}`);
  const attack = await pushRows(B, aHealth.node_id, [forged]);
  assert(attack.res.ok, "B przyjmuje żądanie od zaufanego sąsiada");
  assert(attack.data.accepted === 0, "rekord poręczonego węzła nie może wejść: " + JSON.stringify(attack.data));
  const powod = JSON.stringify(attack.data.rejected || []);
  assert(
    powod.includes("widmo-01") && powod.includes("zaufa"),
    "powód odrzucenia wskazuje węzeł i brak zaufania: " + powod
  );
  const ghost = await findPoint(B, forged.id, suB);
  assert(!ghost, "podszyty punkt nie może istnieć na B");
  console.log("3/4 podszycie pod poręczony węzeł odrzucone");

  // 4. Po zaufaniu ten sam rekord wchodzi — mechanizm działa, brakowało tylko decyzji człowieka.
  await upsertPeer(B, suB, { node_id: "widmo-01", trusted: true, public_key: widmo.publicB64 });
  const afterTrust = await pushRows(B, aHealth.node_id, [forged]);
  assert(afterTrust.res.ok, "push po zaufaniu");
  assert(
    afterTrust.data.accepted === 1,
    "po zaufaniu rekord wchodzi: " + JSON.stringify(afterTrust.data)
  );
  const nowThere = await findPoint(B, forged.id, suB);
  assert(nowThere, "punkt zaufanego węzła jest na B");
  console.log("4/4 po zaufaniu ten sam rekord wchodzi");

  console.log("mesh: OK");
};

run().catch((err) => {
  console.error("mesh:", err.message);
  process.exit(1);
});
