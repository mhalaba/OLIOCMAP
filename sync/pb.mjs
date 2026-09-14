import { cfg } from "./config.mjs";

export class PbError extends Error {
  constructor(status, body) {
    super(`PB ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export function createPb() {
  let token = "";
  async function auth() {
    const res = await fetch(`${cfg.pbUrl}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: cfg.syncEmail, password: cfg.syncPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new PbError(res.status, data);
    token = data.token;
    return token;
  }

  async function req(method, path, body, query) {
    if (!token) await auth();
    const url = new URL(path, cfg.pbUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const headers = { Authorization: token };
    let payload;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res = await fetch(url, { method, headers, body: payload });
    if (res.status === 401) {
      await auth();
      headers.Authorization = token;
      res = await fetch(url, { method, headers, body: payload });
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) throw new PbError(res.status, data);
    return data;
  }

  return {
    auth,
    get: (path, query) => req("GET", path, undefined, query),
    post: (path, body) => req("POST", path, body),
    patch: (path, body) => req("PATCH", path, body),
    del: (path) => req("DELETE", path),
    async health() {
      const res = await fetch(`${cfg.pbUrl}/api/health`);
      return res.ok;
    },
    async listAll(collection, filter, extra = {}) {
      const items = [];
      let page = 1;
      for (;;) {
        const data = await req("GET", `/api/collections/${collection}/records`, undefined, {
          page,
          perPage: 200,
          filter,
          sort: extra.sort || "id",
          skipTotal: 1,
        });
        items.push(...(data.items || []));
        if (!data.items || data.items.length < 200) break;
        page += 1;
        if (page > 500) break;
      }
      return items;
    },
    async findById(collection, id) {
      try {
        return await req("GET", `/api/collections/${collection}/records/${id}`);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
    async upsert(collection, id, body) {
      const existing = await this.findById(collection, id);
      if (existing) return req("PATCH", `/api/collections/${collection}/records/${id}`, body);
      return req("POST", `/api/collections/${collection}/records`, { ...body, id });
    },
  };
}
