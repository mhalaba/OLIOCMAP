import { bootstrapTrust } from "../integration/trust.mjs";

export default async function globalSetup() {
  const base = process.env.BASE_URL || "http://127.0.0.1";
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
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
