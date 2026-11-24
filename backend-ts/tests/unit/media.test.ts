// Tests for the media helpers in src/lib/media/, written against their
// exported API (see the imports below).
import { type Repositories } from "#src/api-v1/db-repositories/index.js";
import { ConfigError, initConfig } from "#src/config.js";
import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { MediaTooLargeError } from "#src/lib/errors/media-too-large-error.js";
import { MediaTypeMismatchError } from "#src/lib/errors/media-type-mismatch-error.js";
import { MediaUnavailableError } from "#src/lib/errors/media-unavailable-error.js";
import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";
import { _applyDevMediaOriginOverride } from "#src/lib/media/apply-dev-media-origin-override.js";
import { _downloadBase64Image } from "#src/lib/media/download-base64-image.js";
import { _downloadMedia } from "#src/lib/media/download-media.js";
import { _extractGoogleDriveId } from "#src/lib/media/extract-google-drive-id.js";
import { _extractMediaUrlsToUpload } from "#src/lib/media/extract-media-urls-to-upload.js";
import { _fetchVersionId } from "#src/lib/media/fetch-version-id.js";
import type * as FfprobeBufferModule from "#src/lib/media/ffprobe-buffer.js";
import {
  _getGoogleDriveFilename,
  DriveAccessError,
} from "#src/lib/media/get-google-drive-filename.js";
import { _isObjectInS3 } from "#src/lib/media/is-object-in-s3.js";
import { _limitConcurrency } from "#src/lib/media/limit-concurrency.js";
import { mediaS3Key } from "#src/lib/media/media-s3-key.js";
import { _s3BucketName } from "#src/lib/media/s3-bucket-name.js";
import { _s3PublicBaseUrl } from "#src/lib/media/s3-public-url.js";
import { _settleWithConcurrency } from "#src/lib/media/settle-with-concurrency.js";
import { _shouldUploadMedia } from "#src/lib/media/should-upload-media.js";
import { storeMedia } from "#src/lib/media/store-media.js";
import { uploadBodyMediaToS3 } from "#src/lib/media/upload-body-media-to-s3.js";
import { _uploadToS3 } from "#src/lib/media/upload-to-s3.js";
import { _validateExtension } from "#src/lib/media/validate-extension.js";
import { createHash } from "node:crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = mockSend;
  }
  class PutObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class HeadObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return { S3Client, PutObjectCommand, HeadObjectCommand };
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function versionHash(lastModified: string): string {
  return sha256Hex(lastModified).slice(0, 12);
}

function urlHash(url: string): string {
  return sha256Hex(url).slice(0, 8);
}

const {
  createMediaAssetMock,
  createMediaAssetLinkMock,
  ffprobeBufferMock,
  findMediaAssetByStorageKeyMock,
  sharpMock,
} = vi.hoisted(() => ({
  createMediaAssetMock: vi.fn(),
  ffprobeBufferMock: vi.fn(),
  createMediaAssetLinkMock: vi.fn(),
  findMediaAssetByStorageKeyMock: vi.fn(),
  sharpMock: vi.fn().mockReturnValue({
    metadata: () =>
      Promise.resolve({
        width: 1,
        height: 1,
        autoOrient: { width: 1, height: 1 },
      }),
  }),
}));

const reposVersionsMock = {
  createMediaAsset: createMediaAssetMock,
  createMediaAssetLink: createMediaAssetLinkMock,
  findMediaAssetByStorageKey: findMediaAssetByStorageKeyMock,
};
const reposMock = { versions: reposVersionsMock } as unknown as Repositories;

vi.mock("#src/api-v1/db-repositories/index.ts", () => ({
  makeRepositories: () => ({
    versions: reposVersionsMock,
    transaction: () => ({
      versions: reposVersionsMock,
    }),
    withTx: () => ({
      versions: reposVersionsMock,
    }),
  }),
}));
vi.mock("sharp", () => ({ default: sharpMock }));
vi.mock("#src/lib/media/ffprobe-buffer.js", async (importOriginal) => ({
  ...(await importOriginal<typeof FfprobeBufferModule>()),
  ffprobeBuffer: ffprobeBufferMock,
}));

type MockResponseInit = {
  ok?: boolean;
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
};

function mockResponse(init: MockResponseInit = {}) {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const body = init.body ?? "";
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    url: init.url ?? "",
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => (typeof body === "string" ? body : ""),
    get body() {
      return new Blob([bytes]).stream();
    },
  };
}

beforeAll(() => {
  initConfig("tests/raven.test.toml");
});

