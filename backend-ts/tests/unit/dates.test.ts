import {
  dateToIso8601,
  dbDateToIso8601,
  isUtcDateAfter,
  isValidDbDateTime,
  iso8601ToDbDate,
} from "#src/lib/dates.js";
import { MembershipDateTimeSchema } from "#v1/routes/orgs/schemas.js";
import { describe, expect, it, vi } from "vitest";

describe("dateToIso8601", () => {
  it("returns null for null", () => {
    expect(dateToIso8601(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(dateToIso8601(undefined)).toBeNull();
  });

  it("returns null for an invalid date string", () => {
    expect(dateToIso8601("not-a-date")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(dateToIso8601("")).toBeNull();
  });

  it("converts a Date instance to its exact ISO 8601 UTC string", () => {
    const date = new Date(Date.UTC(2026, 0, 15, 10, 30, 0));
    expect(dateToIso8601(date)).toBe("2026-01-15T10:30:00.000Z");
  });

  it("converts a full ISO string to itself", () => {
    expect(dateToIso8601("2024-03-15T10:30:00.000Z")).toBe(
      "2024-03-15T10:30:00.000Z"
    );
  });

  it("converts a date string that already has a numeric offset, normalizing to UTC", () => {
    expect(dateToIso8601("2026-01-15T05:30:00-05:00")).toBe(
      "2026-01-15T10:30:00.000Z"
    );
  });

  it("converts a Date instance to an ISO string with a Z suffix", () => {
    const date = new Date("2024-03-15T10:30:00.000Z");
    expect(dateToIso8601(date)).toBe("2024-03-15T10:30:00.000Z");
  });

  it("converts a date-only string to an ISO string at midnight UTC", () => {
    expect(dateToIso8601("2024-03-15")).toBe("2024-03-15T00:00:00.000Z");
  });

  it("normalizes an ISO string with a non-UTC offset to UTC", () => {
    expect(dateToIso8601("2024-03-15T10:30:00.000-05:00")).toBe(
      "2024-03-15T15:30:00.000Z"
    );
  });

  it("coerces a numeric-looking string via String() rather than treating it as a timestamp", () => {
    // `new Date(String(d))` is used internally, so a bare number string like "0"
    // is parsed as a two-digit year, not milliseconds since epoch.
    expect(dateToIso8601("0")).toBe(new Date("0").toISOString());
  });
});

describe("dbDateToIso8601", () => {
  it("converts the raw database format to a UTC ISO string", () => {
    expect(dbDateToIso8601("2026-08-15 05:07:00")).toBe(
      "2026-08-15T05:07:00.000Z"
    );
  });

  it("keeps the milliseconds of a datetime(3) value", () => {
    expect(dbDateToIso8601("2024-05-06 07:08:09.123")).toBe(
      "2024-05-06T07:08:09.123Z"
    );
  });

  // These tests record what happens today, so a change to it is noticed. They
  // are not requirements on how the parser must treat such input.
  describe("documents current behavior, not a specification, for input outside the YYYY-MM-DD HH:mm:ss.SSS format", () => {
    it("reads a one-digit fraction as a millisecond count", () => {
      expect(dbDateToIso8601("2024-05-06 07:08:09.1")).toBe(
        "2024-05-06T07:08:09.001Z"
      );
    });

    it("reads a two-digit fraction as a millisecond count", () => {
      expect(dbDateToIso8601("2024-05-06 07:08:09.12")).toBe(
        "2024-05-06T07:08:09.012Z"
      );
    });
  });
});

describe("isValidDbDateTime", () => {
  it("accepts a real database datetime", () => {
    expect(isValidDbDateTime("2024-02-29 13:34:56")).toBe(true);
  });

  it("accepts a database datetime with milliseconds", () => {
    expect(isValidDbDateTime("2024-02-29 13:34:56.123")).toBe(true);
  });

  it.each(["", "1", "12", "1234", "123456"])(
    "rejects a database datetime with fraction '.%s'",
    (fraction) => {
      expect(isValidDbDateTime(`2024-02-29 13:34:56.${fraction}`)).toBe(false);
    }
  );

  it("rejects a fraction that is not digits", () => {
    expect(isValidDbDateTime("2024-02-29 13:34:56.abc")).toBe(false);
  });

  // Without customParseFormat registered, dayjs ignores the format and strict
  // flag and rolls the impossible date over to 2024-03-01.
  it("rejects an impossible date rather than rolling it over", () => {
    expect(isValidDbDateTime("2024-02-30 10:00:00")).toBe(false);
  });
});

describe("iso8601ToDbDate", () => {
  it("converts a datetime with an offset to UTC", () => {
    expect(iso8601ToDbDate("2024-02-29T13:34:56+01:00")).toBe(
      "2024-02-29 12:34:56.000"
    );
  });

  it("keeps a UTC datetime as is", () => {
    expect(iso8601ToDbDate("2024-02-29T13:34:56Z")).toBe(
      "2024-02-29 13:34:56.000"
    );
  });

  it("keeps the milliseconds", () => {
    expect(iso8601ToDbDate("2024-02-29T13:34:56.123Z")).toBe(
      "2024-02-29 13:34:56.123"
    );
  });

  // `pnpm test` runs with TZ=UTC, where reading a value as local time or as UTC
  // gives the same result, so the timezone is switched for this test.
  it.each(["America/Los_Angeles", "Asia/Kolkata"])(
    "reads a datetime without an offset as UTC when the local timezone is %s",
    (timezone) => {
      vi.stubEnv("TZ", timezone);
      try {
        // vi.stubEnv changes the timezone in a forked worker but not in a thread.
        expect(new Date(2024, 1, 29).getTimezoneOffset()).not.toBe(0);
        expect(iso8601ToDbDate("2024-02-29T13:34:56")).toBe(
          "2024-02-29 13:34:56.000"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
});

describe("isUtcDateAfter", () => {
  it("is true when the first datetime is later", () => {
    expect(isUtcDateAfter("2024-02-29 13:34:57", "2024-02-29 13:34:56")).toBe(
      true
    );
  });

  it("is false for an earlier or equal datetime", () => {
    expect(isUtcDateAfter("2024-02-29 13:34:55", "2024-02-29 13:34:56")).toBe(
      false
    );
    expect(isUtcDateAfter("2024-02-29 13:34:56", "2024-02-29 13:34:56")).toBe(
      false
    );
  });
});

describe("MembershipDateTimeSchema", () => {
  it("rejects a two-digit database fraction that would compare differently from storage", () => {
    expect(
      MembershipDateTimeSchema.safeParse("2024-05-06 07:08:09.12").success
    ).toBe(false);
  });

  it("accepts a database datetime with milliseconds", () => {
    expect(
      MembershipDateTimeSchema.safeParse("2024-05-06 07:08:09.123")
    ).toEqual({ success: true, data: "2024-05-06 07:08:09.123" });
  });

  it("keeps the milliseconds of an ISO datetime", () => {
    expect(
      MembershipDateTimeSchema.safeParse("2024-05-06T07:08:09.123Z")
    ).toEqual({ success: true, data: "2024-05-06 07:08:09.123" });
  });

  it("rejects a database datetime that is not a real date", () => {
    expect(
      MembershipDateTimeSchema.safeParse("2025-02-29 12:34:56").success
    ).toBe(false);
  });
});
