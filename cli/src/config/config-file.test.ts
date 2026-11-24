import { CliError } from "#src/errors.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { configFilePath, readConfig, writeConfig } from "./config-file.js";

describe("config file", () => {
  let configDir: string;

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), "raven-cli-config-"));
  });

  it("reads a missing file as an empty config", async () => {
    await expect(readConfig(join(configDir, "missing"))).resolves.toEqual({
      profiles: {},
    });
  });

  it("round-trips profiles through TOML", async () => {
    const config = {
      current: "staging",
      profiles: {
        local: { apiUrl: "http://localhost:7001", user: "alice" },
        staging: { apiUrl: "https://api.staging.thestacks.org" },
      },
    };

    await writeConfig(configDir, config);

    await expect(readConfig(configDir)).resolves.toEqual(config);
  });

  it("rejects malformed TOML", async () => {
    await writeFile(configFilePath(configDir), "current = ");

    await expect(readConfig(configDir)).rejects.toBeInstanceOf(CliError);
  });

  it("rejects a profile without a valid server URL", async () => {
    await writeFile(
      configFilePath(configDir),
      '[profiles.local]\napiUrl = "localhost:7001"\n'
    );

    await expect(readConfig(configDir)).rejects.toThrow(/invalid config file/);
  });
});