beforeEach(() => {
  mockSend.mockReset();
  createMediaAssetMock.mockReset();
  createMediaAssetLinkMock.mockReset();
  findMediaAssetByStorageKeyMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("_validateExtension", () => {
  it("accepts every documented allowed extension", () => {
    for (const ext of [
      ".avi",
      ".mov",
      ".mp4",
      ".gif",
      ".jpeg",
      ".jpg",
      ".png",
      ".svg",
      ".webp",
      ".html",
      ".m4a",
      ".mp3",
      ".pdf",
    ]) {
      expect(_validateExtension(ext)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(_validateExtension(".PNG")).toBe(true);
    expect(_validateExtension(".Mp4")).toBe(true);
  });

  it("rejects extensions outside the allowlist", () => {
    expect(_validateExtension(".exe")).toBe(false);
    expect(_validateExtension(".zip")).toBe(false);
    expect(_validateExtension("")).toBe(false);
  });
});

describe("_shouldUploadMedia", () => {
  it("allows Google Docs/Drive/googleusercontent domains", () => {
    expect(
      _shouldUploadMedia("https://docs.google.com/document/d/abc", "image")
    ).toBe(true);
    expect(
      _shouldUploadMedia("https://drive.google.com/file/d/abc", "image")
    ).toBe(true);
    expect(
      _shouldUploadMedia("https://lh3.googleusercontent.com/foo=w1200", "image")
    ).toBe(true);
  });

  it("is case-insensitive on the domain match", () => {
    expect(
      _shouldUploadMedia("https://DRIVE.GOOGLE.COM/file/d/abc", "image")
    ).toBe(true);
  });

  it("rejects domains that should be linked to directly, e.g. Typeform", () => {
    expect(
      _shouldUploadMedia("https://example.typeform.com/to/abc123", "image")
    ).toBe(false);
    expect(_shouldUploadMedia("https://example.com/image.png", "image")).toBe(
      false
    );
  });
});

describe("_extractGoogleDriveId", () => {
  it("extracts the id from /file/d/{id}/ links", () => {
    expect(
      _extractGoogleDriveId(
        "https://drive.google.com/file/d/1A2b3C-_9Z/view?usp=sharing"
      )
    ).toBe("1A2b3C-_9Z");
  });

  it("extracts the id from ?id= and &id= query params", () => {
    expect(
      _extractGoogleDriveId("https://drive.google.com/open?id=1A2b3C-_9Z")
    ).toBe("1A2b3C-_9Z");
    expect(
      _extractGoogleDriveId(
        "https://drive.google.com/uc?export=download&id=1A2b3C-_9Z"
      )
    ).toBe("1A2b3C-_9Z");
  });

  it("returns null for URLs with no discoverable id", () => {
    expect(_extractGoogleDriveId("https://example.com/image.png")).toBeNull();
  });
});

describe("_extractMediaUrlsToUpload", () => {
  it("extracts double-quoted, single-quoted, and unquoted src values", () => {
    const body = [
      ':::image{src="https://docs.google.com/a.png" alt="A"}',
      ":::image{src='https://drive.google.com/file/d/xyz/view'}",
      ":::image{src=https://googleusercontent.com/c.png}",
    ].join("\n");
    expect(_extractMediaUrlsToUpload(body)).toEqual([
      {
        figureType: "image",
        url: "https://docs.google.com/a.png",
      },
      {
        figureType: "image",
        url: "https://drive.google.com/file/d/xyz/view",
      },
      {
        figureType: "image",
        url: "https://googleusercontent.com/c.png",
      },
    ]);
  });

  it("excludes base64 data URIs, since they never match the domain allowlist", () => {
    // Mirrors media_utils.py: _should_upload_media() only allows Google
    // domains, so a data: URI (which never matches) is filtered out here even
    // though _downloadBase64Image/_downloadMedia can handle one directly.
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    const body = `:::image{src="${dataUri}"}`;
    expect(_extractMediaUrlsToUpload(body)).toEqual([]);
  });

  it("ignores src values from non-allowlisted domains", () => {
    const body = ':::image{src="https://example.com/photo.png"}';
    expect(_extractMediaUrlsToUpload(body)).toEqual([]);
  });

  it("returns an empty list when there are no directives", () => {
    expect(
      _extractMediaUrlsToUpload("just plain markdown, no directives")
    ).toEqual([]);
  });
});

describe("_downloadBase64Image", () => {
  it("decodes the payload and infers the extension from the mime type", () => {
    const payload = Buffer.from("hello world");
    const dataUri = `data:image/png;base64,${payload.toString("base64")}`;
    const { buffer, extension } = _downloadBase64Image(dataUri);
    expect(buffer.equals(payload)).toBe(true);
    expect(extension).toBe(".png");
  });

  it("falls back to a default extension for unrecognized mime types", () => {
    const dataUri = `data:application/x-totally-unknown;base64,${Buffer.from(
      "x"
    ).toString("base64")}`;
    const { extension } = _downloadBase64Image(dataUri);
    expect(extension).toBe(".png");
  });

  it("throws MalformedInputError on a malformed data URI", () => {
    expect(() => _downloadBase64Image("not-a-data-uri")).toThrow(
      MalformedInputError
    );
  });

  it("does not throw on an empty base64 payload, decoding to an empty buffer", () => {
    const { buffer } = _downloadBase64Image("data:image/png;base64,");
    expect(buffer.length).toBe(0);
  });
});

describe("_fetchVersionId", () => {
  it("returns null for base64 data URIs without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await _fetchVersionId("data:image/png;base64,abc=");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hashes the Last-Modified header into a 12-character version id", async () => {
    const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ headers: { "Last-Modified": lastModified } })
        )
    );
    const result = await _fetchVersionId("https://docs.google.com/a.png");
    expect(result).toBe(versionHash(lastModified));
    expect(result).toHaveLength(12);
  });

  it("resolves the Google Drive export URL before issuing the HEAD request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ headers: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await _fetchVersionId("https://drive.google.com/file/d/abc123/view");
    const [calledUrl] = fetchMock.mock.calls[0] as [string, unknown];
    expect(calledUrl).toBe(
      "https://drive.google.com/uc?export=download&id=abc123"
    );
  });

  it("returns null when the server does not send a Last-Modified header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ headers: {} }))
    );
    expect(await _fetchVersionId("https://docs.google.com/a.png")).toBeNull();
  });

  it("returns null (rather than throwing) when the HEAD request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await _fetchVersionId("https://docs.google.com/a.png")).toBeNull();
  });

  it("returns null when the server responds with a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500 }))
    );
    expect(await _fetchVersionId("https://docs.google.com/a.png")).toBeNull();
  });
});

describe("_getGoogleDriveFilename", () => {
  it("extracts the filename from <title>, stripping the Google Drive suffix", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          url: "https://drive.google.com/file/d/abc123/view",
          body: "<html><head><title>report.pdf - Google Drive</title></head></html>",
        })
      )
    );
    expect(await _getGoogleDriveFilename("abc123")).toBe("report.pdf");
  });

  it("falls back to the og:title meta tag when the <title> is unusable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          url: "https://drive.google.com/file/d/abc123/view",
          body:
            "<html><head><title>Drive</title>" +
            '<meta property="og:title" content="diagram.svg"></head></html>',
        })
      )
    );
    expect(await _getGoogleDriveFilename("abc123")).toBe("diagram.svg");
  });

  it("throws when Drive redirects to the login page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          url: "https://accounts.google.com/ServiceLogin?service=wise",
          body: "<html><head><title>Sign in</title></head></html>",
        })
      )
    );
    await expect(_getGoogleDriveFilename("abc123")).rejects.toThrow(
      /not publicly accessible/i
    );
  });

  it("throws when the page title indicates a sign-in wall even without a redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          url: "https://drive.google.com/file/d/abc123/view",
          body: "<html><head><title>Sign in - Google Accounts</title></head></html>",
        })
      )
    );
    await expect(_getGoogleDriveFilename("abc123")).rejects.toThrow(
      /not publicly accessible/i
    );
  });

  it("returns null (not an error) when no filename can be determined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          url: "https://drive.google.com/file/d/abc123/view",
          body: "<html><head><title>Untitled</title></head></html>",
        })
      )
    );
    expect(await _getGoogleDriveFilename("abc123")).toBeNull();
  });

  it("returns null (not an error) when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await _getGoogleDriveFilename("abc123")).toBeNull();
  });
});

