import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the API and the Socket.IO endpoint are proxied so that cookies stay
// same-origin; no CORS configuration is needed on the client side.
const API_TARGET = process.env.VITE_PROXY_TARGET || "http://localhost:5001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
