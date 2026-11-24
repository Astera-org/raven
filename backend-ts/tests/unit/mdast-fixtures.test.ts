import { buildPublicationMdast } from "#src/lib/myst/build-publication-mdast.js";
import {
  MYST_AST_VERSION,
  toRequestedVersion,
} from "#src/lib/myst/versions.js";
import { importMystmd } from "@raven/importer-mystmd";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// thestacks.org tests its renderer against copies of these files. If this
// fails after a deliberate change, run `pnpm generate:mdast-fixtures` and
// copy the files over (see the initial-myst-support skill).
const dir = join(import.meta.dirname, "../fixtures/myst");

function fixture(version: number) {
  return JSON.parse(
    readFileSync(join(dir, `sample.v${version}.mdast.json`), "utf-8")
  );
}

function buildSample() {
  const { abstract, body } = importMystmd(
    readFileSync(join(dir, "sample.md"), "utf-8")
  ).version;
  const {
    messages: _messages,
    citedKeys: _citedKeys,
    citedEntries: _citedEntries,
    ...payload
  } = buildPublicationMdast({
    abstract,
    body,
  });
  return payload;
}

describe("the shared MyST AST fixtures", () => {
  it("match what the builder produces now", () => {
    expect(buildSample()).toEqual(fixture(MYST_AST_VERSION));
  });

  it("match the downgrade to the previous version", async () => {
    expect(
      await toRequestedVersion(buildSample(), MYST_AST_VERSION - 1)
    ).toEqual(fixture(MYST_AST_VERSION - 1));
  });
});
