import { bootstrapTrust } from "../integration/trust.mjs";

export default async function globalSetup() {
  const base = process.env.BASE_URL || "http://127.0.0.1";
  const central = process.env.CENTRAL_URL || "http://central-caddy";
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      const s = await fetch(`${base}/sync/v1/health`);
      if (r.ok && s.ok) break;
    } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${central}/sync/v1/health`);
      if (r.ok) break;
    } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  try {
    await bootstrapTrust();
  } catch (e) {
    console.warn("trust setup", e);
  }
}
