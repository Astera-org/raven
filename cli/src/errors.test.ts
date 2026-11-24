import { describe, expect, it } from "vitest";
import { apiError, CliError, ExitCode, networkError } from "./errors.js";

describe("apiError", () => {
  it("formats v1 business errors", () => {
    const error = apiError(404, {
      type: "application_error",
      errors: { org: { message: "Organization not found" } },
    });

    expect(error.exitCode).toBe(ExitCode.NotFound);
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("org: Organization not found");
    expect(error.details).toEqual({
      status: 404,
      body: {
        type: "application_error",
        errors: { org: { message: "Organization not found" } },
      },
    });
  });

  it("formats v1 validation errors", () => {
    const error = apiError(422, {
      type: "validation_error",
      errors: [{ code: "too_small", path: ["name"], message: "Too short" }],
      error: "Validation failed",
    });

    expect(error.exitCode).toBe(ExitCode.Validation);
    expect(error.message).toBe("name: Too short");
  });

  it.each([
    [401, ExitCode.Auth],
    [403, ExitCode.Auth],
    [400, ExitCode.Validation],
    [500, ExitCode.Server],
    [418, ExitCode.General],
  ])("maps status %i to exit code %i", (status, exitCode) => {
    expect(apiError(status, undefined).exitCode).toBe(exitCode);
  });

  it.each([409, 412])("treats %i as a conflict", (status) => {
    const error = apiError(status, {
      type: "application_error",
      errors: { draft: { message: "The draft was changed" } },
    });

    expect(error.exitCode).toBe(ExitCode.Conflict);
    expect(error.code).toBe("conflict");
  });

  it("leaves the root key out of the message", () => {
    expect(
      apiError(415, {
        type: "application_error",
        errors: { root: { message: "Unsupported Media Type" } },
      }).message
    ).toBe("Unsupported Media Type");
  });

  it("falls back to the status when the body has no message", () => {
    expect(apiError(502, "Bad Gateway").message).toBe(
      "request failed with status 502"
    );
  });
});

describe("networkError", () => {
  it("reports the underlying cause of a failed fetch", () => {
    const cause = new TypeError("fetch failed", {
      cause: new Error("connect ECONNREFUSED 127.0.0.1:7001"),
    });
    const error = networkError("http://localhost:7001", cause);

    expect(error).toBeInstanceOf(CliError);
    expect(error.exitCode).toBe(ExitCode.Network);
    expect(error.message).toBe(
      "could not reach http://localhost:7001: connect ECONNREFUSED 127.0.0.1:7001"
    );
  });

  it("falls back to the error code when the cause has no message", () => {
    const refused = Object.assign(new AggregateError([], ""), {
      code: "ECONNREFUSED",
    });
    const cause = new TypeError("fetch failed", { cause: refused });

    expect(networkError("http://localhost:7001", cause).message).toBe(
      "could not reach http://localhost:7001: ECONNREFUSED"
    );
  });

  it("reports timeouts", () => {
    const cause = new DOMException("The operation timed out.", "TimeoutError");

    expect(networkError("https://api.thestacks.org", cause).message).toBe(
      "could not reach https://api.thestacks.org: request timed out"
    );
  });
});
