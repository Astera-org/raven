/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import globals from "globals";
import type { ConfigArray } from "typescript-eslint";

const config: ConfigArray = [
  ...sharedConfig,
  {
    files: ["./**/*.ts", "./**/*.tsx", "./eslint.config.ts"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ["eslint.config.ts", "vitest.config.ts"],
          defaultProject: "tsconfig.root.json",
        },
      },
    },
  },
  {
    // Plain Node scripts (e.g. datacite-mock/server.js) that run standalone
    // via `node`, not through our TS build, so they use CommonJS `require()`
    // rather than the ESM `import` the rest of this package uses.
    files: ["./**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default config;
