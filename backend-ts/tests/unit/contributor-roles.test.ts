import { toContributorRole } from "#v1/routes/publications/helpers/contributor-roles.js";
import { describe, expect, it } from "vitest";

describe("toContributorRole", () => {
  it("keeps CRediT roles the editor offers under the same name", () => {
    expect(toContributorRole("Conceptualization")).toBe("Conceptualization");
    expect(toContributorRole("Data curation")).toBe("Data curation");
  });

  it("maps the CRediT writing roles onto Writing and Editing", () => {
    expect(toContributorRole("Writing – original draft")).toBe("Writing");
    expect(toContributorRole("Writing – review & editing")).toBe("Editing");
  });

  it("ignores case, spacing and the kind of dash", () => {
    expect(toContributorRole("  writing -  review & editing ")).toBe("Editing");
    expect(toContributorRole("critical FEEDBACK")).toBe("Critical feedback");
  });

  it("has no role for Funding acquisition or unknown roles", () => {
    expect(toContributorRole("Funding acquisition")).toBeUndefined();
    expect(toContributorRole("Cheerleading")).toBeUndefined();
  });
});
