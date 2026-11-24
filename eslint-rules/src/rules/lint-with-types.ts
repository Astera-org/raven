import { Linter } from "eslint";
import path from "node:path";
import tseslint from "typescript-eslint";

import plugin from "../index.js";

const fixturesDir = path.join(import.meta.dirname, "__fixtures__");

/** Minimal stand-ins for the backend's db types; the rules match on these class names. */
export const DB_TYPES_PREAMBLE = [
  "declare class MySql2Database { transaction<T>(fn: (tx: MySqlTransaction) => Promise<T>): Promise<T>; }",
  "declare class MySqlTransaction extends MySql2Database { rollback(): never; }",
  "type RavenDb = MySql2Database & { $client: unknown };",
  "type RavenDbTx = MySqlTransaction;",
  "type RavenDbClient = RavenDb | RavenDbTx;",
  "declare class Repositories {",
  "  constructor(db: RavenDbClient);",
  "  static create(): Repositories;",
  "  transaction<T>(fn: (repos: RepositoriesInTransaction, tx: RavenDbTx) => Promise<T>): Promise<T>;",
  "  withTx(tx: RavenDbTx): RepositoriesInTransaction;",
  "}",
  "declare class RepositoriesInTransaction extends Repositories { rollback(): void; }",
  "declare function getDb(): RavenDb;",
  "declare function makeRepositories(): Repositories;",
  "",
].join("\n");

/**
 * Lints `code` with type information. `__fixtures__/file.ts` exists only so the
 * fixtures tsconfig (strict mode) owns the path; its on-disk content is ignored.
 */
export function lintWithTypes(ruleName: string, code: string) {
  const linter = new Linter();
  const config = [
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: "module" as const,
          tsconfigRootDir: fixturesDir,
          projectService: true,
        },
      },
      plugins: { raven: plugin },
      rules: { [`raven/${ruleName}`]: "warn" as const },
    },
  ];

  // See the note in prefer-api-version-alias.test.ts about this cast.
  return linter.verify(`${DB_TYPES_PREAMBLE}${code}`, config as never, {
    filename: path.join(fixturesDir, "file.ts"),
  });
}
