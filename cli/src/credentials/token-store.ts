import { isMissingFile } from "#src/fs-errors.js";
import { AsyncEntry } from "@napi-rs/keyring";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const KEYCHAIN_SERVICE = "raven-cli";
export const CREDENTIALS_FILE_NAME = "credentials.json";

/** Stores one token per profile name. */
export interface TokenStore {
  get(profile: string): Promise<string | undefined>;
  set(profile: string, token: string): Promise<void>;
  delete(profile: string): Promise<void>;
}

export class KeychainTokenStore implements TokenStore {
  async get(profile: string): Promise<string | undefined> {
    // Typed as `string | undefined`, but a missing entry comes back as null.
    const token = await new AsyncEntry(KEYCHAIN_SERVICE, profile).getPassword();
    return token ?? undefined;
  }

  async set(profile: string, token: string): Promise<void> {
    await new AsyncEntry(KEYCHAIN_SERVICE, profile).setPassword(token);
  }

  async delete(profile: string): Promise<void> {
    await new AsyncEntry(KEYCHAIN_SERVICE, profile).deletePassword();
  }
}

/** Plain JSON file readable only by the current user (mode 0600). */
export class FileTokenStore implements TokenStore {
  private readonly path: string;

  constructor(private readonly configDir: string) {
    this.path = join(configDir, CREDENTIALS_FILE_NAME);
  }

  async get(profile: string): Promise<string | undefined> {
    const tokens = await this.read();
    return tokens[profile];
  }

  async set(profile: string, token: string): Promise<void> {
    const tokens = await this.read();
    await this.write({ ...tokens, [profile]: token });
  }

  async delete(profile: string): Promise<void> {
    const tokens = await this.read();
    if (!(profile in tokens)) return;
    const { [profile]: _removed, ...rest } = tokens;
    await this.write(rest);
  }

  private async read(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Record<
        string,
        string
      >;
    } catch (error) {
      if (isMissingFile(error)) return {};
      throw error;
    }
  }

  private async write(tokens: Record<string, string>): Promise<void> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${JSON.stringify(tokens, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(this.path, 0o600);
  }
}

/**
 * Uses the OS keychain, falling back to the file store when the keychain is
 * unavailable (e.g. a Linux machine with no secret service running).
 */
export class FallbackTokenStore implements TokenStore {
  constructor(
    private readonly primary: TokenStore,
    private readonly fallback: TokenStore
  ) {}

  async get(profile: string): Promise<string | undefined> {
    try {
      const token = await this.primary.get(profile);
      if (token !== undefined) return token;
    } catch {
      // Keychain unavailable; the fallback store is the source of truth.
    }
    return this.fallback.get(profile);
  }

  async set(profile: string, token: string): Promise<void> {
    try {
      await this.primary.set(profile, token);
      try {
        await this.fallback.delete(profile);
      } catch {
        // The keychain is authoritative while it is available.
      }
    } catch {
      await this.fallback.set(profile, token);
    }
  }

  async delete(profile: string): Promise<void> {
    try {
      await this.primary.delete(profile);
    } catch {
      // Keychain unavailable; still clear any token in the fallback store.
    }
    await this.fallback.delete(profile);
  }
}

export function createTokenStore(configDir: string): TokenStore {
  return new FallbackTokenStore(
    new KeychainTokenStore(),
    new FileTokenStore(configDir)
  );
}
