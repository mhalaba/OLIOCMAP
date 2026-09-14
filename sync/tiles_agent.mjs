import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, unlinkSync, chmodSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePmtilesSource } from "../shared/pmtiles_source.mjs";

const SOCK = process.env.TILES_AGENT_SOCK || "/tiles/agent.sock";
const BIN = process.env.PMTILES_BIN || "pmtiles";

function runPmtiles(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(out.trim());
      else {
        const msg = (err.trim() || out.trim() || (signal ? "sygnał " + signal : "kod " + code)).slice(0, 450);
        reject(new Error("pmtiles extract: " + msg));
      }
    });
  });
}

function readBody(req, limit = 16_000) {
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

const server = createServer(async (req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      json(200, { ok: true });
      return;
    }
    if (req.method === "POST" && req.url === "/extract") {
      const raw = await readBody(req);
      let body = {};
      try {
        body = JSON.parse(raw.toString("utf8") || "{}");
      } catch {
        json(400, { error: "JSON" });
        return;
      }
      if (!body.dest || !body.bbox || body.maxzoom == null) {
        json(400, { error: "brak dest, bbox albo maxzoom" });
        return;
      }
      const source = await resolvePmtilesSource({ configured: body.configured || process.env.PMTILES_SOURCE || "auto" });
      await mkdir(dirname(body.dest), { recursive: true });
      console.log("[tiles-agent] extract", source, body.bbox, "z" + body.maxzoom, "→", body.dest);
      await runPmtiles(["extract", source, body.dest, `--bbox=${body.bbox}`, `--maxzoom=${body.maxzoom}`]);
      json(200, { ok: true, source });
      return;
    }
    json(404, { error: "nie znaleziono" });
  } catch (err) {
    console.error("[tiles-agent]", err);
    json(500, { error: String(err.message || err).slice(0, 500) });
  }
});

server.requestTimeout = 30 * 60 * 1000;
server.timeout = 0;
server.headersTimeout = 60_000;

if (existsSync(SOCK)) unlinkSync(SOCK);
server.listen(SOCK, () => {
  try {
    chmodSync(SOCK, 0o666);
  } catch {
    /* ignore */
  }
  console.log("[tiles-agent] socket", SOCK);
});
