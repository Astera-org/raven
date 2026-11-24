import { CliError, ExitCode } from "#src/errors.js";
import { jsonResponse } from "#src/testing/test-runtime.js";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, unwrap } from "./client.js";

describe("createApiClient", () => {
  it("sends the token and maps a 401 to the onUnauthorized error", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          {
            type: "application_error",
            errors: { auth: { message: "Authentication required" } },
          },
          401
        )
      )
    );
    const api = createApiClient({
      apiUrl: "http://localhost:7001",
      token: "secret",
      fetch: fetchMock,
      onUnauthorized: () => new CliError("session expired", ExitCode.Auth),
    });

    await expect(
      unwrap("http://localhost:7001", () => api.GET("/health"))
    ).rejects.toMatchObject({ message: "session expired" });

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer secret");
  });

  it("reports a 401 without a token as the server's error", async () => {
    const api = createApiClient({
      apiUrl: "http://localhost:7001",
      token: undefined,
      fetch: () =>
        Promise.resolve(
          jsonResponse(
            {
              type: "application_error",
              errors: { auth: { message: "Authentication required" } },
            },
            401
          )
        ),
      onUnauthorized: () => new CliError("session expired", ExitCode.Auth),
    });

    await expect(
      unwrap("http://localhost:7001", () => api.GET("/health"))
    ).rejects.toMatchObject({
      exitCode: ExitCode.Auth,
      message: "auth: Authentication required",
    });
  });
});
