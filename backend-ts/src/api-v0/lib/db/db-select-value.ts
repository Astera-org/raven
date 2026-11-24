import { getDb } from "#src/db/index.js";
import { type SQL } from "drizzle-orm";

export async function dbSelectValue(query: SQL): Promise<unknown> {
  const [rows] = (await getDb().execute(query)) as unknown as [
    Array<Record<string, unknown>>,
  ];
  const row = rows[0];
  return row ? (Object.values(row)[0] ?? null) : null;
}
