import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API and the Socket.IO endpoint are proxied so that cookies stay
// same-origin; no CORS configuration is needed on the client side.
const API_TARGET = process.env.VITE_PROXY_TARGET || "http://localhost:5001";

export default defineConfig({
  plugins: [react()],
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
    chunkSizeWarningLimit: 600,
  },
});
