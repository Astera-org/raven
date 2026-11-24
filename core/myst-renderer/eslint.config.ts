/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import type { ConfigArray } from "typescript-eslint";

const config: ConfigArray = [
  ...sharedConfig,
  {
    files: ["./**/*.ts", "./eslint.config.ts"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ["eslint.config.ts"],
          defaultProject: "tsconfig.root.json",
        },
      },
    },
    // The renderer predates linting here and walks untyped AST nodes as `any`
    // throughout; typing them is its own refactor.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
