const BASE = process.env.BASE_URL || "http://127.0.0.1";
const CENTRAL = process.env.CENTRAL_URL || "http://central-caddy";
const SUPER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@node.local";
const SUPER_PASS = process.env.PB_SUPERUSER_PASSWORD || "change-me";
const NODE_ID = process.env.NODE_ID || "bytom-01";

async function suToken(base) {
  const res = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: SUPER_EMAIL, password: SUPER_PASS }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("superuser " + base + " " + JSON.stringify(data));
  return data.token;
}

async function upsertPeer(base, token, peer) {
  const q = encodeURIComponent(`node_id="${peer.node_id}"`);
  const list = await fetch(`${base}/api/collections/peers/records?filter=${q}`, { headers: { Authorization: token } }).then((r) => r.json());
  const existing = (list.items || [])[0];
  const headers = { Authorization: token, "Content-Type": "application/json" };
  if (existing) {
    await fetch(`${base}/api/collections/peers/records/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(peer),
    });
  } else {
    await fetch(`${base}/api/collections/peers/records`, {
      method: "POST",
      headers,
      body: JSON.stringify(peer),
    });
  }
}

export async function bootstrapTrust() {
  const nodeHealth = await fetch(`${BASE}/sync/v1/health`).then((r) => r.json());
  let centralHealth;
  try {
    centralHealth = await fetch(`${CENTRAL}/sync/v1/health`).then((r) => r.json());
  } catch {
    console.warn("centrala niedostępna — pomijam zaufanie");
    return false;
  }
  const nodeTok = await suToken(BASE);
  const cenTok = await suToken(CENTRAL);
  await upsertPeer(BASE, nodeTok, {
    node_id: "central-01",
    base_url: CENTRAL,
    public_key: centralHealth.public_key,
    trusted: true,
    role: "central",
    note: "test",
  });
  await upsertPeer(CENTRAL, cenTok, {
    node_id: NODE_ID,
    base_url: "http://caddy",
    public_key: nodeHealth.public_key,
    trusted: true,
    role: "node",
    note: "test",
  });
  console.log("zaufanie węzeł ↔ centrala ustawione");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapTrust().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
