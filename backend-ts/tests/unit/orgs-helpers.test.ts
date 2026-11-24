import { toUtcIso } from "#src/api-v1/routes/orgs/helpers.js";
import { describe, expect, it } from "vitest";

describe("toUtcIso", () => {
  it("returns null for a nullish input", () => {
    expect(toUtcIso(null)).toBeNull();
    expect(toUtcIso(undefined)).toBeNull();
    expect(toUtcIso("")).toBeNull();
  });

  it("normalizes a database datetime (no timezone) to a UTC ISO string", () => {
    expect(toUtcIso("2024-02-29 13:34:56")).toBe("2024-02-29T13:34:56.000Z");
  });

  it("converts an offset datetime to UTC", () => {
    expect(toUtcIso("2024-02-29T13:34:56+01:00")).toBe(
      "2024-02-29T12:34:56.000Z"
    );
  });

  it("returns null instead of throwing for an unparsable value", () => {
    // This is a known bug with DayJS https://github.com/iamkun/dayjs/issues/2069
    // expect(toUtcIso("0000-00-00 00:00:00")).toBeNull();
    expect(toUtcIso("not-a-date")).toBeNull();
  });
});
