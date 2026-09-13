import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "pl-PL",
  },
  globalSetup: "./global-setup.ts",
});
