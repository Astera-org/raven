/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";
import type { ConfigArray } from "typescript-eslint";

const config: ConfigArray = [
  ...sharedConfig,
  {
    files: [
      "./**/*.ts",
      "./**/*.tsx",
      "eslint.config.ts",
      "react-router.config.ts",
      "vite.config.ts",
    ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          defaultProject: "tsconfig.root.json",
        },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];

export default config;
