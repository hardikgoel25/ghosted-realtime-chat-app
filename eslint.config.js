import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      ".husky/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  {
    // Node code: backend, shared package, root/config files, e2e tooling
    files: [
      "backend/**/*.js",
      "shared/**/*.js",
      "*.js",
      "*.mjs",
      "frontend/*.{js,cjs}",
      "e2e/**/*.{js,mjs}",
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "warn",
    },
  },
  {
    files: ["backend/tests/**/*.js", "backend/vitest.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
    rules: { "no-console": "off" },
  },
  {
    files: ["backend/src/migrations/**/*.js", "backend/src/scripts/**/*.js", "e2e/**/*.{js,mjs}"],
    rules: { "no-console": "off" },
  },
  {
    // Playwright specs evaluate snippets inside the browser
    files: ["e2e/**/*.spec.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Classic scripts served from public/
    files: ["frontend/public/**/*.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser } },
    rules: { "no-unused-vars": ["error", { caughtErrors: "none" }] },
  },
  {
    // Browser code
    files: ["frontend/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    // The service worker runs outside the window
    files: ["frontend/src/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["frontend/src/**/*.test.js", "frontend/vite.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
  prettier,
];
