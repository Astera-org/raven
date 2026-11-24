import { CliError, ExitCode } from "#src/errors.js";
import yaml from "js-yaml";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bibliographyPlan,
  formatBibliography,
  readBibliographyFiles,
  type BibliographyFile,
} from "./bibliography-files.js";
import { readPublicationInput } from "./read-input.js";

let root: string;

async function write(path: string, content: string): Promise<string> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
  return full;
}

/** The bibliography of the project at `root`, or of a single file. */
async function bibliographyOf(path = root, page?: string) {
  return readBibliographyFiles(await readPublicationInput(path, { page }));
}

function named(files: BibliographyFile[]) {
  return files.map(({ filename, content }) => [filename, content]);
}

async function expectValidationError(
  promise: Promise<unknown>,
  message: string | RegExp
): Promise<void> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CliError);
  expect((error as CliError).exitCode).toBe(ExitCode.Validation);
  expect((error as CliError).message).toMatch(message);
}

async function writeProject(project: Record<string, unknown> = {}) {
  await write("myst.yml", yaml.dump({ version: 1, project }));
  await write("paper.md", "---\ntitle: T\n---\nBody\n");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "raven-bib-"));
});

describe("readBibliographyFiles", () => {
  it("reads the files myst.yml names, relative to it", async () => {
    await writeProject({ bibliography: ["refs.bib", "bib/more.bib"] });
    await write("refs.bib", "@misc{a, title={A}}");
    await write("bib/more.bib", "@misc{b, title={B}}");

    expect(named(await bibliographyOf())).toEqual([
      ["refs.bib", "@misc{a, title={A}}"],
      ["bib/more.bib", "@misc{b, title={B}}"],
    ]);
  });

  it("takes a single filename as a list of one", async () => {
    await writeProject({ bibliography: "refs.bib" });
    await write("refs.bib", "@misc{a, title={A}}");

    expect(named(await bibliographyOf())).toEqual([
      ["refs.bib", "@misc{a, title={A}}"],
    ]);
  });

  it("discovers every .bib in the project when myst.yml names none", async () => {
    await writeProject();
    await write("refs.bib", "@misc{a}");
    await write("bib/more.bib", "@misc{b}");
    await write("_build/built.bib", "@misc{skip}");
    await write("node_modules/dep.bib", "@misc{skip}");
    await write(".hidden/secret.bib", "@misc{skip}");
    await write("notes.txt", "not bibtex");

    expect(named(await bibliographyOf()).map(([file]) => file)).toEqual([
      "bib/more.bib",
      "refs.bib",
    ]);
  });

  it("adds the files the page's frontmatter names, relative to the page", async () => {
    await writeProject({ bibliography: ["refs.bib"] });
    await write("refs.bib", "@misc{a}");
    await write(
      "chapters/paper.md",
      "---\ntitle: T\nbibliography: [own.bib]\n---\nBody\n"
    );
    await write("chapters/own.bib", "@misc{own}");

    expect(named(await bibliographyOf(root, "chapters/paper.md"))).toEqual([
      ["refs.bib", "@misc{a}"],
      ["chapters/own.bib", "@misc{own}"],
    ]);
  });

  it("sends a file named by both the project and the page once", async () => {
    await write("myst.yml", yaml.dump({ version: 1, project: {} }));
    await write(
      "paper.md",
      "---\ntitle: T\nbibliography: [refs.bib]\n---\nB\n"
    );
    await write("refs.bib", "@misc{a}");

    expect(named(await bibliographyOf()).map(([file]) => file)).toEqual([
      "refs.bib",
    ]);
  });

  it("discovers nothing for a single .md file, but reads its frontmatter", async () => {
    const paper = await write(
      "notes/paper.md",
      "---\ntitle: T\nbibliography: [refs.bib]\n---\nBody\n"
    );
    await write("notes/refs.bib", "@misc{a}");
    // Outside the file's own directory, so never discovered.
    await write("notes/other/stray.bib", "@misc{stray}");

    expect(named(await bibliographyOf(paper))).toEqual([
      ["refs.bib", "@misc{a}"],
    ]);
  });

  it("has no bibliography when nothing names one", async () => {
    const paper = await write("paper.md", "---\ntitle: T\n---\nBody\n");

    expect(await bibliographyOf(paper)).toEqual([]);
  });

  it("refuses a URL, since neither raven nor the server fetches one", async () => {
    await writeProject({
      bibliography: ["https://example.org/refs.bib"],
    });

    await expectValidationError(
      bibliographyOf(),
      /won't fetch a bibliography[\s\S]*https:\/\/example\.org\/refs\.bib \(from myst\.yml\)[\s\S]*Download each file/
    );
  });

  it("refuses a file that doesn't exist, naming what listed it", async () => {
    await writeProject({ bibliography: ["refs.bib"] });

    await expectValidationError(
      bibliographyOf(),
      /names files that don't exist:\n {2}refs\.bib \(from myst\.yml\)/
    );
  });

  it("reports the project directory itself as missing, not outside", async () => {
    await writeProject({ bibliography: ["."] });

    await expectValidationError(
      bibliographyOf(),
      /names files that don't exist:\n {2}\. \(from myst\.yml\)/
    );
  });

  it("refuses a file outside the project", async () => {
    await writeProject({ bibliography: ["../outside.bib"] });
    await writeFile(join(root, "..", "outside.bib"), "@misc{out}");

    await expectValidationError(
      bibliographyOf(),
      /names files outside .*which raven won't send/
    );
  });

  it("refuses a symlink that leaves the project", async () => {
    await writeProject({ bibliography: ["link.bib"] });
    const outside = join(root, "..", `outside-${basename(root)}.bib`);
    await writeFile(outside, "@misc{out}");
    await symlink(outside, join(root, "link.bib"));

    await expectValidationError(
      bibliographyOf(),
      /names files outside .*which raven won't send/
    );
  });
});

describe("bibliographyPlan", () => {
  it("gives each file's name, display path and size", async () => {
    await writeProject({ bibliography: ["refs.bib"] });
    await write("refs.bib", "@misc{a}");

    expect(bibliographyPlan(await bibliographyOf())).toEqual([
      {
        filename: "refs.bib",
        file: expect.stringMatching(/refs\.bib$/),
        bytes: 8,
      },
    ]);
    expect(bibliographyPlan([])).toEqual([]);
  });
});

describe("formatBibliography", () => {
  it("lists each file and its size, or says there is none", async () => {
    await writeProject({ bibliography: ["refs.bib"] });
    await write("refs.bib", "@misc{a}");

    expect(formatBibliography(await bibliographyOf())).toEqual([
      "Bibliography:",
      expect.stringMatching(/^ {2}.*refs\.bib \(8 bytes\)$/),
    ]);
    expect(formatBibliography([])).toEqual(["No bibliography."]);
  });
});
