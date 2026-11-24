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
  },
];

export default config;
