import { getDb } from "#src/db/index.js";
import { type SQL } from "drizzle-orm";

export async function dbInsert(query: SQL): Promise<number> {
  const [r] = (await getDb().execute(query)) as unknown as [
    { insertId: number },
  ];
  return r.insertId;
}
