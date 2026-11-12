import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "src/fleets/sa7/**",
      "src/fleets/nuvio/snapshot/**",
      "src/fleets/vega/providers-baseline/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs", "vitest.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
);
