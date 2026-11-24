import { describe, expect, it } from "vitest";

import { lintWithTypes } from "./lint-with-types.js";

function lint(code: string) {
  return lintWithTypes("no-optional-db-dependency", code);
}

describe("no-optional-db-dependency", () => {
  it("flags a destructured repos defaulted to makeRepositories()", () => {
    const messages = lint(
      "export function upload({ body, repos = makeRepositories() }: { body: string; repos?: Repositories }) {}\n"
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("optionalDbDependency");
    expect(messages[0]?.message).toContain("'repos'");
    expect(messages[0]?.severity).toBe(1);
  });

  it("flags an optional repos property that falls back inside the body", () => {
    const code = [
      "export function upload({ repos: maybeRepos }: { repos?: Repositories }) {",
      "  const repos = maybeRepos ?? makeRepositories();",
      "  return repos;",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(1);
  });

  it("flags nullable and aliased-optional db properties", () => {
    const code = [
      "type Deps = { db: RavenDbClient; repos: Repositories };",
      "export function a({ db }: { db: RavenDbTx | null }) {}",
      "export function b(deps: Partial<Deps>) {}",
      "export function c({ db, repos }: Partial<Deps>) {}",
      "",
    ].join("\n");

    const names = lint(code).map((m) => /'(\w+)'/.exec(m.message)?.[1]);
    expect(names).toEqual(["db", "db", "repos", "db", "repos"]);
  });

  it("flags positional optional and defaulted db params", () => {
    const code = [
      "export function a(db?: RavenDbClient) {}",
      "export function b(db: RavenDbClient = getDb()) {}",
      "export const c = (repos: Repositories | undefined) => repos;",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(3);
  });

  it("flags a defaulted constructor parameter property", () => {
    const code =
      "export class Repo { constructor(protected db: RavenDbClient = getDb()) {} }\n";

    expect(lint(code)).toHaveLength(1);
  });

  it("allows required db dependencies", () => {
    const code = [
      "export function a({ repos }: { repos: Repositories }) {}",
      "export function b(db: RavenDbClient, tx: RavenDbTx) {}",
      "export function c(repos: RepositoriesInTransaction) {}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("ignores optional params that aren't db dependencies", () => {
    const code = [
      "export function a({ limit = 10, name }: { limit?: number; name?: string }) {}",
      "export function b(options?: { verbose: boolean }) {}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });
});
