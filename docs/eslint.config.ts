import markdown from "@eslint/markdown";
import ravenRules from "@raven/eslint-rules";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["**/_build/**"] },
  {
    files: ["raven/**/*.md", "thestacks/**/*.md"],
    language: "markdown/gfm",
    plugins: { markdown, raven: ravenRules },
    rules: { "raven/valid-docs-link": "error" },
  },
]);
