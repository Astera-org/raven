import { MemoryTokenStore } from "#src/testing/test-runtime.js";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CREDENTIALS_FILE_NAME,
  FallbackTokenStore,
  FileTokenStore,
  type TokenStore,
} from "./token-store.js";

class UnavailableKeychain implements TokenStore {
  get(): Promise<string | undefined> {
    return Promise.reject(new Error("no secret service"));
  }
  set(): Promise<void> {
    return Promise.reject(new Error("no secret service"));
  }
  delete(): Promise<void> {
    return Promise.reject(new Error("no secret service"));
  }
}

describe("FileTokenStore", () => {
  let configDir: string;

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), "raven-cli-tokens-"));
  });

  it("stores tokens per profile in a 0600 file", async () => {
    const store = new FileTokenStore(configDir);

    await store.set("local", "a");
    await store.set("staging", "b");
    await store.delete("local");

    expect(await store.get("local")).toBeUndefined();
    expect(await store.get("staging")).toBe("b");
    const { mode } = await stat(join(configDir, CREDENTIALS_FILE_NAME));
    expect(mode & 0o777).toBe(0o600);
  });

  it("returns undefined when no file exists", async () => {
    await expect(new FileTokenStore(configDir).get("local")).resolves.toBe(
      undefined
    );
  });
});

describe("FallbackTokenStore", () => {
  it("uses the primary store when it works", async () => {
    const primary = new MemoryTokenStore();
    const fallback = new MemoryTokenStore();
    const store = new FallbackTokenStore(primary, fallback);

    await store.set("local", "token");

    expect(primary.tokens).toEqual({ local: "token" });
    expect(fallback.tokens).toEqual({});
    expect(await store.get("local")).toBe("token");
  });

  it("falls back when the keychain is unavailable", async () => {
    const fallback = new MemoryTokenStore();
    const store = new FallbackTokenStore(new UnavailableKeychain(), fallback);

    await store.set("local", "token");
    expect(await store.get("local")).toBe("token");

    await store.delete("local");
    expect(fallback.tokens).toEqual({});
  });
});
