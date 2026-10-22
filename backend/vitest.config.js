import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./tests/globalSetup.js"],
    setupFiles: ["./tests/setup.js"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    include: ["tests/**/*.test.js"],
  },
});