describe("_downloadMedia", () => {
  it("delegates data URIs to base64 decoding", async () => {
    const payload = Buffer.from("hi");
    const dataUri = `data:image/gif;base64,${payload.toString("base64")}`;
    const { buffer, extension } = await _downloadMedia(dataUri);
    expect(buffer.equals(payload)).toBe(true);
    expect(extension).toBe(".gif");
  });

  it("determines the extension from Content-Type for regular URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          headers: { "Content-Type": "image/png" },
          body: "binary-ish-content",
        })
      )
    );
    const { extension } = await _downloadMedia(
      "https://docs.google.com/a-file-with-no-extension"
    );
    expect(extension).toBe(".png");
  });

  it("falls back to the URL path suffix when Content-Type is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ headers: {}, body: "data" }))
    );
    const { extension } = await _downloadMedia(
      "https://docs.google.com/a.webp?query=1"
    );
    expect(extension).toBe(".webp");
  });

  it("throws when no extension can be determined by any method", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ headers: {}, body: "data" }))
    );
    const download = _downloadMedia(
      "https://docs.google.com/no-extension-here"
    );
    await expect(download).rejects.toThrow(UnsupportedMediaError);
    await expect(download).rejects.toThrow(
      "Unable to determine file type for url: https://docs.google.com/no-extension-here"
    );
  });

  describe("size limit", () => {
    it("rejects a declared Content-Length over the limit without reading the body", async () => {
      const body = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ...mockResponse({
            headers: { "Content-Type": "image/png", "Content-Length": "11" },
          }),
          get body() {
            return body();
          },
        })
      );

      await expect(
        _downloadMedia("https://docs.google.com/a.png", 10)
      ).rejects.toThrow(MediaTooLargeError);
      expect(body).not.toHaveBeenCalled();
    });

    it("rejects a body over the limit when Content-Length is missing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({
            headers: { "Content-Type": "image/png" },
            body: "x".repeat(11),
          })
        )
      );

      await expect(
        _downloadMedia("https://docs.google.com/a.png", 10)
      ).rejects.toThrow(MediaTooLargeError);
    });

    it("accepts a body at the limit", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({
            headers: { "Content-Type": "image/png" },
            body: "x".repeat(10),
          })
        )
      );

      const { buffer } = await _downloadMedia(
        "https://docs.google.com/a.png",
        10
      );
      expect(buffer.length).toBe(10);
    });

    it("rejects a data URI over the limit", async () => {
      const dataUri = `data:image/png;base64,${Buffer.from("x".repeat(11)).toString("base64")}`;
      await expect(_downloadMedia(dataUri, 10)).rejects.toThrow(
        MediaTooLargeError
      );
    });

    it("defaults to the MEDIA_MAX_BYTES setting", async () => {
      vi.stubEnv("MEDIA_MAX_BYTES", "10");
      initConfig("tests/raven.test.toml");
      try {
        const dataUri = `data:image/png;base64,${Buffer.from("x".repeat(11)).toString("base64")}`;
        await expect(_downloadMedia(dataUri)).rejects.toMatchObject({
          name: "MediaTooLargeError",
          maxBytes: 10,
        });
      } finally {
        vi.unstubAllEnvs();
        initConfig("tests/raven.test.toml");
      }
    });
  });

  it("throws a retryable error with the cause when the GET request fails outright", async () => {
    const cause = new Error("boom");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    const error = await _downloadMedia("https://docs.google.com/a.png").catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MediaUnavailableError);
    expect((error as Error).message).toMatch(/could not be reached/);
    expect((error as Error).cause).toBe(cause);
  });

  it.each([400, 403, 404, 410])(
    "throws MediaUnavailableError for a permanent HTTP %i",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockResponse({ ok: false, status }))
      );
      await expect(
        _downloadMedia("https://docs.google.com/a.png")
      ).rejects.toThrow(MediaUnavailableError);
    }
  );

  it.each([408, 429, 500, 503])(
    "throws a retryable error for a transient HTTP %i",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockResponse({ ok: false, status }))
      );
      const error = await _downloadMedia("https://docs.google.com/a.png").catch(
        (e: unknown) => e
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(MediaUnavailableError);
      expect((error as Error).message).toContain(`HTTP ${status}`);
    }
  );

  it("throws a descriptive error when reading the body fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ...mockResponse({ headers: { "Content-Type": "video/mp4" } }),
        body: new ReadableStream({
          pull: () =>
            Promise.reject(
              new DOMException("The operation was aborted", "TimeoutError")
            ),
        }),
      })
    );
    await expect(
      _downloadMedia("https://docs.google.com/big.mp4")
    ).rejects.toThrow(/Failed to download .*timed out or was interrupted/);
  });

  describe("timeouts", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function stubSlowBody(bodyDelayMs: number) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, init: RequestInit) =>
          Promise.resolve({
            ...mockResponse({ headers: { "Content-Type": "video/mp4" } }),
            body: new ReadableStream<Uint8Array>({
              pull: (stream) =>
                new Promise<void>((resolve, reject) => {
                  const timer = setTimeout(() => {
                    stream.enqueue(new Uint8Array(4));
                    stream.close();
                    resolve();
                  }, bodyDelayMs);
                  init.signal?.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(init.signal?.reason);
                  });
                }),
            }),
          })
        )
      );
    }

    it("allows the body to take longer than the response timeout", async () => {
      stubSlowBody(60_000);
      const download = _downloadMedia("https://docs.google.com/big.mp4");
      await vi.advanceTimersByTimeAsync(60_000);
      const { buffer, extension } = await download;
      expect(buffer.length).toBe(4);
      expect(extension).toBe(".mp4");
    });

    it("aborts the body read once the body timeout elapses", async () => {
      stubSlowBody(10 * 60_000);
      const download = _downloadMedia("https://docs.google.com/big.mp4");
      const assertion = expect(download).rejects.toThrow(
        /timed out or was interrupted/
      );
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      await assertion;
    });

    it("aborts when the response does not arrive in time", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () =>
                reject(init.signal?.reason)
              );
            })
        )
      );
      const download = _downloadMedia("https://docs.google.com/big.mp4");
      const assertion =
        expect(download).rejects.toThrow(/could not be reached/);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    });
  });

  it("resolves Google Drive links via the filename page and downloads the export URL", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/file/d/")) {
        return Promise.resolve(
          mockResponse({
            url,
            body: "<html><head><title>photo.jpg - Google Drive</title></head></html>",
          })
        );
      }
      return Promise.resolve(
        mockResponse({
          headers: { "Content-Type": "image/jpeg" },
          body: "img-bytes",
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { extension } = await _downloadMedia(
      "https://drive.google.com/file/d/abc123/view"
    );
    expect(extension).toBe(".jpg");
    const downloadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("uc?export=download")
    );
    expect(downloadCall?.[0]).toBe(
      "https://drive.google.com/uc?export=download&id=abc123"
    );
  });

  it("throws when a Google Drive file is private (HTML returned instead of the file)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/file/d/")) {
        return Promise.resolve(
          mockResponse({
            url,
            body: "<html><head><title>photo.jpg - Google Drive</title></head></html>",
          })
        );
      }
      return Promise.resolve(
        mockResponse({
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const download = _downloadMedia(
      "https://drive.google.com/file/d/abc123/view"
    );
    await expect(download).rejects.toThrow(/not publicly accessible/i);
    await expect(download).rejects.toThrow(DriveAccessError);
    // The worker fails every MediaUnavailableError without retrying
    await expect(download).rejects.toThrow(MediaUnavailableError);
  });
});

