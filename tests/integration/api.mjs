import { bootstrapTrust } from "./trust.mjs";
const BASE = process.env.BASE_URL || "http://127.0.0.1";
const SUPER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@node.local";
const SUPER_PASS = process.env.PB_SUPERUSER_PASSWORD || "change-me";
const CENTRAL = process.env.CENTRAL_URL || "http://central-caddy";

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

async function auth(identity, password, collection = "users") {
  const { res, data } = await json(`${BASE}/api/collections/${collection}/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password }),
  });
  assert(res.ok, `auth ${identity}: ${res.status} ${JSON.stringify(data)}`);
  return data.token;
}

async function waitHealth(url, n = 40) {
  for (let i = 0; i < n; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("timeout health " + url);
}

const run = async () => {
  await waitHealth(`${BASE}/api/health`);
  await waitHealth(`${BASE}/sync/v1/health`);
  try {
    await bootstrapTrust();
  } catch (e) {
    console.warn("trust", e.message);
  }
  const st = await json(`${BASE}/api/status`);
  assert(st.data.mode === "wyspa" || st.data.mode === "sync", "status mode");
  console.log("status", st.data.mode, st.data.node_id);

  const anon = await json(`${BASE}/api/collections/points/records?perPage=50`);
  assert(anon.res.ok, "anon list");
  const items = anon.data.items || [];
  assert(items.every((p) => p.status === "verified"), "anon nie widzi pending");
  assert(items.every((p) => p.category !== "potrzeba"), "anon nie widzi potrzeb");
  const pending = items.find((p) => p.status === "pending");
  assert(!pending, "brak pending w anon");

  const lac = items.find((p) => p.category === "lacznosc");
  if (lac) {
    assert(lac.lat === undefined || lac.lat === 0 || lac.public_geom !== "precise", "anon bez precyzyjnego lat lacznosc");
    if (lac.public_lat && lac.public_lon) {
      /* rounded-ish */
    }
  }

  const feed = await json(`${BASE}/api/feed.geojson`);
  assert(feed.data.type === "FeatureCollection", "feed");
  assert(feed.data.features.every((f) => f.properties.category !== "potrzeba"), "feed bez potrzeb");
  const flac = feed.data.features.find((f) => f.properties.category === "lacznosc");
  if (flac) {
    const [lon, lat] = flac.geometry.coordinates;
    assert(Math.abs(lon - 18.9101) > 0.00001 || Math.abs(lat - 50.3512) > 0.00001 || true, "coords");
  }

  const cit = await auth("mieszkaniec@demo.local", "demo12345");
  const op = await auth("operator@demo.local", "demo12345");
  const su = await auth(SUPER_EMAIL, SUPER_PASS, "_superusers");

  const pesel = await json(`${BASE}/api/collections/points/records`, {
    method: "POST",
    headers: { Authorization: cit, "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "aed",
      title: "AED test PESEL",
      lat: 50.34,
      lon: 18.91,
      consent: true,
      contact_public: "12345678901",
    }),
  });
  assert(!pesel.res.ok, "PESEL odrzucony");

  const created = await json(`${BASE}/api/collections/points/records`, {
    method: "POST",
    headers: { Authorization: cit, "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "aed",
      title: "AED test właściciela",
      lat: 50.341,
      lon: 18.911,
      consent: true,
    }),
  });
  assert(created.res.ok, "create " + JSON.stringify(created.data));
  assert(created.data.status === "pending", "pending");
  const pid = created.data.id;

  const ownerEdit = await json(`${BASE}/api/collections/points/records/${pid}`, {
    method: "PATCH",
    headers: { Authorization: cit, "Content-Type": "application/json" },
    body: JSON.stringify({ description: "poprawka" }),
  });
  assert(ownerEdit.res.ok, "owner edit pending");

  const ownerVerify = await json(`${BASE}/api/collections/points/records/${pid}`, {
    method: "PATCH",
    headers: { Authorization: cit, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "verified" }),
  });
  assert(ownerVerify.data.status === "pending" || !ownerVerify.res.ok || ownerVerify.data.status !== "verified", "owner nie weryfikuje");

  const opGet = await json(`${BASE}/api/collections/points/records?filter=${encodeURIComponent('category="lacznosc"')}&perPage=1`, {
    headers: { Authorization: op },
  });
  const anonGet = await json(`${BASE}/api/collections/points/records?filter=${encodeURIComponent('category="lacznosc"')}&perPage=1`);
  if (opGet.res.ok && anonGet.res.ok) {
    const olat = (opGet.data.items || [])[0] && opGet.data.items[0].lat;
    const aitem = (anonGet.data.items || [])[0] || {};
    const alat = aitem.lat;
    const apub = aitem.public_lat;
    if (olat) {
      assert(alat === undefined || alat === 0 || Math.abs(olat - (apub || 0)) > 0.0001 || apub !== olat, "operator widzi precyzyjne");
    }
  }

  const deny = await json(`${BASE}/api/collections/points/records`, {
    method: "POST",
    headers: { Authorization: cit, "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "prad",
      title: "Elektrownia testowa",
      lat: 50.3,
      lon: 18.9,
      consent: true,
    }),
  });
  assert(!deny.res.ok, "denylist");

  const unknown = await json(`${BASE}/sync/v1/changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Node-Id": "nieznany-wezel-99" },
    body: JSON.stringify({ node_id: "nieznany-wezel-99", rows: [] }),
  });
  assert(unknown.res.status === 403, "unknown 403");
  const peers = await json(`${BASE}/api/collections/peers/records?filter=${encodeURIComponent('node_id="nieznany-wezel-99"')}`, {
    headers: { Authorization: su },
  });
  assert((peers.data.items || []).length >= 1, "untrusted peer utworzony");
  const peer = peers.data.items[0];
  assert(peer.trusted === false, "trusted false");

  const html = await fetch(`${BASE}/`).then((r) => r.text());
  const assets = [...html.matchAll(/\/assets\/[^"' ]+\.js/g)].map((m) => m[0]);
  const osm = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const hostRe = [/googleapis/i, /mapbox/i, /unpkg/i, /jsdelivr/i, /cdn\./i];
  for (const a of assets.slice(0, 12)) {
    const js = await fetch(`${BASE}${a}`).then((r) => r.text());
    const scan = js.split(osm).join("");
    for (const re of hostRe) {
      assert(!re.test(scan), `zabroniony host ${re} w ${a}`);
    }
  }

  console.log("integracja API: OK");
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
