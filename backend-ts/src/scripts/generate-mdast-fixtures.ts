/**
 * Regenerates the shared MyST AST fixtures from `tests/fixtures/myst/sample.md`:
 * `sample.v<MYST_AST_VERSION>.mdast.json` and the previous version through the
 * downgrade path, both as a published version is served (no `messages`).
 * Run it whenever `MYST_AST_VERSION` or the builder changes, then copy the
 * files to thestacks.org's `frontend/test/fixtures/mystmd/`
 * (see the `initial-myst-support` skill).
 */
import { buildPublicationMdast } from "#src/lib/myst/build-publication-mdast.js";
import {
  MYST_AST_VERSION,
  toRequestedVersion,
} from "#src/lib/myst/versions.js";
import { importMystmd } from "@raven/importer-mystmd";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "../../tests/fixtures/myst");
const { abstract, body } = importMystmd(
  readFileSync(join(dir, "sample.md"), "utf-8")
).version;
const {
  messages: _messages,
  citedKeys: _citedKeys,
  citedEntries: _citedEntries,
  ...latest
} = buildPublicationMdast({
  abstract,
  body,
});

for (const version of [MYST_AST_VERSION, MYST_AST_VERSION - 1]) {
  const payload = await toRequestedVersion(latest, version);
  const file = join(dir, `sample.v${version}.mdast.json`);
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${file}`);
}
