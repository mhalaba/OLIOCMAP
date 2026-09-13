import { gunzipSync } from "node:zlib";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { geojsonToPoints, parseBbox, OPENAEDMAP_PL_URL } from "../shared/openaedmap.mjs";
import { formatHlc } from "../shared/hlc.mjs";

export function createAedImporter({ pb, cfg, log = console }) {
  const job = {
    state: "idle",
    total: 0,
    done: 0,
    skipped: 0,
    error: "",
    source: "",
  };

  function markerPath() {
    return join(cfg.tilesDir, "aed-import.json");
  }

  async function loadGeojson(source) {
    if (source === "fetch") {
      const res = await fetch(OPENAEDMAP_PL_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("OpenAEDMap niedostępna (" + res.status + ")");
      return res.json();
    }
    const gz = cfg.aedBundlePath;
    if (!gz || !existsSync(gz)) throw new Error("Brak paczki data/openaedmap-pl.geojson.gz");
    const buf = await readFile(gz);
    const raw = gz.endsWith(".gz") ? gunzipSync(buf) : buf;
    return JSON.parse(raw.toString("utf8"));
  }

  async function importPoints(points) {
    job.total = points.length;
    job.done = 0;
    job.skipped = 0;
    const now = new Date().toISOString().replace("T", " ");
    let n = 1;
    for (const rec of points) {
      const h = formatHlc(Date.now(), n, cfg.nodeId);
      n += 1;
      try {
        await pb.post("/api/collections/points/records", {
          ...rec,
          last_confirmed_at: rec.last_confirmed_at || undefined,
          source_node: cfg.nodeId,
          conflict: false,
          hlc: h,
          field_hlc: { title: h, status: h, category: h, lat: h, lon: h },
          updated_at: now,
        });
        job.done += 1;
      } catch {
        job.skipped += 1;
      }
      if ((job.done + job.skipped) % 100 === 0) {
        log.log?.(`[aed] ${job.done + job.skipped}/${job.total}`);
      }
    }
    await mkdir(cfg.tilesDir, { recursive: true });
    await writeFile(
      markerPath(),
      JSON.stringify({ at: new Date().toISOString(), imported: job.done, skipped: job.skipped, total: job.total }, null, 2)
    );
  }

  async function run(opts = {}) {
    if (job.state === "running") return job;
    job.state = "running";
    job.error = "";
    job.source = opts.source || cfg.aedImport || "bundled";
    try {
      const fc = await loadGeojson(job.source === "fetch" ? "fetch" : "bundled");
      const bbox = parseBbox(opts.bbox !== undefined ? opts.bbox : cfg.aedBbox);
      const points = geojsonToPoints(fc, {
        bbox,
        gminaName: cfg.gminaName,
        gminaTeryt: cfg.gminaTeryt,
      });
      await importPoints(points);
      job.state = "ok";
    } catch (err) {
      job.state = "error";
      job.error = String(err.message || err).slice(0, 400);
      log.error?.("[aed]", job.error);
    }
    return job;
  }

  async function boot() {
    if (cfg.nodeRole === "central") return;
    if (cfg.aedImport === "off") return;
    if (existsSync(markerPath()) && cfg.aedImport !== "fetch") {
      try {
        const m = JSON.parse(await readFile(markerPath(), "utf8"));
        job.state = "ok";
        job.total = Number(m.total) || 0;
        job.done = Number(m.imported) || 0;
        job.skipped = Number(m.skipped) || 0;
        job.source = "bundled";
      } catch {
        /* znacznik nieczytelny — i tak pomijamy import */
      }
      log.log?.("[aed] pomijam autoimport — znacznik już jest");
      return;
    }
    log.log?.("[aed] import OpenAEDMap w tle");
    run({ source: cfg.aedImport === "fetch" ? "fetch" : "bundled" }).catch((e) => log.error?.(e));
  }

  return {
    job,
    run,
    boot,
    snapshot() {
      return { ...job };
    },
  };
}
