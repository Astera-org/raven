import { CliError, ExitCode } from "#src/errors.js";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { findLocalFiles } from "./local-media/index.js";
import { readMediaFiles } from "./upload-media.js";

let base: string;
let project: string;

async function write(path: string, content: string): Promise<string> {
  const full = join(base, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
  return full;
}

function read(source: string) {
  return readMediaFiles({
    media: findLocalFiles(source).media,
    directory: join(project, "pages"),
    root: project,
    file: "pages/paper.md",
  });
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "raven-media-"));
  project = join(base, "project");
  await write("project/pages/paper.md", "");
});

describe("readMediaFiles", () => {
  it("reads files inside the root, relative to the page", async () => {
    await write("project/pages/a.png", "a");
    await write("project/figures/b.png", "b");

    const files = await read("![](a.png)\n\n![](../figures/b.png)");

    expect(files.map(({ target, data }) => [target, String(data)])).toEqual([
      ["a.png", "a"],
      ["../figures/b.png", "b"],
    ]);
  });

  it("refuses files outside the root, absolute paths and symlinks out of it", async () => {
    const secret = await write("secret.png", "secret");
    await symlink(secret, join(project, "pages", "link.png"));

    const error = await read(
      [
        "![](../../secret.png)",
        "",
        `![](${secret})`,
        "",
        "![](link.png)",
        "",
        "![](../../missing.png)",
      ].join("\n")
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).exitCode).toBe(ExitCode.Validation);
    expect((error as CliError).message).toBe(
      [
        `pages/paper.md references files outside ${project}, which raven won't upload; move them inside it or use absolute URLs:`,
        "  line 1: ../../secret.png",
        `  line 3: ${secret}`,
        "  line 5: link.png",
        "  line 7: ../../missing.png",
      ].join("\n")
    );
  });

  it("lists missing files inside the root", async () => {
    const error = await read("![](gone.png)").catch((e: unknown) => e);

    expect((error as CliError).message).toBe(
      "pages/paper.md references files that don't exist:\n  line 1: gone.png"
    );
  });

  it("says a query or fragment isn't supported on a missing file", async () => {
    await write("project/pages/plot.svg", "svg");

    const error = await read("![](plot.svg#panel)").catch((e: unknown) => e);

    expect((error as CliError).message).toBe(
      [
        "pages/paper.md references files that don't exist:",
        "  line 1: plot.svg#panel",
        "Local image paths can't have a ?query or #fragment; remove it.",
      ].join("\n")
    );
  });
});
