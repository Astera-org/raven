import {
  type CanonicalMetadata,
  type VersionMetadata,
} from "#src/lib/datacite/client.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dataciteRawGet: vi.fn(),
  buildCanonicalPayload: vi.fn(),
  buildVersionPayload: vi.fn(),
}));

vi.mock("#src/lib/datacite/client.js", () => ({
  dataciteRawGet: mocks.dataciteRawGet,
  buildCanonicalPayload: mocks.buildCanonicalPayload,
  buildVersionPayload: mocks.buildVersionPayload,
}));

const { compareCanonicalDoiMetadata } =
  await import("#v1/routes/admin/doi-audits/helpers/compare-canonical-doi-metadata.js");
const { compareVersionDoiMetadata } =
  await import("#v1/routes/admin/doi-audits/helpers/compare-version-doi-metadata.js");

const DOI = "10.83972/abcd";
const versionMeta = {} as VersionMetadata;

const helpers = [
  {
    name: "compareCanonicalDoiMetadata",
    buildPayload: mocks.buildCanonicalPayload,
    compare: () =>
      compareCanonicalDoiMetadata(DOI, {} as CanonicalMetadata, versionMeta),
  },
  {
    name: "compareVersionDoiMetadata",
    buildPayload: mocks.buildVersionPayload,
    compare: () => compareVersionDoiMetadata(DOI, versionMeta),
  },
];

describe("v1 DOI comparison helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(helpers)(
    "$name waits for the DataCite request to settle before propagating a payload build failure",
    async ({ buildPayload, compare }) => {
      // Created up front, so `finally` can always drain it, even if the
      // helper never made the request.
      let settleRequest: (attributes: null) => void = () => {};
      const request = new Promise<null>((resolve) => {
        settleRequest = resolve;
      });
      mocks.dataciteRawGet.mockReturnValueOnce(request);
      const buildError = new Error("markdown conversion failed");
      buildPayload.mockRejectedValueOnce(buildError);

      // allSettled handles the rejection now, so a failed assertion below
      // can't leave it unhandled.
      let settled = false;
      const outcome = Promise.allSettled([compare()]).then(([result]) => {
        settled = true;
        return result;
      });

      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(settled).toBe(false);
      } finally {
        settleRequest(null);
      }

      expect(await outcome).toEqual({ status: "rejected", reason: buildError });
    }
  );

  it.each(helpers)(
    "$name propagates the DataCite error when both the request and the payload build fail",
    async ({ buildPayload, compare }) => {
      const requestError = new DataciteRequestError(
        DOI,
        503,
        `DataCite GET for ${DOI} returned 503`
      );
      mocks.dataciteRawGet.mockRejectedValueOnce(requestError);
      buildPayload.mockRejectedValueOnce(
        new Error("markdown conversion failed")
      );

      await expect(compare()).rejects.toBe(requestError);
    }
  );
});
