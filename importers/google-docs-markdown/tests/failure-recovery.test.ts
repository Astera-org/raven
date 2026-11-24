import { importGoogleDoc } from "#src/index.js";
import { ImporterError, type ImporterContext } from "@raven/core-import-format";
import type * as MystRenderer from "@raven/core-myst-renderer";
import type { Root } from "mdast";
import type * as RemarkGfm from "remark-gfm";
import { describe, expect, it, vi } from "vitest";

// No known input makes these fail, so the dependencies are made to fail on a
// marker string instead.
vi.mock("@raven/core-myst-renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof MystRenderer>();
  return {
    ...actual,
    processMystSync: (...args: Parameters<typeof actual.processMystSync>) => {
      if (args[0].includes("FAIL_CELL")) throw new Error("renderer broke");
      return actual.processMystSync(...args);
    },
  };
});

vi.mock("remark-gfm", async (importOriginal) => {
  const actual = await importOriginal<typeof RemarkGfm>();
  return {
    default: function (this: unknown, ...args: unknown[]) {
      Reflect.apply(actual.default, this, args);
      return (tree: Root) => {
        if (JSON.stringify(tree).includes("FAIL_DOC")) {
          throw new Error("plugin broke");
        }
      };
    },
  };
});

const DOC_URL = new URL("https://docs.google.com/document/d/abc123/edit");

function contextReturning(html: string): ImporterContext {
  return {
    fetch: vi.fn(
      async () =>
        new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-disposition": 'attachment; filename="Doc.html"',
          },
        })
    ),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    signal: new AbortController().signal,
  };
}

describe("failure recovery", () => {
  it("keeps a merged cell's original HTML when it can't be converted", async () => {
    const html = `<html><body><table>
<tr><td colspan="2"><p><span>FAIL_CELL here</span></p></td></tr>
<tr><td><p><span>a</span></p></td><td><p><span>b</span></p></td></tr>
</table></body></html>`;
    const result = await importGoogleDoc(DOC_URL, contextReturning(html));
    const diagnostic = result.diagnostics?.find(
      ({ code }) => code === "cell-conversion-failed"
    );

    expect(result.version.body).toContain("FAIL_CELL here");
    expect(result.version.body).toContain("<td><p>a</p></td>");
    expect(diagnostic).toMatchObject({
      severity: "error",
      path: ["body"],
    });
    expect(diagnostic?.message).toContain("renderer broke");
    expect(diagnostic?.range).toBeDefined();
  });

  it("reports anything else as conversion-failed and logs it", async () => {
    const context = contextReturning(
      "<html><body><p><span>FAIL_DOC</span></p></body></html>"
    );
    const error = await importGoogleDoc(DOC_URL, context).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(ImporterError);
    expect(error).toMatchObject({ code: "conversion-failed" });
    expect((error as Error).message).toContain("plugin broke");
    expect(context.logger.error).toHaveBeenCalledOnce();
  });
});
