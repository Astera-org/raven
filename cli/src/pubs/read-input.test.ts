import { CliError, ExitCode } from "#src/errors.js";
import { dump } from "js-yaml";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { splitFrontmatter } from "./frontmatter.js";
import { readPublicationInput } from "./read-input.js";

let root: string;

async function write(path: string, content: string): Promise<string> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
  return full;
}

async function expectUsageError(
  promise: Promise<unknown>,
  message: string | RegExp
): Promise<void> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CliError);
  expect((error as CliError).exitCode).toBe(ExitCode.Usage);
  expect((error as CliError).message).toMatch(message);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "raven-input-"));
});

describe("readPublicationInput", () => {
  it("reads a .md file as is, linked next to it", async () => {
    const path = await write("notes/paper.md", "---\ntitle: T\n---\nBody\n");

    expect(await readPublicationInput(path)).toEqual({
      source: "---\ntitle: T\n---\nBody\n",
      filename: "paper.md",
      directory: join(root, "notes"),
      linkRoot: join(root, "notes"),
      linkPath: "paper.md",
      bibliography: [],
      warnings: [],
    });
  });

  it("rejects missing paths, non-Markdown files and --page with a file", async () => {
    await expectUsageError(
      readPublicationInput(join(root, "missing.md")),
      /no such file or directory/
    );
    const text = await write("paper.txt", "Body");
    await expectUsageError(readPublicationInput(text), /not a Markdown/);
    const md = await write("paper.md", "Body");
    await expectUsageError(
      readPublicationInput(md, { page: "x.md" }),
      /--page only applies/
    );
  });

  it("uses a project's only page, linked at the project root", async () => {
    await write("myst.yml", "version: 1\nproject:\n  title: Project\n");
    await write("content/paper.md", "---\ntitle: Paper\n---\nBody\n");
    await write("_build/ignored.md", "x");
    await write("node_modules/pkg/README.md", "x");
    await write(".github/notes.md", "x");

    const input = await readPublicationInput(root);

    expect(input).toMatchObject({
      source: "---\ntitle: Paper\n---\nBody\n",
      filename: "paper.md",
      linkRoot: root,
      linkPath: "content/paper.md",
    });
  });

  it("inherits mystmd's fallback keys from the project, not the title", async () => {
    await write(
      "myst.yml",
      dump({
        version: 1,
        project: {
          title: "Project title",
          subtitle: "Project subtitle",
          license: "CC-BY-4.0",
          keywords: ["project"],
          doi: "10.1234/project",
        },
      })
    );
    await write(
      "paper.md",
      "---\ntitle: Paper\nkeywords: [paper]\n---\n\nBody\n"
    );

    const { source } = await readPublicationInput(root);
    const { frontmatter, body } = splitFrontmatter(source, "paper.md");

    expect(frontmatter).toEqual({
      title: "Paper",
      keywords: ["paper"],
      license: "CC-BY-4.0",
      doi: "10.1234/project",
    });
    expect(body).toBe("\nBody\n");
  });

  it("gives a page without numbering or math the project's", async () => {
    await write(
      "myst.yml",
      dump({
        version: 1,
        project: {
          numbering: { headings: true },
          math: { "\\R": "\\mathbb{R}" },
        },
      })
    );
    await write("paper.md", "---\ntitle: Paper\n---\n\nBody\n");

    const { source } = await readPublicationInput(root);

    expect(splitFrontmatter(source, "paper.md").frontmatter).toEqual({
      title: "Paper",
      numbering: { headings: true },
      math: { "\\R": "\\mathbb{R}" },
    });
  });

  it("combines the page's numbering and math with the project's, the page's winning", async () => {
    await write(
      "myst.yml",
      dump({
        version: 1,
        project: {
          numbering: { headings: true, equation: { template: "Eq. %s" } },
          math: { "\\R": "\\mathbb{R}", "\\N": "\\mathbb{N}" },
        },
      })
    );
    await write(
      "paper.md",
      [
        "---",
        "title: Paper",
        "numbering:",
        "  heading_2: false",
        "math:",
        "  '\\N': '\\mathbf{N}'",
        "---",
        "",
        "Body",
        "",
      ].join("\n")
    );

    const { source } = await readPublicationInput(root);

    const { frontmatter } = splitFrontmatter(source, "paper.md");
    expect(frontmatter?.math).toEqual({
      "\\R": "\\mathbb{R}",
      "\\N": "\\mathbf{N}",
    });
    expect(frontmatter?.numbering).toEqual({
      equation: { enabled: true, template: "Eq. %s" },
      heading_1: { enabled: true },
      heading_2: { enabled: false },
      heading_3: { enabled: true },
      heading_4: { enabled: true },
      heading_5: { enabled: true },
      heading_6: { enabled: true },
    });
  });

  it("refuses numbering it can't combine", async () => {
    await write(
      "myst.yml",
      dump({ version: 1, project: { numbering: "headings" } })
    );
    await write("paper.md", "---\nnumbering:\n  headings: true\n---\n\nBody\n");

    const error = await readPublicationInput(root).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).exitCode).toBe(ExitCode.Validation);
    expect((error as CliError).message).toMatch(/numbering.*myst\.yml/);
  });

  it("adds frontmatter to a page without any", async () => {
    await write("myst.yml", "version: 1\nproject:\n  license: CC0-1.0\n");
    await write("paper.md", "# Title\n\nBody\n");

    const { source } = await readPublicationInput(root);

    expect(source).toBe("---\nlicense: CC0-1.0\n---\n\n# Title\n\nBody\n");
  });

  it("asks for --page when the project has several pages", async () => {
    await write("myst.yml", "version: 1\n");
    await write("README.md", "Readme");
    await write("paper.md", "Paper");

    await expectUsageError(
      readPublicationInput(root),
      /several pages; pick one with --page <file>:\n {2}README\.md\n {2}paper\.md/
    );
    expect(
      (await readPublicationInput(root, { page: "paper.md" })).source
    ).toBe("Paper");
  });

  it("takes the pages from the toc", async () => {
    await write(
      "myst.yml",
      dump({
        version: 1,
        project: { toc: [{ file: "paper.md" }] },
      })
    );
    await write("paper.md", "Paper");
    await write("README.md", "Readme");

    expect((await readPublicationInput(root)).linkPath).toBe("paper.md");
  });

  it("lists nested toc entries and refuses toc patterns", async () => {
    await write(
      "myst.yml",
      dump({
        version: 1,
        project: {
          toc: [{ file: "a.md", children: [{ file: "b.md" }] }],
        },
      })
    );
    await expectUsageError(readPublicationInput(root), /a\.md\n {2}b\.md/);

    await write(
      "myst.yml",
      dump({ version: 1, project: { toc: [{ pattern: "*.md" }] } })
    );
    await expectUsageError(readPublicationInput(root), /toc pattern/);
  });

  it("warns that extends is ignored", async () => {
    await write("myst.yml", "version: 1\nextends: ../base.yml\n");
    await write("paper.md", "Paper");

    expect((await readPublicationInput(root)).warnings).toEqual([
      'myst.yml uses "extends", which raven ignores',
    ]);
  });

  it("explains a directory without myst.yml", async () => {
    await expectUsageError(readPublicationInput(root), /has no myst\.yml/);
  });
});
