import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.mocha,
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },
    },
  },
  {
    ignores: ["dist/**"],
  },
];