describe("_isObjectInS3", () => {
  beforeEach(() => {
    process.env.AWS_S3_BUCKET_NAME = "test-bucket";
    initConfig("tests/raven.test.toml");
  });

  afterEach(() => {
    delete process.env.AWS_S3_BUCKET_NAME;
    initConfig("tests/raven.test.toml");
  });

  it("returns true when HeadObject succeeds", async () => {
    mockSend.mockResolvedValueOnce({});
    expect(await _isObjectInS3("media/media_abc")).toBe(true);
  });

  it("returns false when HeadObject reports the object is missing", async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("not found"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      })
    );
    expect(await _isObjectInS3("media/media_missing")).toBe(false);
  });

  it("re-throws unexpected errors", async () => {
    mockSend.mockRejectedValueOnce(new Error("access denied"));
    await expect(_isObjectInS3("media/media_abc")).rejects.toThrow(
      "access denied"
    );
  });
});

describe("_s3BucketName", () => {
  it("throws a friendly ConfigError when no bucket is configured", () => {
    // tests/raven.test.toml leaves AWS_S3_BUCKET_NAME empty
    expect(() => _s3BucketName()).toThrow(/not configured/i);
    expect(() => _s3BucketName()).toThrow(
      expect.objectContaining({
        name: "ConfigError",
        configKey: "AWS_S3_BUCKET_NAME",
      })
    );
  });
});

describe("_s3PublicBaseUrl", () => {
  afterEach(() => {
    delete process.env.AWS_S3_PUBLIC_ENDPOINT;
    delete process.env.AWS_S3_PUBLIC_BASE_URL;
    initConfig("tests/raven.test.toml");
  });

  it("uses AWS_S3_PUBLIC_BASE_URL as-is, without appending the bucket", () => {
    process.env.AWS_S3_PUBLIC_ENDPOINT = "http://localhost:3900";
    process.env.AWS_S3_PUBLIC_BASE_URL =
      "http://raven-dev-media.web.localhost:3902";
    initConfig("tests/raven.test.toml");
    expect(_s3PublicBaseUrl("raven-dev-media")).toBe(
      "http://raven-dev-media.web.localhost:3902"
    );
  });

  it("throws a ConfigError when the public base URL isn't a valid URL", () => {
    process.env.AWS_S3_PUBLIC_BASE_URL = "not a url";
    initConfig("tests/raven.test.toml");
    expect(() => _s3PublicBaseUrl("bucket")).toThrow(ConfigError);
    expect(() => _s3PublicBaseUrl("bucket")).toThrow(
      expect.objectContaining({ configKey: "AWS_S3_PUBLIC_BASE_URL" })
    );
  });

  it("throws a ConfigError when the public endpoint isn't a valid URL", () => {
    process.env.AWS_S3_PUBLIC_ENDPOINT = "not a url";
    initConfig("tests/raven.test.toml");
    expect(() => _s3PublicBaseUrl("bucket")).toThrow(ConfigError);
    expect(() => _s3PublicBaseUrl("bucket")).toThrow(
      expect.objectContaining({ configKey: "AWS_S3_PUBLIC_ENDPOINT" })
    );
  });
});

describe("_applyDevMediaOriginOverride", () => {
  const url = "https://lh3.googleusercontent.com/pixel.png?sz=1";

  afterEach(() => {
    delete process.env.DEV_MEDIA_ORIGIN_OVERRIDE;
    delete process.env.ENVIRONMENT;
    initConfig("tests/raven.test.toml");
  });

  it("leaves URLs unchanged when no override is configured", () => {
    expect(_applyDevMediaOriginOverride(url)).toBe(url);
  });

  it("swaps the origin of googleusercontent.com URLs, keeping path and query", () => {
    process.env.DEV_MEDIA_ORIGIN_OVERRIDE = "http://localhost:4322";
    initConfig("tests/raven.test.toml");
    expect(_applyDevMediaOriginOverride(url)).toBe(
      "http://localhost:4322/pixel.png?sz=1"
    );
    expect(_applyDevMediaOriginOverride("https://docs.google.com/a.png")).toBe(
      "https://docs.google.com/a.png"
    );
  });

  it("is ignored in production", () => {
    process.env.DEV_MEDIA_ORIGIN_OVERRIDE = "http://localhost:4322";
    process.env.ENVIRONMENT = "production";
    initConfig("tests/raven.test.toml");
    expect(_applyDevMediaOriginOverride(url)).toBe(url);
  });
});

