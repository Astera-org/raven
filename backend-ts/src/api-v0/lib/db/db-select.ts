import { getDb } from "#src/db/index.js";
import { type SQL } from "drizzle-orm";

/**
 * @deprecated Prefer using drizzle ORM queries where possible.
 */
export type Row<T = unknown> = Record<string, T>;

export async function dbSelect(query: SQL): Promise<Row[]> {
  const [rows] = (await getDb().execute(query)) as unknown as [Row[]];
  return rows;
}
