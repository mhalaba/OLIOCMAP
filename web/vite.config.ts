import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "style.json", "sprites/*.svg"],
      manifest: {
        name: "Mapa Kryzysowa",
        short_name: "Mapa",
        lang: "pl",
        display: "standalone",
        theme_color: "#d7263d",
        background_color: "#f4f1ea",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,ico,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /\/api\/feed\.geojson/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "feed-geojson",
              expiration: { maxAgeSeconds: 86400, maxEntries: 4 },
            },
          },
          {
            urlPattern: /\/api\/collections\/points\/records.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "points-records",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 32, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /\/tiles\/.*\.pmtiles/,
            handler: "CacheFirst",
            options: {
              cacheName: "pmtiles",
              expiration: { maxEntries: 8, maxAgeSeconds: 30 * 86400 },
              rangeRequests: true,
            },
          },
          {
            urlPattern: /\/api\/status$/,
            handler: "NetworkFirst",
            options: { cacheName: "status", networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://pocketbase:8090", changeOrigin: true },
      "/_": { target: "http://pocketbase:8090", changeOrigin: true },
      "/sync": { target: "http://sync-worker:8091", changeOrigin: true },
      "/tiles": { target: "http://pocketbase:8090", changeOrigin: true },
    },
  },
});
