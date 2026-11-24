import {
  MDAST_SCHEMA_VERSION,
  MYST_AST_VERSION,
  MYST_MIGRATE_VERSION,
  SUPPORTED_MDAST_SCHEMAS,
  toRequestedVersion,
} from "#src/lib/myst/versions.js";
import { describe, expect, it } from "vitest";

function payloadWithOutputs() {
  return {
    schema: MDAST_SCHEMA_VERSION,
    version: MYST_AST_VERSION,
    tree: {
      type: "root",
      children: [
        {
          type: "outputs",
          children: [
            {
              type: "output",
              jupyter_data: { output_type: "stream", text: "hi" },
              children: [{ type: "text", value: "hi" }],
            },
          ],
        },
      ],
    },
    citations: { order: [] },
  };
}

describe("MyST AST versions", () => {
  it("builds the AST version of the installed myst-migrate", () => {
    expect(MYST_AST_VERSION).toBe(MYST_MIGRATE_VERSION);
  });

  it("supports the current schema", () => {
    expect(SUPPORTED_MDAST_SCHEMAS).toContain(MDAST_SCHEMA_VERSION);
  });
});

describe("toRequestedVersion", () => {
  it.each([
    ["no version", undefined],
    ["the current version", MYST_AST_VERSION],
    ["a newer version", MYST_AST_VERSION + 1],
  ])("returns the payload unchanged for %s", async (_, requested) => {
    const payload = payloadWithOutputs();

    expect(await toRequestedVersion(payload, requested)).toBe(payload);
  });

  it("downgrades to an older version without touching the original", async () => {
    const payload = payloadWithOutputs();
    const original = structuredClone(payload);

    const downgraded = await toRequestedVersion(payload, 2);

    expect(downgraded).toEqual({
      ...original,
      version: 2,
      tree: {
        type: "root",
        children: [
          {
            type: "output",
            data: [{ output_type: "stream", text: "hi" }],
            children: [{ type: "text", value: "hi" }],
          },
        ],
      },
    });
    expect(payload).toEqual(original);
  });
});
