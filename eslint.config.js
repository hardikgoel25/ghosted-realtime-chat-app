import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", ".husky/**"] },
  js.configs.recommended,
  {
    // Node code: backend, shared package, root/config files
    files: ["backend/**/*.js", "shared/**/*.js", "*.js", "frontend/*.{js,cjs}"],
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
    files: ["backend/src/migrations/**/*.js", "backend/src/scripts/**/*.js"],
    rules: { "no-console": "off" },
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
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }],
    },
  },
  prettier,
];
