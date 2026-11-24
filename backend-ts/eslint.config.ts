/// <reference types="node" />
import sharedConfig from "@raven/eslint-config";
import ravenRules from "@raven/eslint-rules";
import type { ConfigArray } from "typescript-eslint";

// Flat config replaces a rule's options instead of merging them, so each
// no-restricted-imports block below repeats every restriction for its files,
// including @raven/eslint-config's.
const typeOnlyEntryPoint = {
  name: "@raven/backend-ts/types",
  message:
    "@raven/backend-ts/types is a type-only entry point; use `type` imports.",
  allowTypeImports: true,
};

const dayjsPath = {
  name: "dayjs",
  message: "Use the date helpers in `#src/lib/dates.js` instead of dayjs.",
};
const dayjsPattern = {
  group: ["dayjs/*"],
  message: "Register dayjs plugins in `#src/lib/dates.js`.",
};
const dayjsAllowed = ["./src/lib/dates.ts", "./src/api-v0/**"];

// The myst-* packages are built on unified 10, the rest of backend-ts on
// unified 11. Only src/lib/myst/ may use them, and it may not use our
// unified 11 tooling, so the two ecosystems' trees never meet. Parsing MyST
// documents lives in @raven/importer-mystmd.
const mystOutsideMystDir = {
  regex: "^(myst-[^/]+|vfile)(/|$)",
  message:
    "MyST packages (unified 10) may only be used in src/lib/myst/. Use importMystmd from @raven/importer-mystmd to read MyST documents.",
};
// citation-js detects its input's type by default, and fetches an input that
// looks like a URL, synchronously. Only src/lib/bibliography/ may use it, so
// every parse goes through parseBibliography, which forces the input type.
const citationJsOutsideBibliographyDir = {
  regex: "^@citation-js/",
  message:
    "citation-js may only be used in src/lib/bibliography/. Use parseBibliography to read BibTeX.",
};

const unifiedInsideMystDir = [
  {
    regex: "^(unified|mdast|remark-[^/]+|strip-markdown|unist-util-[^/]+)(/|$)",
    message:
      "src/lib/myst/ works on MyST (unified 10) trees; don't mix in unified 11 tooling. Use the myst-* packages instead.",
  },
  {
    regex: "^#src/lib/ast/",
    message:
      "src/lib/ast/ works on unified 11 trees; don't pass MyST trees to it.",
  },
];

const config: ConfigArray = [
  ...sharedConfig,
  {
    files: [
      "./**/*.ts",
      "./**/*.tsx",
      "./tests/**/*.ts",
      "./tests/**/*.tsx",
      "eslint.config.ts",
      "drizzle.config.ts",
    ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ["eslint.config.ts", "drizzle.config.ts"],
          defaultProject: "tsconfig.root.json",
        },
      },
    },
  },
  {
    files: ["./src/**/*.ts", "./src/**/*.tsx"],
    plugins: { raven: ravenRules },
    rules: {
      "raven/prefer-api-version-alias": "error",
    },
  },
  {
    files: ["./src/api-v1/**/*.ts", "./src/api-v1/**/*.tsx"],
    plugins: { raven: ravenRules },
    rules: {
      "raven/avoid-api-v0-in-api-v1": "warn",
    },
  },
  {
    files: ["./src/api-v1/**/*.ts", "./src/api-v1/**/*.tsx"],
    ignores: ["./src/api-v1/lib/create-v1-route.ts"],
    plugins: { raven: ravenRules },
    rules: {
      "raven/prefer-create-v1-route": "error",
    },
  },
  {
    files: ["./src/api-v1/**/*.ts", "./src/api-v1/**/*.tsx"],
    ignores: ["./src/api-v1/db-repositories/**"],
    plugins: { raven: ravenRules },
    rules: {
      "raven/prefer-db-repository": "warn",
    },
  },
  {
    files: ["./src/**/*.ts", "./src/**/*.tsx"],
    plugins: { raven: ravenRules },
    rules: {
      "raven/no-non-tx-db-in-transaction": "warn",
    },
  },
  {
    files: ["./src/**/*.ts", "./src/**/*.tsx"],
    ignores: [
      "./src/db/**",
      "./src/api-v0/db-repositories/**",
      "./src/api-v1/db-repositories/**",
    ],
    plugins: { raven: ravenRules },
    rules: {
      "raven/no-optional-db-dependency": "warn",
    },
  },
  {
    files: ["./src/api-v1/**/*.ts", "./src/api-v1/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-restricted-types": [
        "warn",
        {
          types: {
            unknown: {
              message: "Prefer a specific type instead of `unknown`.",
            },
          },
        },
      ],
    },
  },
  {
    files: ["./**/*.ts", "./**/*.tsx"],
    ignores: ["./tests/**/*"],
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
  {
    files: ["./**/*.ts", "./**/*.tsx"],
    ignores: ["./src/lib/myst/**/*", ...dayjsAllowed],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [typeOnlyEntryPoint, dayjsPath],
          patterns: [
            mystOutsideMystDir,
            citationJsOutsideBibliographyDir,
            dayjsPattern,
          ],
        },
      ],
    },
  },
  {
    files: dayjsAllowed,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [typeOnlyEntryPoint],
          patterns: [mystOutsideMystDir, citationJsOutsideBibliographyDir],
        },
      ],
    },
  },
  {
    files: ["./src/lib/myst/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [typeOnlyEntryPoint, dayjsPath],
          patterns: [
            ...unifiedInsideMystDir,
            citationJsOutsideBibliographyDir,
            dayjsPattern,
          ],
        },
      ],
    },
  },
  {
    files: ["./src/lib/bibliography/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [typeOnlyEntryPoint, dayjsPath],
          patterns: [mystOutsideMystDir, dayjsPattern],
        },
      ],
    },
  },
];

export default config;
