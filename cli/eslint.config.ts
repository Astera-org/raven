/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import type { ConfigArray } from "typescript-eslint";

const rootConfigFiles = [
  "eslint.config.ts",
  "tsdown.config.ts",
  "vitest.config.ts",
];

const config: ConfigArray = [
  ...sharedConfig,
  {
    files: ["./**/*.ts", ...rootConfigFiles],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: rootConfigFiles,
          defaultProject: "tsconfig.root.json",
        },
      },
    },
  },
  {
    files: ["./src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              regex: "^\\.\\./",
              message:
                "Relative imports from parent directories are not allowed. Use a path alias (e.g. `#src/...`) instead.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
