import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import plugin from "../index.js";

const linter = new Linter();

const config = [
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022 as const,
        sourceType: "module" as const,
      },
    },
    plugins: { raven: plugin },
    rules: { "raven/prefer-create-v1-route": "error" as const },
  },
];

// See prefer-api-version-alias.test.ts for why the config is cast.
function lint(code: string) {
  return linter.verify(code, config as never);
}

function fix(code: string) {
  return linter.verifyAndFix(code, config as never);
}

const REPLACEMENT_IMPORT =
  'import { createV1Route } from "#v1/lib/create-v1-route.js";';

describe("prefer-create-v1-route", () => {
  it("replaces a sole createRoute import and renames its calls", () => {
    const code = [
      'import { createRoute } from "@hono/zod-openapi";',
      "export const route = createRoute({ path: '/' });",
      "",
    ].join("\n");

    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("createV1Route");
    expect(fix(code).output).toBe(
      [
        REPLACEMENT_IMPORT,
        "export const route = createV1Route({ path: '/' });",
        "",
      ].join("\n")
    );
  });

  it("keeps the other specifiers when createRoute is first", () => {
    const code = [
      'import { createRoute, z, type RouteHandler } from "@hono/zod-openapi";',
      "const route = createRoute({ request: { params: z.object({}) } });",
      "",
    ].join("\n");

    expect(fix(code).output).toBe(
      [
        'import { z, type RouteHandler } from "@hono/zod-openapi";',
        REPLACEMENT_IMPORT,
        "const route = createV1Route({ request: { params: z.object({}) } });",
        "",
      ].join("\n")
    );
  });

  it("keeps the other specifiers when createRoute is last", () => {
    const code = [
      'import { z, createRoute } from "@hono/zod-openapi";',
      "createRoute({});",
      "",
    ].join("\n");

    expect(fix(code).output).toBe(
      [
        'import { z } from "@hono/zod-openapi";',
        REPLACEMENT_IMPORT,
        "createV1Route({});",
        "",
      ].join("\n")
    );
  });

  it("renames calls made through an alias", () => {
    const code = [
      'import { createRoute as cr } from "@hono/zod-openapi";',
      "cr({});",
      "",
    ].join("\n");

    expect(fix(code).output).toBe(
      [REPLACEMENT_IMPORT, "createV1Route({});", ""].join("\n")
    );
  });

  it("doesn't add a second createV1Route import", () => {
    const code = [
      REPLACEMENT_IMPORT,
      'import { createRoute, z } from "@hono/zod-openapi";',
      "createRoute({});",
      "",
    ].join("\n");

    expect(fix(code).output).toBe(
      [
        REPLACEMENT_IMPORT,
        'import { z } from "@hono/zod-openapi";',
        "createV1Route({});",
        "",
      ].join("\n")
    );
  });

  it("allows type-only imports of createRoute", () => {
    expect(
      lint('import { type createRoute } from "@hono/zod-openapi";\n')
    ).toHaveLength(0);
    expect(
      lint('import type { createRoute } from "@hono/zod-openapi";\n')
    ).toHaveLength(0);
  });

  it("ignores other @hono/zod-openapi imports and other sources", () => {
    expect(
      lint('import { z, OpenAPIHono } from "@hono/zod-openapi";\n')
    ).toHaveLength(0);
    expect(
      lint('import { createRoute } from "./elsewhere.js";\n')
    ).toHaveLength(0);
  });
});
