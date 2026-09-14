/**
 * Katalog węzłów (mesh). Czysta logika, bez I/O.
 *
 * Każdy węzeł w /sync/v1/health ogłasza `known_nodes`: siebie i sąsiadów, którym ufa
 * (node_id, public_key, base_url, role). Węzeł, który pobiera health od ZAUFANEGO sąsiada,
 * dopisuje nieznane węzły do własnej tabeli `peers` jako NIEzaufane (trusted=false) — ale
 * z kluczem. Dzięki temu:
 *  - podpis origin na wierszu przekazanym przez pośrednika da się zweryfikować (relay bez centrali),
 *  - operator widzi „poznany przez X” i może kliknąć Zaufaj, gdy porówna odcisk przez telefon/radio.
 * Klucz raz zapisany nie jest nadpisywany (TOFU): zmiana klucza to alarm, nie aktualizacja.
 */

/**
 * Klucze, którymi WOLNO weryfikować podpis pochodzenia przychodzącego rekordu.
 *
 * Tylko węzły zaufane wprost przez operatora, plus my sami. Klucz poznany przez poręczenie
 * sąsiada (`trusted=false`, notatka „poznany przez …”) służy wyłącznie do rozpoznania węzła
 * w panelu i do porównania odcisku — nie do wpuszczania jego rekordów.
 *
 * Bez tego ograniczenia zaufany sąsiad mógłby ogłosić wymyślony węzeł z kluczem, który sam
 * kontroluje, i podpisywać jego nazwą dowolne zweryfikowane punkty.
 */
export function originKeys(peerRows, selfId, selfKey) {
  const map = new Map();
  for (const p of peerRows || []) {
    if (!p || !p.node_id || !p.public_key) continue;
    if (p.trusted !== true) continue;
    map.set(p.node_id, p.public_key);
  }
  if (selfId) map.set(selfId, selfKey || "");
  return map;
}

/** Czy węzeł jest nam znany z katalogu, ale jeszcze bez zaufania (do czytelnego komunikatu). */
export function isVouchedOnly(peerRows, nodeId) {
  const row = (peerRows || []).find((p) => p && p.node_id === nodeId);
  return !!row && row.trusted !== true && !!row.public_key;
}

export function advertisedNodes({ selfId, publicKey, baseUrl, role, peers }) {
  const out = [{ node_id: selfId, public_key: publicKey || "", base_url: baseUrl || "", role: role || "node" }];
  for (const p of peers || []) {
    if (!p || !p.node_id || !p.trusted || !p.public_key) continue;
    if (p.node_id === selfId) continue;
    out.push({ node_id: p.node_id, public_key: p.public_key, base_url: p.base_url || "", role: p.role || "node" });
  }
  return out;
}

/**
 * @param {Array} localPeers  wiersze z kolekcji peers
 * @param {Array} advertised  known_nodes z health sąsiada
 * @param {string} viaNodeId  kto ogłosił
 * @param {string} selfId     nasz node_id
 * @returns {{ inserts: Array, updates: Array, alerts: Array }}
 */
export function mergeDirectory(localPeers, advertised, viaNodeId, selfId) {
  const inserts = [];
  const updates = [];
  const alerts = [];
  const byId = new Map((localPeers || []).map((p) => [p.node_id, p]));
  for (const a of advertised || []) {
    if (!a || !a.node_id || a.node_id === selfId || a.node_id === viaNodeId) continue;
    if (!/^[a-z0-9-]{1,40}$/i.test(a.node_id)) continue;
    const key = String(a.public_key || "");
    const local = byId.get(a.node_id);
    if (!local) {
      inserts.push({
        node_id: a.node_id,
        public_key: key,
        base_url: String(a.base_url || ""),
        role: a.role === "central" ? "central" : "node",
        trusted: false,
        note: `poznany przez ${viaNodeId}`,
      });
      continue;
    }
    if (local.public_key && key && local.public_key !== key) {
      alerts.push({ node_id: a.node_id, via: viaNodeId, error: "inny klucz niż zapisany — nie nadpisuję" });
      continue;
    }
    const patch = {};
    if (!local.public_key && key) patch.public_key = key;
    if (!local.base_url && a.base_url) patch.base_url = String(a.base_url);
    if (Object.keys(patch).length) updates.push({ id: local.id, node_id: a.node_id, ...patch });
  }
  return { inserts, updates, alerts };
}
