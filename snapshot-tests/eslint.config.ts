/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import type { ConfigArray } from "typescript-eslint";

const config: ConfigArray = [
  ...sharedConfig,
  {
    ignores: ["./tests/snapshots/**"],
  },
  {
    files: ["./**/*.ts", "./**/*.tsx", "./eslint.config.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["./**/*.ts", "./**/*.tsx", "./eslint.config.ts"],
    ignores: ["./tests/snapshots", "./node_modules"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ["eslint.config.ts"],
          defaultProject: "tsconfig.root.json",
        },
      },
    },
  },
];

export default config;
