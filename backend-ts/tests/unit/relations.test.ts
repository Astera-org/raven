import * as relations from "#src/db/relations.js";
import * as schema from "#src/db/schema.js";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  normalizeRelation,
} from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("db relations", () => {
  it("every relation() config resolves without a real DB connection", () => {
    const combined = { ...schema, ...relations };
    const { tables, tableNamesMap } = extractTablesRelationalConfig(
      combined,
      createTableRelationsHelpers
    );

    const failures: string[] = [];
    for (const table of Object.values(tables)) {
      for (const [key, relation] of Object.entries(table.relations)) {
        try {
          normalizeRelation(tables, tableNamesMap, relation);
        } catch (e) {
          failures.push(
            `${table.tsName}.${key}: ${e instanceof Error ? e.message : e}`
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
