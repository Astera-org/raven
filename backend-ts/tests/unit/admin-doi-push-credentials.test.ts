import { type postDoiPushRoute } from "#v1/routes/admin/doi-audits/post-doi-push.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type HandlerContext } from "#v1/types/handler.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  lookupDoiComparison: vi.fn(),
  pushDiffsToDataCite: vi.fn(),
}));

vi.mock("#src/config.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConfig: mocks.getConfig,
}));

vi.mock(
  "#v1/routes/admin/doi-audits/helpers/lookup-doi-comparison.js",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    lookupDoiComparison: mocks.lookupDoiComparison,
  })
);

vi.mock(
  "#v1/routes/admin/doi-audits/helpers/push-diffs-to-data-cite.js",
  () => ({
    pushDiffsToDataCite: mocks.pushDiffsToDataCite,
  })
);

const { postDoiPushHandler } =
  await import("#v1/routes/admin/doi-audits/post-doi-push.js");

// The integration stack always has DataCite credentials, so the missing-
// credentials branch can only be reached here.
function context() {
  return {
    json: (body: unknown, status: number) => Response.json(body, { status }),
    req: {
      valid: () => ({
        type: "canonical",
        doi: "10.83972/abcd",
        fingerprint: "0".repeat(64),
      }),
    },
    var: { adminScope: { kind: "site" } },
  } as unknown as HandlerContext<typeof postDoiPushRoute, AdminEnv>;
}

describe("POST /v1/admin/doi-pushes without DataCite credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["no credentials", {}],
    ["no password", { DATACITE_NAME: "test-datacite-name" }],
    ["no name", { DATACITE_PASSWORD: "test-datacite-password" }],
  ])(
    "refuses with 503 before comparing or pushing (%s)",
    async (_label, config) => {
      mocks.getConfig.mockReturnValue(config);

      const resp = await postDoiPushHandler(context());
      if (!(resp instanceof Response)) {
        throw new Error("The handler didn't return a Response");
      }

      expect(resp.status).toBe(503);
      expect(await resp.json()).toEqual({
        type: "application_error",
        errors: {
          datacite: {
            message: "DataCite credentials are not configured on this server",
          },
        },
      });
      expect(mocks.lookupDoiComparison).not.toHaveBeenCalled();
      expect(mocks.pushDiffsToDataCite).not.toHaveBeenCalled();
    }
  );
});
