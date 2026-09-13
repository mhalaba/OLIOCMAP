import { CLOCK_SKEW_MS } from "./constants.mjs";
import { compareHlc, parseHlc, wallMs } from "./hlc.mjs";

const PROTECTED_LOCAL = ["created_by", "contact_operator"];
const LOCAL_PRECISION = ["lat", "lon"];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function fieldHlc(row, field) {
  const map = row && row.field_hlc ? row.field_hlc : {};
  if (map && typeof map === "object" && map[field]) return map[field];
  return row && row.hlc ? row.hlc : "";
}

function isTombstone(row) {
  if (!row) return false;
  const d = row.deleted_at;
  return d !== null && d !== undefined && d !== "";
}

function newerField(local, remote, field) {
  const lh = fieldHlc(local, field);
  const rh = fieldHlc(remote, field);
  const cmp = compareHlc(lh, rh);
  if (cmp < 0) return "remote";
  if (cmp > 0) return "local";
  const ln = local && local.source_node ? local.source_node : "";
  const rn = remote && remote.source_node ? remote.source_node : "";
  if (ln === rn) return "local";
  return ln < rn ? "remote" : "local";
}

/**
 * Pure merge. opts: { nowMs, localNodeId, remotePeerRole, remotePeerTrusted }
 * @returns {{ action: string, record?: object, error?: string, conflict?: boolean }}
 */
export function merge(local, remote, opts) {
  const nowMs = opts && opts.nowMs != null ? opts.nowMs : Date.now();
  const localNodeId = (opts && opts.localNodeId) || "";
  const remotePeerRole = (opts && opts.remotePeerRole) || "node";
  const remotePeerTrusted = opts && opts.remotePeerTrusted !== false;

  if (!remote || !remote.id) {
    return { action: "reject", error: "brak zdalnego rekordu" };
  }

  const remoteWall = wallMs(remote.hlc);
  if (remoteWall && remoteWall > nowMs + CLOCK_SKEW_MS) {
    return { action: "quarantine", error: "znacznik czasu > 10 min w przyszłość", record: remote };
  }
  if (remote.hlc && !parseHlc(remote.hlc)) {
    return { action: "quarantine", error: "niepoprawny HLC", record: remote };
  }

  if (!local) {
    const inserted = clone(remote);
    inserted.conflict = false;
    return { action: "insert", record: inserted };
  }

  const result = clone(local);
  result.conflict = !!local.conflict;

  if (remote.source_node && local.source_node && remote.source_node !== local.source_node) {
    /* source_node immutable — keep local origin */
  }
  result.source_node = local.source_node;

  const localPending = local.status === "pending";
  if (localPending) {
    result.conflict = true;
    return { action: "keep_local", record: result, conflict: true };
  }

  const localOwned = local.source_node === localNodeId;

  const remoteTsNewer = compareHlc(local.hlc, remote.hlc) < 0;
  const localTomb = isTombstone(local);
  const remoteTomb = isTombstone(remote);

  if (localTomb && remoteTomb) {
    if (compareHlc(fieldHlc(local, "deleted_at"), fieldHlc(remote, "deleted_at")) < 0) {
      result.deleted_at = remote.deleted_at;
      result.field_hlc = Object.assign({}, result.field_hlc, { deleted_at: fieldHlc(remote, "deleted_at") });
    }
  } else if (localTomb && !remoteTomb) {
    const tombH = fieldHlc(local, "deleted_at") || local.hlc;
    if (compareHlc(tombH, remote.hlc) >= 0) {
      return { action: "keep_local", record: result };
    }
    result.deleted_at = "";
  } else if (!localTomb && remoteTomb) {
    const tombH = fieldHlc(remote, "deleted_at") || remote.hlc;
    if (compareHlc(local.hlc, tombH) <= 0) {
      result.deleted_at = remote.deleted_at;
      result.field_hlc = Object.assign({}, result.field_hlc || {}, {
        deleted_at: tombH,
      });
      result.hlc = compareHlc(result.hlc, remote.hlc) < 0 ? remote.hlc : result.hlc;
    }
  }

  const skip = new Set(["id", "source_node", "sig", "relay_sig", ...PROTECTED_LOCAL]);
  if (localOwned) {
    LOCAL_PRECISION.forEach((f) => skip.add(f));
  }

  const localFh = local.field_hlc && typeof local.field_hlc === "object" ? clone(local.field_hlc) : {};
  const remoteFh = remote.field_hlc && typeof remote.field_hlc === "object" ? clone(remote.field_hlc) : {};
  const outFh = Object.assign({}, localFh);

  const fields = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(localFh), ...Object.keys(remoteFh)]);
  for (const field of fields) {
    if (skip.has(field)) continue;
    if (field === "field_hlc" || field === "hlc" || field === "conflict") continue;
    if (field === "blocked") continue;

    const winner = newerField(local, remote, field);
    if (winner === "remote" && Object.prototype.hasOwnProperty.call(remote, field)) {
      result[field] = remote[field];
      if (remoteFh[field]) outFh[field] = remoteFh[field];
    }
  }

  if (remotePeerTrusted && remotePeerRole === "central" && remote.blocked === true) {
    result.blocked = true;
    if (remoteFh.blocked) outFh.blocked = remoteFh.blocked;
  } else if (remotePeerTrusted && remotePeerRole === "central" && remote.blocked === false && newerField(local, remote, "blocked") === "remote") {
    result.blocked = false;
    if (remoteFh.blocked) outFh.blocked = remoteFh.blocked;
  } else if (newerField(local, remote, "blocked") === "remote" && remotePeerRole !== "central") {
    if (Object.prototype.hasOwnProperty.call(remote, "blocked") && local.blocked) {
      /* non-central cannot unset blocked via older/equal; still allow per-field if not blocked locally? */
    }
    if (!local.blocked && remote.blocked && remotePeerRole !== "central") {
      /* ignore blocked=true from non-central */
    } else if (newerField(local, remote, "blocked") === "remote" && remotePeerRole !== "central" && !remote.blocked) {
      result.blocked = remote.blocked;
    }
  }

  result.field_hlc = outFh;
  if (remoteTsNewer) {
    result.hlc = remote.hlc;
    result.updated_at = remote.updated_at || result.updated_at;
  }
  if (remote.sig && (!local.sig || remoteTsNewer)) result.sig = remote.sig;
  if (remote.relay_sig) result.relay_sig = remote.relay_sig;

  return { action: "update", record: result };
}

export function applyCentralBlocked(local, remote) {
  const result = local ? clone(local) : clone(remote);
  result.blocked = true;
  result.field_hlc = Object.assign({}, result.field_hlc || {}, {
    blocked: (remote && remote.field_hlc && remote.field_hlc.blocked) || remote.hlc,
  });
  return result;
}
