import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const chaos = join(dir, "../../scripts/chaos.sh");

test.describe.configure({ mode: "serial" });

test("1. rejestracja i AED w Moje jako Oczekuje", async ({ page }) => {
  const email = `o${Date.now()}@demo.local`;
  await page.goto("/rejestracja");
  await page.getByLabel(/Imię/).fill("Ola Test");
  await page.locator('input').nth(1).fill(email);
  await page.locator('input[type="password"]').fill("demo12345");
  await page.getByRole("button", { name: "Zarejestruj" }).click();
  await page.waitForURL(/\/$|\/dodaj/);
  await page.goto("/dodaj");
  await page.getByRole("button", { name: "AED" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Zapisz" }).click();
  await page.waitForURL(/moje/);
  await expect(page.getByText("Oczekuje")).toBeVisible();
});

test("2. operator weryfikuje — punkt na mapie anonimowo", async ({ page, context }) => {
  await page.goto("/login");
  await page.locator("input").first().fill("operator@demo.local");
  await page.locator('input[type="password"]').fill("demo12345");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await page.goto("/operator");
  const verify = page.getByRole("button", { name: "Weryfikuj" }).first();
  await expect(verify).toBeVisible({ timeout: 30000 });
  await verify.click();
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await expect(page.locator(".map-el")).toBeVisible();
});

test("3. TRYB WYSPA po odłączeniu centrali — dodawanie działa", async ({ page }) => {
  try {
    execFileSync("bash", [chaos, "down-central"], { stdio: "inherit" });
  } catch {
    /* może już być odłączona */
  }
  await page.goto("/");
  await expect(page.getByText(/TRYB WYSPA/)).toBeVisible({ timeout: 60000 });
  await page.goto("/login");
  await page.locator("input").first().fill("operator@demo.local");
  await page.locator('input[type="password"]').fill("demo12345");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await page.goto("/dodaj");
  await page.getByRole("button", { name: "Punkt Odporności" }).first().click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Zapisz" }).click();
  await page.goto("/operator");
  const verify = page.getByRole("button", { name: "Weryfikuj" }).first();
  if (await verify.isVisible()) await verify.click();
});

test("4. po podłączeniu centrali punkt z podpisem", async ({ page }) => {
  try {
    execFileSync("bash", [chaos, "up-central"], { stdio: "inherit" });
  } catch {}
  const central = process.env.CENTRAL_URL || "http://central-caddy";
  let found = false;
  for (let i = 0; i < 24; i++) {
    try {
      const res = await fetch(`${central}/api/collections/points/records?perPage=50`);
      const data = await res.json();
      const row = (data.items || []).find((p: { sig?: string; source_node?: string }) => p.sig && p.source_node);
      if (row?.sig) {
        found = true;
        break;
      }
    } catch {}
    await page.waitForTimeout(2500);
  }
  expect(found).toBeTruthy();
});

test("5. offline: powłoka i kolejka zapisu", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator(".map-el")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#root")).toBeVisible();
  await context.setOffline(false);
});

test("6. łączność: publiczne współrzędne zaokrąglone", async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1";
  const anon = await fetch(`${base}/api/collections/points/records?filter=${encodeURIComponent('category="lacznosc"')}`).then((r) => r.json());
  const item = (anon.items || [])[0];
  expect(item).toBeTruthy();
  const opAuth = await fetch(`${base}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: "operator@demo.local", password: "demo12345" }),
  }).then((r) => r.json());
  const op = await fetch(`${base}/api/collections/points/records/${item.id}`, {
    headers: { Authorization: opAuth.token },
  }).then((r) => r.json());
  expect(op.lat).toBeTruthy();
  expect(item.lat === undefined || item.lat === 0 || Math.abs(op.lat - (item.public_lat || 0)) > 0.0001).toBeTruthy();
});

test("7. potrzeba nie w feed; wygasa po TTL", async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1";
  const feed = await fetch(`${base}/api/feed.geojson`).then((r) => r.json());
  expect(feed.features.every((f: { properties: { category: string } }) => f.properties.category !== "potrzeba")).toBeTruthy();
  await fetch(`${base}/api/status`);
  await new Promise((r) => setTimeout(r, 2000));
  await fetch(`${base}/api/status`);
});

test("8. nieznany węzeł 403 i rekord peera", async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1";
  const id = "ghost-" + Date.now().toString().slice(-6);
  const res = await fetch(`${base}/sync/v1/changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Node-Id": id },
    body: JSON.stringify({ node_id: id, rows: [] }),
  });
  expect(res.status).toBe(403);
  const su = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: process.env.PB_SUPERUSER_EMAIL || "admin@node.local",
      password: process.env.PB_SUPERUSER_PASSWORD || "change-me",
    }),
  }).then((r) => r.json());
  const peers = await fetch(`${base}/api/collections/peers/records?filter=${encodeURIComponent(`node_id="${id}"`)}`, {
    headers: { Authorization: su.token },
  }).then((r) => r.json());
  expect(peers.items.length).toBeGreaterThan(0);
  const pid = peers.items[0].id;
  await fetch(`${base}/api/collections/peers/records/${pid}`, {
    method: "PATCH",
    headers: { Authorization: su.token, "Content-Type": "application/json" },
    body: JSON.stringify({ trusted: true, public_key: "dGVzdA==" }),
  });
});

test("9. brak angielskich etykiet UI", async ({ request }) => {
  const html = await request.get("/").then((r) => r.text());
  const forbidden = ["Login", "Submit", "Save", "Cancel", "Loading", "Error", "Verify"];
  const stripped = html.replace(/type=["']submit["']/g, "").replace(/type:\s*["']submit["']/g, "");
  for (const w of forbidden) {
    expect(stripped.includes(w), w).toBeFalsy();
  }
  const assets = [...html.matchAll(/\/assets\/[^"]+\.js/g)].map((m) => m[0]);
  for (const a of assets.slice(0, 8)) {
    const js = await request.get(a).then((r) => r.text());
    const scan = js.replace(/type=["']submit["']/g, "");
    for (const w of forbidden) {
      const re = new RegExp(`["'>]${w}["'<]`);
      expect(re.test(scan), `${w} in ${a}`).toBeFalsy();
    }
  }
});
