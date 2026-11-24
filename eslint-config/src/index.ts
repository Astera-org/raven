import js from "@eslint/js";
import packageJson from "eslint-plugin-package-json";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig } from "eslint/config";
import tseslint, { type ConfigArray, type FlatConfig } from "typescript-eslint";

const unusedImportsRules: FlatConfig.Rules = {
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "error",
    {
      vars: "all",
      varsIgnorePattern: "^_",
      args: "after-used",
      argsIgnorePattern: "^_",
    },
  ],
};

const config: ConfigArray = [
  {
    ignores: ["dist", "build", "node_modules", ".react-router"],
  },
  js.configs.recommended,
  ...defineConfig({
    files: ["**/*.{ts,tsx}"],
    extends: tseslint.configs.recommended,
  }),
  packageJson.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": "error",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@raven/backend-ts/types",
              message:
                "@raven/backend-ts/types is a type-only entry point; use `type` imports.",
              allowTypeImports: true,
            },
          ],
        },
      ],
      ...unusedImportsRules,
    },
  },
  {
    files: ["**/package.json"],
    rules: {
      "package-json/sort-collections": "error",
      "package-json/valid-packageManager": "error",
      "package-json/require-license": "off",
      "package-json/require-repository": "off",
      "package-json/require-sideEffects": "off",
      "package-json/require-attribution": "off",
      "package-json/require-exports": "off",
      "package-json/require-files": "off",
    },
  },
];

export default config;
