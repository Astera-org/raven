import { dateToUtcIso, dbDateStringToIso } from "#src/api-v0/lib/rutils.js";
import { describe, expect, it } from "vitest";

describe("dateToUtcIso", () => {
  it("returns null for null", () => {
    expect(dateToUtcIso(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(dateToUtcIso(undefined)).toBeNull();
  });

  it("returns null for an invalid date string", () => {
    expect(dateToUtcIso("not-a-date")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(dateToUtcIso("")).toBeNull();
  });

  it("converts a Date instance to its exact ISO 8601 UTC string", () => {
    const date = new Date(Date.UTC(2026, 0, 15, 10, 30, 0));
    expect(dateToUtcIso(date)).toBe("2026-01-15T10:30:00.000Z");
  });

  it("converts a full ISO string to itself", () => {
    expect(dateToUtcIso("2024-03-15T10:30:00.000Z")).toBe(
      "2024-03-15T10:30:00.000Z"
    );
  });

  it("converts a date string that already has a numeric offset, normalizing to UTC", () => {
    expect(dateToUtcIso("2026-01-15T05:30:00-05:00")).toBe(
      "2026-01-15T10:30:00.000Z"
    );
  });

  it("converts a Date instance to an ISO string with a Z suffix", () => {
    const date = new Date("2024-03-15T10:30:00.000Z");
    expect(dateToUtcIso(date)).toBe("2024-03-15T10:30:00.000Z");
  });

  it("converts a date-only string to an ISO string at midnight UTC", () => {
    expect(dateToUtcIso("2024-03-15")).toBe("2024-03-15T00:00:00.000Z");
  });

  it("normalizes an ISO string with a non-UTC offset to UTC", () => {
    expect(dateToUtcIso("2024-03-15T10:30:00.000-05:00")).toBe(
      "2024-03-15T15:30:00.000Z"
    );
  });

  it("coerces a numeric-looking string via String() rather than treating it as a timestamp", () => {
    // `new Date(String(d))` is used internally, so a bare number string like "0"
    // is parsed as a two-digit year, not milliseconds since epoch.
    expect(dateToUtcIso("0")).toBe(new Date("0").toISOString());
  });
});

describe("dbDateStringToIso", () => {
  it("converts the raw database format to a UTC ISO string", () => {
    expect(dbDateStringToIso("2026-08-15 05:07:00")).toBe(
      "2026-08-15T05:07:00.000Z"
    );
  });
});
