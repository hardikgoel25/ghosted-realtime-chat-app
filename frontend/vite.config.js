import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// In development the API and the Socket.IO endpoint are proxied so that cookies stay
// same-origin; no CORS configuration is needed on the client side.
const API_TARGET = process.env.VITE_PROXY_TARGET || "http://localhost:5001";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own service worker (src/sw.js) with Workbox's precache manifest injected into it
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Ghosted",
        short_name: "Ghosted",
        description: "Fast, private realtime chat.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#14111f",
        theme_color: "#14111f",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      includeAssets: ["logo.svg", "icons/*.png", "receive.wav", "send.mp3"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wav,mp3}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET },
      "/socket.io": { target: API_TARGET, ws: true },
    },
  },
  // The linked workspace package is not pre-bundled, so its dependency must be listed explicitly
  optimizeDeps: { include: ["zod"] },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