describe("_uploadToS3", () => {
  beforeEach(() => {
    process.env.AWS_S3_BUCKET_NAME = "test-bucket";
    initConfig("tests/raven.test.toml");
  });

  afterEach(() => {
    delete process.env.AWS_S3_BUCKET_NAME;
    initConfig("tests/raven.test.toml");
  });

  it("uploads with a guessed content type and inline content-disposition", async () => {
    mockSend.mockResolvedValueOnce({});
    const url = await _uploadToS3({
      buffer: Buffer.from("img"),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/a.png",
      extension: ".png",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    expect(url).toBe("https://test-bucket.s3.amazonaws.com/media/media_abc");

    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(command.input.ContentType).toBe("image/png");
    expect(command.input.ContentDisposition).toBe(
      'inline; filename="media_abc.png"'
    );
    expect(
      (command.input.Metadata as Record<string, string>)["source-url"]
    ).toBe("https://docs.google.com/a.png");
    expect(
      (command.input.Metadata as Record<string, string>)["uploaded-by"]
    ).toBe("the-stacks-backend");
  });

  it("adds the leading dot to a sniffed file extension", async () => {
    mockSend.mockResolvedValueOnce({});
    await _uploadToS3({
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64"
      ),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/a",
      extension: ".bin",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(command.input.ContentType).toBe("image/png");
    expect(command.input.ContentDisposition).toBe(
      'inline; filename="media_abc.png"'
    );
  });

  it("doesn't repeat an extension the key already ends with", async () => {
    mockSend.mockResolvedValueOnce({});
    await _uploadToS3({
      buffer: Buffer.from("img"),
      s3Key: "media/media_abc.png",
      sourceUrl: "figure.png",
      extension: ".png",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(command.input.ContentDisposition).toBe(
      'inline; filename="media_abc.png"'
    );
  });

  it("rejects bytes over the MEDIA_MAX_BYTES setting without uploading", async () => {
    vi.stubEnv("MEDIA_MAX_BYTES", "2");
    initConfig("tests/raven.test.toml");
    try {
      await expect(
        _uploadToS3({
          buffer: Buffer.from("img"),
          s3Key: "media/media_abc",
          sourceUrl: "figure.png",
          extension: ".png",
          hash: "potato",
          versionId: "01M32198",
          repos: reposMock,
        })
      ).rejects.toThrow(new MediaTooLargeError("figure.png", 2).message);
      expect(mockSend).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("names SVGs sniffed as XML with a .svg extension", async () => {
    mockSend.mockResolvedValueOnce({});
    await _uploadToS3({
      buffer: Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
      ),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/a.svg",
      extension: ".svg",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(command.input.ContentType).toBe("image/svg+xml");
    expect(command.input.ContentDisposition).toBe(
      'inline; filename="media_abc.svg"'
    );
  });

  it("builds a path-style URL when a public endpoint override is configured", async () => {
    process.env.AWS_S3_PUBLIC_ENDPOINT = "http://localhost:9000";
    initConfig("tests/raven.test.toml");
    try {
      mockSend.mockResolvedValueOnce({});
      const url = await _uploadToS3({
        buffer: Buffer.from("img"),
        s3Key: "media/media_abc",
        sourceUrl: "https://docs.google.com/a.png",
        extension: ".png",
        hash: "potato",
        versionId: "01M32198",
        repos: reposMock,
      });
      expect(url).toBe("http://localhost:9000/test-bucket/media/media_abc");
    } finally {
      delete process.env.AWS_S3_PUBLIC_ENDPOINT;
      initConfig("tests/raven.test.toml");
    }
  });

  it("records displayed image dimensions after applying EXIF Orientation", async () => {
    mockSend.mockResolvedValueOnce({});
    sharpMock.mockReturnValueOnce({
      metadata: () =>
        Promise.resolve({
          width: 1,
          height: 2,
          orientation: 6,
          autoOrient: { width: 2, height: 1 },
        }),
    });
    await _uploadToS3({
      buffer: Buffer.from("img"),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/a.jpg",
      extension: ".jpg",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    expect(createMediaAssetMock).toHaveBeenCalledWith(
      "01M32198",
      expect.objectContaining({ kind: "image", width: 2, height: 1 })
    );
  });

  it("records audio and video codecs from their own streams", async () => {
    mockSend.mockResolvedValueOnce({});
    ffprobeBufferMock.mockResolvedValueOnce({
      format: { duration: "1.0" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          mime_codec_string: "avc1.42c00a",
          width: 2,
          height: 2,
        },
        {
          codec_type: "audio",
          codec_name: "aac",
          mime_codec_string: "mp4a.40.2",
        },
      ],
    });
    await _uploadToS3({
      buffer: Buffer.from("vid"),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/a.mp4",
      extension: ".mp4",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    expect(createMediaAssetMock).toHaveBeenCalledWith(
      "01M32198",
      expect.objectContaining({
        kind: "video",
        videoCodec: "h264",
        videoCodecString: "avc1.42c00a",
        audioCodec: "aac",
        audioCodecString: "mp4a.40.2",
      })
    );
  });

  it("leaves audio codecs empty for a video-only file", async () => {
    mockSend.mockResolvedValueOnce({});
    ffprobeBufferMock.mockResolvedValueOnce({
      format: { duration: "1.0" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          mime_codec_string: "avc1.42c00a",
          width: 2,
          height: 2,
        },
      ],
    });
    await _uploadToS3({
      buffer: Buffer.from("vid"),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/a.mp4",
      extension: ".mp4",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [, fields] = createMediaAssetMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(fields.videoCodec).toBe("h264");
    expect(fields.audioCodec).toBeUndefined();
    expect(fields.audioCodecString).toBeUndefined();
  });

  it("forces text/html and flags iframe content for .html uploads", async () => {
    mockSend.mockResolvedValueOnce({});
    await _uploadToS3({
      buffer: Buffer.from("<iframe></iframe>"),
      s3Key: "media/media_abc",
      sourceUrl: "https://docs.google.com/embed.html",
      extension: ".html",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(command.input.ContentType).toBe("text/html");
    expect(
      (command.input.Metadata as Record<string, string>)["content-usage"]
    ).toBe("iframe");
  });

  it("truncates long source URLs to 1000 characters in metadata", async () => {
    mockSend.mockResolvedValueOnce({});
    const longUrl = "https://docs.google.com/" + "a".repeat(2000);
    await _uploadToS3({
      buffer: Buffer.from("x"),
      s3Key: "media/media_abc",
      sourceUrl: longUrl,
      extension: ".png",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    const stored = (command.input.Metadata as Record<string, string>)[
      "source-url"
    ];
    expect(stored).toHaveLength(1000);
    expect(stored).toBe(longUrl.slice(0, 1000));
  });

  it('replaces base64 data URI sources with the literal "base64-image" marker', async () => {
    mockSend.mockResolvedValueOnce({});
    await _uploadToS3({
      buffer: Buffer.from("x"),
      s3Key: "media/media_abc",
      sourceUrl: "data:image/png;base64,iVBORw0KGgo=",
      extension: ".png",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    const [command] = mockSend.mock.calls[0] as [
      { input: Record<string, unknown> },
    ];
    expect(
      (command.input.Metadata as Record<string, string>)["source-url"]
    ).toBe("base64-image");
  });

  it("wraps S3 failures in a friendly error that keeps the cause", async () => {
    const cause = new Error("credentials expired");
    mockSend.mockRejectedValueOnce(cause);
    const upload = _uploadToS3({
      buffer: Buffer.from("x"),
      s3Key: "media/media_abc",
      sourceUrl: "https://a/b.png",
      extension: ".png",
      hash: "potato",
      versionId: "01M32198",
      repos: reposMock,
    });
    await expect(upload).rejects.toThrow(/contact the site administrator/i);
    await expect(upload).rejects.toHaveProperty("cause", cause);
  });

  describe("unreadable media", () => {
    const upload = (extension: string) =>
      _uploadToS3({
        buffer: Buffer.from("not really media"),
        s3Key: "media/media_abc",
        sourceUrl: `https://docs.google.com/a${extension}`,
        extension,
        hash: "potato",
        versionId: "01M32198",
        repos: reposMock,
      });

    it("rejects an image sharp can't read before uploading it", async () => {
      sharpMock.mockReturnValueOnce({
        metadata: () =>
          Promise.reject(
            new Error("Input buffer contains unsupported image format")
          ),
      });
      const result = upload(".png");
      await expect(result).rejects.toThrow(MalformedInputError);
      await expect(result).rejects.toThrow(/Could not read .* as image/);
      expect(mockSend).not.toHaveBeenCalled();
      expect(createMediaAssetMock).not.toHaveBeenCalled();
    });

    it("rejects audio/video ffprobe can't read before uploading it", async () => {
      ffprobeBufferMock.mockRejectedValueOnce(
        Object.assign(new Error("Invalid data found"), { code: 1 })
      );
      await expect(upload(".mp4")).rejects.toThrow(MalformedInputError);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("doesn't blame the file when ffprobe isn't installed", async () => {
      const missingBinary = Object.assign(new Error("spawn ffprobe ENOENT"), {
        code: "ENOENT",
      });
      ffprobeBufferMock.mockRejectedValueOnce(missingBinary);
      const error = await upload(".mp4").catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(MalformedInputError);
      expect((error as Error).cause).toBe(missingBinary);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("figure type", () => {
    // Image and iframe cases never consume the queued ffprobe result.
    beforeEach(() => {
      ffprobeBufferMock.mockReset();
    });

    const upload = (
      extension: string,
      figureType: "audio" | "iframe" | "image" | "video"
    ) =>
      _uploadToS3({
        buffer: Buffer.from("<html></html>"),
        s3Key: "media/media_abc",
        sourceUrl: `https://docs.google.com/a${extension}`,
        extension,
        figureType,
        hash: "potato",
        versionId: "01M32198",
        repos: reposMock,
      });

    it.each([
      [".html", "image"],
      [".mp4", "image"],
      [".png", "video"],
      [".mp3", "video"],
      [".png", "audio"],
      [".png", "iframe"],
    ] as const)(
      "rejects %s in an %s figure before uploading it",
      async (extension, figureType) => {
        const result = upload(extension, figureType);
        await expect(result).rejects.toThrow(MediaTypeMismatchError);
        await expect(result).rejects.toThrow(
          new RegExp(`to be ${figureType} media`)
        );
        expect(mockSend).not.toHaveBeenCalled();
        expect(createMediaAssetMock).not.toHaveBeenCalled();
      }
    );

    it.each([
      [".png", "image"],
      [".svg", "image"],
      [".mp4", "video"],
      [".mp3", "audio"],
      [".html", "iframe"],
    ] as const)("accepts %s in an %s figure", async (extension, figureType) => {
      mockSend.mockResolvedValueOnce({});
      ffprobeBufferMock.mockResolvedValueOnce({
        format: { duration: "1.0" },
        streams: [],
      });
      await expect(upload(extension, figureType)).resolves.toBeTypeOf("string");
    });

    describe("MP4 in an audio figure", () => {
      const audioStream = { codec_type: "audio", codec_name: "aac" };
      const coverArt = {
        codec_type: "video",
        codec_name: "mjpeg",
        disposition: { attached_pic: 1 },
      };
      const videoStream = { codec_type: "video", codec_name: "h264" };

      it.each([
        ["only audio", [audioStream]],
        ["audio and cover art", [audioStream, coverArt]],
      ])("stores it as audio when it has %s", async (_name, streams) => {
        mockSend.mockResolvedValueOnce({});
        ffprobeBufferMock.mockResolvedValueOnce({
          format: { duration: "1.0" },
          streams,
        });
        await upload(".mp4", "audio");

        const [command] = mockSend.mock.calls[0] as [
          { input: Record<string, unknown> },
        ];
        expect(command.input.ContentType).toBe("audio/mp4");
        const [, fields] = createMediaAssetMock.mock.calls[0] as [
          string,
          Record<string, unknown>,
        ];
        expect(fields).toMatchObject({ kind: "audio", mimeType: "audio/mp4" });
        expect(fields.videoCodec).toBeUndefined();
      });

      it("rejects it when it has a video stream", async () => {
        ffprobeBufferMock.mockResolvedValueOnce({
          format: { duration: "1.0" },
          streams: [videoStream, audioStream],
        });
        await expect(upload(".mp4", "audio")).rejects.toThrow(
          MediaTypeMismatchError
        );
        expect(mockSend).not.toHaveBeenCalled();
        expect(createMediaAssetMock).not.toHaveBeenCalled();
      });
    });
  });

  it("passes ConfigErrors through unwrapped", async () => {
    process.env.AWS_S3_PUBLIC_ENDPOINT = "not a url";
    initConfig("tests/raven.test.toml");
    try {
      await expect(
        _uploadToS3({
          buffer: Buffer.from("x"),
          s3Key: "media/media_abc",
          sourceUrl: "https://a/b.png",
          extension: ".png",
          hash: "potato",
          versionId: "01M32198",
          repos: reposMock,
        })
      ).rejects.toThrow(ConfigError);
    } finally {
      delete process.env.AWS_S3_PUBLIC_ENDPOINT;
      initConfig("tests/raven.test.toml");
    }
  });
});

describe("_limitConcurrency", () => {
  it("never runs more than the given number of tasks at once, in call order", async () => {
    const limit = _limitConcurrency(2);
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        limit(async () => {
          started.push(i);
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight--;
          return i;
        })
      )
    );
    expect(maxInFlight).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("frees the slot when a task rejects", async () => {
    const limit = _limitConcurrency(1);
    await expect(
      limit(() => Promise.reject(new Error("boom")))
    ).rejects.toThrow("boom");
    expect(await limit(async () => "next")).toBe("next");
  });
});

describe("_settleWithConcurrency", () => {
  it("never runs more than the given number of calls at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await _settleWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
      },
      3
    );
    expect(maxInFlight).toBe(3);
  });

  it("returns settled results in input order, including rejections", async () => {
    const results = await _settleWithConcurrency(
      [30, 10, 20],
      async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        if (ms === 10) throw new Error("ten");
        return ms;
      },
      3
    );
    expect(results).toEqual([
      { status: "fulfilled", value: 30 },
      { status: "rejected", reason: new Error("ten") },
      { status: "fulfilled", value: 20 },
    ]);
  });

  it("handles an empty list", async () => {
    expect(await _settleWithConcurrency([], async () => 1, 4)).toEqual([]);
  });
});

describe("uploadBodyMediaToS3", () => {
  beforeEach(() => {
    process.env.AWS_S3_BUCKET_NAME = "test-bucket";
    initConfig("tests/raven.test.toml");
  });

  afterEach(() => {
    delete process.env.AWS_S3_BUCKET_NAME;
    initConfig("tests/raven.test.toml");
  });

  it("returns falsy bodies unchanged without making any network or S3 calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await uploadBodyMediaToS3({
        body: null,
        publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        repos: reposMock,
      })
    ).toBeNull();
    expect(
      await uploadBodyMediaToS3({
        body: undefined,
        publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        repos: reposMock,
      })
    ).toBeUndefined();
    expect(
      await uploadBodyMediaToS3({
        body: "",
        publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        repos: reposMock,
      })
    ).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("leaves bodies with no eligible media URLs unchanged", async () => {
    const body =
      "# Title\n\nNo directives here, and a [link](https://example.com).";
    expect(
      await uploadBodyMediaToS3({
        body,
        publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        repos: reposMock,
      })
    ).toBe(body);
  });

  it("reuses the existing S3 object and skips downloading when the key already exists", async () => {
    const url = "https://docs.google.com/a.png";
    const body = `:::image{src="${url}"}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ headers: {} })) // HEAD version check, no Last-Modified
    );
    mockSend.mockResolvedValueOnce({}); // HeadObjectCommand succeeds -> already present
    findMediaAssetByStorageKeyMock.mockResolvedValueOnce({ id: "01ASSET" });

    const result = await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });

    const key = `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}`;
    expect(result).toBe(
      `:::image{src="https://test-bucket.s3.amazonaws.com/${key}"}`
    );
    // Only the HeadObject existence check should have hit S3, never PutObject.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(findMediaAssetByStorageKeyMock).toHaveBeenCalledWith(key);
    expect(createMediaAssetLinkMock).toHaveBeenCalledWith(
      "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      "01ASSET"
    );
    expect(createMediaAssetMock).not.toHaveBeenCalled();
  });

  it("re-uploads an existing S3 object that has no media asset row", async () => {
    const url = "https://docs.google.com/a.png";
    const body = `:::image{src="${url}"}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          headers: { "Content-Type": "image/png" },
          body: "img-bytes",
        })
      )
    );
    mockSend
      .mockResolvedValueOnce({}) // HeadObjectCommand succeeds -> already present
      .mockResolvedValueOnce({}); // PutObjectCommand: upload succeeds

    await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(createMediaAssetLinkMock).not.toHaveBeenCalled();
    expect(createMediaAssetMock).toHaveBeenCalledWith(
      "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      expect.objectContaining({
        storageKey: `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}`,
      })
    );
  });

  it("re-uploads media missing from S3 even when its asset row is live", async () => {
    const url = "https://docs.google.com/a.png";
    const body = `:::image{src="${url}"}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          headers: { "Content-Type": "image/png" },
          body: "img-bytes",
        })
      )
    );
    mockSend
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), { name: "NotFound" })
      ) // HeadObjectCommand: not present
      .mockResolvedValueOnce({}); // PutObjectCommand: upload succeeds
    findMediaAssetByStorageKeyMock.mockResolvedValue({ id: "01ASSET" });

    await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(createMediaAssetMock).toHaveBeenCalledWith(
      "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      expect.objectContaining({
        storageKey: `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}`,
      })
    );
  });

  it("downloads, validates, and uploads media not yet present in S3", async () => {
    const url = "https://docs.google.com/a.png";
    const body = `:::image{src="${url}"}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          headers: { "Content-Type": "image/png" },
          body: "img-bytes",
        })
      )
    );
    mockSend
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), { name: "NotFound" })
      ) // HeadObjectCommand: not present
      .mockResolvedValueOnce({}); // PutObjectCommand: upload succeeds

    const result = await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });

    const key = `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}`;
    expect(result).toBe(
      `:::image{src="https://test-bucket.s3.amazonaws.com/${key}"}`
    );
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("rejects files whose extension is not in the allowlist", async () => {
    const url = "https://docs.google.com/a.exe";
    const body = `:::image{src="${url}"}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          headers: { "Content-Type": "application/octet-stream" },
          body: "x",
        })
      )
    );
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "NotFound" })
    );

    await expect(
      uploadBodyMediaToS3({
        body,
        publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        repos: reposMock,
      })
    ).rejects.toThrow(/Unsupported file type/i);
  });

  it("incorporates the Last-Modified-derived version id into the S3 key", async () => {
    const url = "https://docs.google.com/a.png";
    const body = `:::image{src="${url}"}`;
    const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ headers: { "Last-Modified": lastModified } })
        )
    );
    mockSend.mockResolvedValueOnce({});

    const result = await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });
    const key = `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}_${versionHash(
      lastModified
    )}`;
    expect(result).toBe(
      `:::image{src="https://test-bucket.s3.amazonaws.com/${key}"}`
    );
  });

  it("replaces every occurrence of a repeated URL in the body", async () => {
    const url = "https://docs.google.com/a.png";
    const body = `:::image{src="${url}"}\n\nSee also :::image{src="${url}"}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ headers: {} }))
    );
    mockSend.mockResolvedValueOnce({});

    const result = await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });
    const key = `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}`;
    const s3Url = `https://test-bucket.s3.amazonaws.com/${key}`;
    expect(result).toBe(
      `:::image{src="${s3Url}"}\n\nSee also :::image{src="${s3Url}"}`
    );
  });

  it("downloads media in parallel and replaces every URL", async () => {
    const urls = ["a.png", "b.png", "c.png"].map(
      (name) => `https://docs.google.com/${name}`
    );
    const body = urls.map((url) => `:::image{src="${url}"}`).join("\n\n");

    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return mockResponse({ headers: {} });
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return mockResponse({
          headers: { "Content-Type": "image/png" },
          body: "img-bytes",
        });
      })
    );
    mockSend.mockImplementation(
      async (command: { input: { Body?: unknown } }) => {
        if (command.input.Body === undefined) {
          throw Object.assign(new Error("missing"), { name: "NotFound" });
        }
        return {};
      }
    );

    const result = await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });

    expect(maxInFlight).toBe(3);
    for (const url of urls) {
      const key = `publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_${urlHash(url)}`;
      expect(result).toContain(
        `:::image{src="https://test-bucket.s3.amazonaws.com/${key}"}`
      );
      expect(result).not.toContain(url);
    }
  });

  it("checks more media at once than it downloads", async () => {
    const urls = Array.from(
      { length: 8 },
      (_, i) => `https://docs.google.com/${i}.png`
    );
    const body = urls.map((url) => `:::image{src="${url}"}`).join("\n\n");

    const inFlight = { HEAD: 0, GET: 0 };
    const maxInFlight = { HEAD: 0, GET: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const method = init?.method === "HEAD" ? "HEAD" : "GET";
        inFlight[method]++;
        maxInFlight[method] = Math.max(maxInFlight[method], inFlight[method]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight[method]--;
        return mockResponse({
          headers: { "Content-Type": "image/png" },
          body: "img-bytes",
        });
      })
    );
    mockSend.mockImplementation(
      async (command: { input: { Body?: unknown } }) => {
        if (command.input.Body === undefined) {
          throw Object.assign(new Error("missing"), { name: "NotFound" });
        }
        return {};
      }
    );

    await uploadBodyMediaToS3({
      body,
      publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      repos: reposMock,
    });

    expect(maxInFlight.HEAD).toBe(8);
    expect(maxInFlight.GET).toBe(4);
  });

  it("waits for all transfers to settle, then throws the first failure", async () => {
    const bad = "https://docs.google.com/bad.exe";
    const good = "https://docs.google.com/good.png";
    const body = `:::image{src="${bad}"}\n\n:::image{src="${good}"}`;

    let goodFinished = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return mockResponse({ headers: {} });
        if (url === bad) {
          return mockResponse({
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        goodFinished = true;
        return mockResponse({ headers: { "Content-Type": "image/png" } });
      })
    );
    mockSend.mockImplementation(
      async (command: { input: { Body?: unknown } }) => {
        if (command.input.Body === undefined) {
          throw Object.assign(new Error("missing"), { name: "NotFound" });
        }
        return {};
      }
    );

    await expect(
      uploadBodyMediaToS3({
        body,
        publicationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        repos: reposMock,
      })
    ).rejects.toThrow(/Unsupported file type extension `\.exe`/);
    expect(goodFinished).toBe(true);
  });
});

