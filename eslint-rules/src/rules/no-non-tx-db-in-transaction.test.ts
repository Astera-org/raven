import { describe, expect, it } from "vitest";

import { lintWithTypes } from "./lint-with-types.js";

function lint(code: string) {
  return lintWithTypes("no-non-tx-db-in-transaction", code);
}

describe("no-non-tx-db-in-transaction", () => {
  it("flags makeRepositories() inside a getDb().transaction callback", () => {
    const code = [
      "declare function upload(args: { repos: Repositories }): Promise<void>;",
      "export async function handler() {",
      "  await getDb().transaction(async (tx) => {",
      "    await upload({ repos: makeRepositories() });",
      "  });",
      "}",
      "",
    ].join("\n");

    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("nonTxDbInTransaction");
    expect(messages[0]?.message).toContain("'makeRepositories()'");
    expect(messages[0]?.severity).toBe(1);
  });

  it("flags a hoisted repos used inside its own transaction callback", () => {
    const code = [
      "declare function upload(args: { repos: Repositories }): Promise<void>;",
      "export async function handler() {",
      "  const repos = makeRepositories();",
      "  await repos.transaction(async (txRepos) => {",
      "    await upload({ repos });",
      "  });",
      "}",
      "",
    ].join("\n");

    const messages = lint(code);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("'repos'");
  });

  it("flags getDb() and a hoisted db inside a transaction, including in nested callbacks", () => {
    const code = [
      "export async function handler(ids: number[]) {",
      "  const db = getDb();",
      "  await db.transaction(async (tx) => {",
      "    await Promise.all(ids.map(async () => getDb()));",
      "    return db;",
      "  });",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(2);
  });

  it("reports an outer db once when it is used inside nested transaction callbacks", () => {
    const code = [
      "export async function handler() {",
      "  const db = getDb();",
      "  await db.transaction(async (tx) => tx.transaction(async () => db));",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(1);
  });

  it("allows references to the Repositories class itself", () => {
    const code = [
      "export async function handler(value: unknown) {",
      "  await getDb().transaction(async (tx) => {",
      "    const repos = new Repositories(tx);",
      "    return [repos, value instanceof Repositories, Repositories.create];",
      "  });",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("allows the transaction's own client and withTx-bound repositories", () => {
    const code = [
      "declare function upload(args: { repos: Repositories }): Promise<void>;",
      "export async function handler(outerDb: RavenDbClient) {",
      "  const repos = makeRepositories();",
      "  await getDb().transaction(async (tx) => {",
      "    await upload({ repos: makeRepositories().withTx(tx) });",
      "    await upload({ repos: repos.withTx(tx) });",
      "    return [tx, outerDb];",
      "  });",
      "  await repos.transaction(async (txRepos, tx) => {",
      "    await upload({ repos: txRepos });",
      "  });",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });

  it("allows non-tx db usage outside transaction callbacks", () => {
    const code = [
      "export async function handler() {",
      "  const repos = makeRepositories();",
      "  await getDb().transaction(async (tx) => tx);",
      "  return [repos, getDb()];",
      "}",
      "",
    ].join("\n");

    expect(lint(code)).toHaveLength(0);
  });
});
