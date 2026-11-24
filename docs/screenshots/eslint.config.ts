/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import type { ConfigArray } from "typescript-eslint";

const config: ConfigArray = [
  ...sharedConfig,
  {
    files: ["**/*.ts", "eslint.config.ts"],
    rules: {
      "no-console": "off",
    },
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

export default config;