describe("mediaS3Key", () => {
  it("keys media under its publication", () => {
    expect(mediaS3Key({ publicationId: "01PUB", suffix: "abc" })).toBe(
      "publications/01PUB/media_abc"
    );
  });

  it("keys media without a publication under media/", () => {
    expect(mediaS3Key({ publicationId: null, suffix: "abc" })).toBe(
      "media/media_abc"
    );
  });
});

describe("storeMedia", () => {
  const versionId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
  const s3Key = "publications/01ARZ3NDEKTSV4RRFFQ69G5FAV/media_abc";
  const s3Url = `https://test-bucket.s3.amazonaws.com/${s3Key}`;
  const buffer = Buffer.from("img-bytes");

  function store(overrides: Partial<Parameters<typeof storeMedia>[0]> = {}) {
    return storeMedia({
      buffer,
      extension: ".png",
      s3Key,
      hash: "abc",
      sourceLabel: "figure.png",
      versionId,
      repos: reposMock,
      ...overrides,
    });
  }

  beforeEach(() => {
    process.env.AWS_S3_BUCKET_NAME = "test-bucket";
    initConfig("tests/raven.test.toml");
  });

  afterEach(() => {
    delete process.env.AWS_S3_BUCKET_NAME;
    initConfig("tests/raven.test.toml");
  });

  it("uploads bytes under the given key and records the asset", async () => {
    mockSend.mockResolvedValueOnce({});

    expect(await store()).toBe(s3Url);

    const [[put]] = mockSend.mock.calls as [[{ input: { Key: string } }]];
    expect(put.input.Key).toBe(s3Key);
    expect(createMediaAssetMock).toHaveBeenCalledWith(
      versionId,
      expect.objectContaining({ storageKey: s3Key })
    );
  });

  it("links a stored asset with the same key instead of uploading again", async () => {
    findMediaAssetByStorageKeyMock.mockResolvedValueOnce({ id: "01ASSET" });

    expect(await store()).toBe(s3Url);

    expect(mockSend).not.toHaveBeenCalled();
    expect(createMediaAssetLinkMock).toHaveBeenCalledWith(versionId, "01ASSET");
    expect(createMediaAssetMock).not.toHaveBeenCalled();
  });

  it("uploads again without reusing a stored asset when reuseStoredAsset is false", async () => {
    findMediaAssetByStorageKeyMock.mockResolvedValue({ id: "01ASSET" });
    mockSend.mockResolvedValueOnce({});

    expect(await store({ reuseStoredAsset: false })).toBe(s3Url);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(createMediaAssetLinkMock).not.toHaveBeenCalledWith(
      versionId,
      "01ASSET"
    );
    expect(createMediaAssetMock).toHaveBeenCalledWith(
      versionId,
      expect.objectContaining({ storageKey: s3Key })
    );
  });

  it.each(["α.png", "图😀.png", "line\nfeed.png"])(
    "encodes %s for S3 metadata",
    async (sourceLabel) => {
      mockSend.mockResolvedValueOnce({});
      await store({ sourceLabel });
      const [put] = mockSend.mock.calls[0] as [
        { input: { Metadata: Record<string, string> } },
      ];
      expect(put.input.Metadata["source-url"]).toBe(encodeURI(sourceLabel));
      expect(createMediaAssetMock).toHaveBeenCalledWith(
        versionId,
        expect.objectContaining({ originUrl: sourceLabel })
      );
    }
  );

  it("retains the original Unicode filename in unreadable-media errors", async () => {
    sharpMock.mockImplementationOnce(() => ({
      metadata: () => Promise.reject(new Error("corrupt")),
    }));
    await expect(store({ sourceLabel: "α.png" })).rejects.toThrow(
      "Could not read α.png"
    );
  });

  it("rejects an extension that isn't in the allowlist, listing the supported types", async () => {
    const stored = store({ extension: ".exe", sourceLabel: "payload.exe" });
    await expect(stored).rejects.toThrow(UnsupportedMediaError);
    await expect(stored).rejects.toThrow(
      /Supported types: \.avi, .*\.png, .*\.webp$/
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects a file with no extension", async () => {
    await expect(
      store({ extension: "", sourceLabel: "figure" })
    ).rejects.toThrow(/Unable to determine file type for url: figure/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("checks the media against its figure type", async () => {
    await expect(store({ figureType: "video" })).rejects.toThrow(
      MediaTypeMismatchError
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
