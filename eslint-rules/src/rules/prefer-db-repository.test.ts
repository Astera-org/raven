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
    rules: { "raven/prefer-db-repository": "warn" as const },
  },
];

// See the note in prefer-api-version-alias.test.ts about this cast.
function lint(code: string) {
  return linter.verify(code, config as never);
}

describe("prefer-db-repository", () => {
  it("flags an inline getDb().select(...) chain", () => {
    const code = [
      'import { getDb } from "#src/db/index.js";',
      "",
      "export async function getOrg() {",
      "  return getDb().select().from(organizations);",
      "}",
      "",
    ].join("\n");

    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("preferRepository");
    expect(messages[0]?.severity).toBe(1);
  });

  it("flags getDb() assigned to a variable and queried later", () => {
    const code = [
      'import { getDb } from "#src/db/index.js";',
      "",
      "export async function getPublication() {",
      "  const db = getDb();",
      "  return db.query.publications.findFirst();",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(1);
  });

  it("flags a renamed getDb import", () => {
    const code = [
      'import { getDb as getDatabase } from "#src/db/index.js";',
      "",
      "getDatabase().select();",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(1);
  });

  it("does not flag a same-named function that isn't the db's getDb", () => {
    const code = [
      'import { getDb } from "some-other-module.js";',
      "",
      "getDb();",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("does not flag unrelated calls", () => {
    const code = [
      'import { getConfig } from "#src/config.js";',
      "",
      "getConfig();",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("does not flag files that never call getDb or instantiate a repository class", () => {
    const code = [
      'import { Repositories } from "#src/api-v1/db-repositories/index.js";',
      "",
      "new Repositories().orgs.findOrgByIdentifier('x');",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("flags instantiating an individual repository class directly", () => {
    const code = [
      'import { OrgsRepository } from "#src/api-v1/db-repositories/orgs-repository.js";',
      "",
      "new OrgsRepository().findOrgByIdentifier('x');",
      "",
    ].join("\n");

    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("preferRepositoriesFacade");
    expect(messages[0]?.message).toContain("OrgsRepository");
  });

  it("flags a repository class imported via a relative path", () => {
    const code = [
      'import { UsersRepository } from "../db-repositories/users-repository.js";',
      "",
      "new UsersRepository();",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(1);
  });

  it("does not flag the Repositories facade itself", () => {
    const code = [
      'import { Repositories } from "#src/api-v1/db-repositories/index.js";',
      "",
      "new Repositories();",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("does not flag a same-named class that isn't from db-repositories", () => {
    const code = [
      'import { OrgsRepository } from "./some-other-module.js";',
      "",
      "new OrgsRepository();",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });
});
