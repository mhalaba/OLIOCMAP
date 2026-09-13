import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import http from "node:http";
import { resolvePmtilesSource } from "../shared/pmtiles_source.mjs";

export const TILE_PRESETS = {
  gmina: { maxzoom: 14 },
  wojewodztwo: { bbox: "18.03,49.39,19.97,50.81", maxzoom: 13 },
  polska: { bbox: "14.07,49.00,24.29,54.84", maxzoom: 11 },
};

export function createTileManager({ cfg, log = console }) {
  const job = {
    state: "idle",
    preset: "",
    error: "",
    file: "",
    bytes: 0,
    startedAt: "",
    source: "",
  };

  function indexPath() {
    return join(cfg.tilesDir, "index.json");
  }

  async function listFiles() {
    if (!existsSync(cfg.tilesDir)) return [];
    const names = await readdir(cfg.tilesDir);
    return names.filter((n) => n.endsWith(".pmtiles") && !n.endsWith(".part"));
  }

  async function writeIndex(files) {
    await mkdir(cfg.tilesDir, { recursive: true });
    await writeFile(indexPath(), JSON.stringify({ files }, null, 2));
  }

  async function status() {
    const files = await listFiles();
    const details = [];
    for (const f of files) {
      try {
        const s = await stat(join(cfg.tilesDir, f));
        details.push({ name: f, bytes: s.size });
      } catch {
        details.push({ name: f, bytes: 0 });
      }
    }
    return {
      files: details,
      job: { ...job },
      presets: {
        gmina: { bbox: cfg.tilesBbox, maxzoom: Number(cfg.tilesMaxzoom) || 14 },
        wojewodztwo: TILE_PRESETS.wojewodztwo,
        polska: TILE_PRESETS.polska,
      },
      source: job.source || cfg.pmtilesSource,
    };
  }

  function resolvePreset(name) {
    if (name === "gmina") {
      return { bbox: cfg.tilesBbox, maxzoom: Number(cfg.tilesMaxzoom) || 14 };
    }
    const p = TILE_PRESETS[name];
    if (!p) return null;
    return { bbox: p.bbox || cfg.tilesBbox, maxzoom: p.maxzoom };
  }

  function runPmtiles(args) {
    return new Promise((resolve, reject) => {
      const bin = cfg.pmtilesBin || "pmtiles";
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
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

  function postUnix(socketPath, urlPath, body, timeoutMs = 25 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const payload = Buffer.from(JSON.stringify(body));
      const req = http.request(
        {
          socketPath,
          path: urlPath,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": payload.length,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let data = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch {
              data = { error: text };
            }
            resolve({ status: res.statusCode || 0, data });
          });
        }
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error("agent kafelków: timeout"));
      });
      req.on("error", reject);
      req.end(payload);
    });
  }

  async function extractTo(tmp, spec) {
    const sock = cfg.tilesAgentSock || "/tiles/agent.sock";
    if (sock && existsSync(sock)) {
      const res = await postUnix(sock, "/extract", {
        dest: tmp,
        bbox: spec.bbox,
        maxzoom: spec.maxzoom,
        configured: cfg.pmtilesSource,
      });
      if (res.status !== 200 || !res.data || res.data.ok !== true) {
        throw new Error((res.data && res.data.error) || "agent kafelków HTTP " + res.status);
      }
      return res.data.source || "";
    }
    const source = await resolvePmtilesSource({ configured: cfg.pmtilesSource });
    await runPmtiles([
      "extract",
      source,
      tmp,
      `--bbox=${spec.bbox}`,
      `--maxzoom=${spec.maxzoom}`,
    ]);
    return source;
  }

  async function extract(preset) {
    if (job.state === "running") return job;
    const spec = resolvePreset(preset);
    if (!spec || !spec.bbox) {
      job.state = "error";
      job.error = "Nieznany zakres albo brak TILES_BBOX";
      return job;
    }
    job.state = "running";
    job.preset = preset;
    job.error = "";
    job.startedAt = new Date().toISOString();
    job.file = "";
    job.bytes = 0;
    job.source = "";
    const dest = join(cfg.tilesDir, "poland.pmtiles");
    const tmp = dest + ".part";
    try {
      await mkdir(cfg.tilesDir, { recursive: true });
      const source = await extractTo(tmp, spec);
      job.source = source;
      log.log?.("[tiles] źródło", source, spec);
      await rename(tmp, dest);
      const s = await stat(dest);
      job.bytes = s.size;
      job.file = "poland.pmtiles";
      await writeIndex(["poland.pmtiles"]);
      job.state = "ok";
      log.log?.("[tiles] zapisano", dest, s.size);
    } catch (err) {
      job.state = "error";
      job.error = String(err.message || err).slice(0, 500);
      log.error?.("[tiles]", job.error);
    }
    return job;
  }

  async function saveUpload(req) {
    if (job.state === "running") throw new Error("Trwa inne pobieranie");
    job.state = "running";
    job.preset = "wgraj";
    job.error = "";
    job.source = "upload";
    job.startedAt = new Date().toISOString();
    await mkdir(cfg.tilesDir, { recursive: true });
    const dest = join(cfg.tilesDir, "poland.pmtiles");
    const tmp = dest + ".part";
    await pipeline(req, createWriteStream(tmp));
    await rename(tmp, dest);
    const s = await stat(dest);
    job.bytes = s.size;
    job.file = "poland.pmtiles";
    await writeIndex(["poland.pmtiles"]);
    job.state = "ok";
    return job;
  }

  return {
    job,
    status,
    extract,
    saveUpload,
    startExtract(preset) {
      extract(preset).catch((e) => {
        job.state = "error";
        job.error = String(e.message || e).slice(0, 500);
      });
      return job;
    },
  };
}
