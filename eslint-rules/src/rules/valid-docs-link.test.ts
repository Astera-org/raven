import path from "node:path";

import markdown from "@eslint/markdown";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "../index.js";

const linter = new Linter();

const config = [
  {
    files: ["**/*.md"],
    language: "markdown/gfm",
    plugins: { markdown, raven: plugin },
    rules: { "raven/valid-docs-link": "error" as const },
  },
];

const filename = path.join(import.meta.dirname, "__fixtures__/docs/index.md");

// See prefer-api-version-alias.test.ts for why the config is cast.
function lint(code: string) {
  return linter.verify(code, config as never, filename);
}

describe("valid-docs-link", () => {
  it("allows relative links to existing source files", () => {
    expect(lint("[guide](./guide/index.md#setup)\n")).toEqual([]);
    expect(lint("[guide]: guide/index.md\n\n[x][guide]\n")).toEqual([]);
  });

  it("ignores external, absolute and anchor links", () => {
    const code = [
      "[a](https://example.org/guide/)",
      "[b](mailto:hi@example.org)",
      "[c](/authors/guide/)",
      "[d](#section)",
      "[e](raven:docs)",
      "",
    ].join("\n");
    expect(lint(code)).toEqual([]);
  });

  it("flags directory and extensionless links", () => {
    const messages = lint("[a](./guide/)\n\n[b](guide)\n\n[c]: ./guide/\n");
    expect(messages.map((m) => m.messageId)).toEqual([
      "linkToSourceFile",
      "linkToSourceFile",
      "linkToSourceFile",
    ]);
    expect(messages[0]?.message).toContain("'./guide/'");
  });

  it("flags links to files that do not exist", () => {
    const messages = lint("[a](./guide/missing.md)\n");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("missingTarget");
    expect(messages[0]?.line).toBe(1);
  });
});
