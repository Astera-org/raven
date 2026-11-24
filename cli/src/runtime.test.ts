import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfigDir } from "./runtime.js";

describe("defaultConfigDir", () => {
  it("uses ~/.config/raven on macOS and Linux", () => {
    expect(defaultConfigDir({}, "darwin")).toBe(
      join(homedir(), ".config", "raven")
    );
    expect(defaultConfigDir({}, "linux")).toBe(
      join(homedir(), ".config", "raven")
    );
  });

  it("respects XDG_CONFIG_HOME and RAVEN_CONFIG_DIR", () => {
    expect(defaultConfigDir({ XDG_CONFIG_HOME: "/xdg" }, "linux")).toBe(
      join("/xdg", "raven")
    );
    expect(
      defaultConfigDir(
        { RAVEN_CONFIG_DIR: "/custom", XDG_CONFIG_HOME: "/xdg" },
        "darwin"
      )
    ).toBe("/custom");
  });
});
