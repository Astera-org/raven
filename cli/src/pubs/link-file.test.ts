import { CliError } from "#src/errors.js";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { LinkFile } from "./link-file.js";

const SERVER = "https://api.thestacks.org";
const LINK = { id: "01PUB", slug: "a-study-01pub", etag: '"abc"' };

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "raven-links-"));
});

describe("LinkFile", () => {
  it("starts empty when there's no file", async () => {
    const links = await LinkFile.read(root);

    expect(links.path).toBe(join(root, ".raven", "publications.json"));
    expect(links.get(SERVER, "paper.md")).toBeUndefined();
  });

  it("stores links per server and source path", async () => {
    const links = await LinkFile.read(root);
    await links.set(SERVER, "paper.md", LINK);
    await links.set("http://localhost:7001", "paper.md", {
      ...LINK,
      id: "01LOCAL",
    });

    const reread = await LinkFile.read(root);
    expect(reread.get(SERVER, "paper.md")).toEqual(LINK);
    expect(reread.get("http://localhost:7001", "paper.md")?.id).toBe("01LOCAL");
    expect(JSON.parse(await readFile(links.path, "utf8"))).toEqual({
      version: 1,
      servers: {
        [SERVER]: { "paper.md": LINK },
        "http://localhost:7001": { "paper.md": { ...LINK, id: "01LOCAL" } },
      },
    });
    expect(await readdir(join(root, ".raven"))).toEqual(["publications.json"]);
  });

  it("rejects a malformed file", async () => {
    await mkdir(join(root, ".raven"));
    await writeFile(
      join(root, ".raven", "publications.json"),
      '{"version": 2}'
    );

    await expect(LinkFile.read(root)).rejects.toThrow(CliError);
    await expect(LinkFile.read(root)).rejects.toThrow(/invalid link file/);
  });
});
