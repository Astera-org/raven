import {
  PatchPublicationPermissiveSchema,
  PatchPublicationStrictSchema,
} from "#v1/routes/publications/route-requests/patch-publication.js";
import { describe, expect, it } from "vitest";

const SUBJECT = {
  subject: "FOS: Computer and information sciences",
  subjectScheme: "Fields of Science and Technology (FOS)",
};

function strictIssuePaths(body: unknown) {
  const result = PatchPublicationStrictSchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path);
}

describe("PatchPublicationStrictSchema subjects", () => {
  it("accepts subjects with and without a scheme", () => {
    const subjects = [SUBJECT, { subject: "Neuroscience" }];
    expect(PatchPublicationStrictSchema.parse({ subjects })).toEqual({
      subjects,
    });
  });

  it("leaves subjects out when the body omits them", () => {
    expect(PatchPublicationStrictSchema.parse({})).not.toHaveProperty(
      "subjects"
    );
  });

  it("rejects an empty subjects array", () => {
    expect(strictIssuePaths({ subjects: [] })).toEqual([["subjects"]]);
  });

  it("rejects an empty subject string", () => {
    expect(strictIssuePaths({ subjects: [{ subject: "" }] })).toEqual([
      ["subjects", 0, "subject"],
    ]);
  });

  it("rejects an empty subject scheme", () => {
    expect(
      strictIssuePaths({
        subjects: [{ subject: "Neuroscience", subjectScheme: "" }],
      })
    ).toEqual([["subjects", 0, "subjectScheme"]]);
  });

  it("rejects a subject with no subject string", () => {
    expect(strictIssuePaths({ subjects: [{ subjectScheme: "FOS" }] })).toEqual([
      ["subjects", 0, "subject"],
    ]);
  });

  it("rejects null, since the stored metadata always has subjects", () => {
    expect(strictIssuePaths({ subjects: null })).toEqual([["subjects"]]);
  });

  it("reports only the subjects issue when the other fields are valid", () => {
    expect(strictIssuePaths({ title: "Title", subjects: [] })).toEqual([
      ["subjects"],
    ]);
  });
});

describe("PatchPublicationPermissiveSchema subjects", () => {
  it("lets an empty array through for the strict pass to reject", () => {
    expect(
      PatchPublicationPermissiveSchema.safeParse({ subjects: [] }).success
    ).toBe(true);
  });

  it("rejects an empty subject string outright", () => {
    expect(
      PatchPublicationPermissiveSchema.safeParse({
        subjects: [{ subject: "" }],
      }).success
    ).toBe(false);
  });

  it("rejects subjects that aren't a list of subject objects", () => {
    expect(
      PatchPublicationPermissiveSchema.safeParse({ subjects: "Neuroscience" })
        .success
    ).toBe(false);
  });
});
