import { describe, expect, it } from "vitest";
import { query } from "./helpers.js";

describe("ULID SQL functions", () => {
  it("keeps milliseconds in the timestamp of ULID_FROM_DATETIME", async () => {
    const rows = await query<{ t: string }>(
      `SELECT DATE_FORMAT(ULID_TO_DATETIME(ULID_FROM_DATETIME('2026-09-28 09:43:26.362')), '%Y-%m-%d %H:%i:%s.%f') AS t`
    );
    expect(rows[0]?.t).toBe("2026-09-28 09:43:26.362000");
  });
});
