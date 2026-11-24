import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { displayPath } from "./display-path.js";

describe("displayPath", () => {
  it("is relative inside the working directory", () => {
    expect(
      displayPath(join(process.cwd(), ".raven", "publications.json"))
    ).toBe(join(".raven", "publications.json"));
  });

  it("is absolute outside it", () => {
    expect(displayPath("/elsewhere/.raven/publications.json")).toBe(
      "/elsewhere/.raven/publications.json"
    );
  });
});
