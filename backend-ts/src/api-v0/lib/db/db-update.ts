import { getDb } from "#src/db/index.js";
import { type SQL } from "drizzle-orm";

export async function dbUpdate(query: SQL): Promise<{ affectedRows: number }> {
  const [r] = (await getDb().execute(query)) as unknown as [
    { affectedRows: number },
  ];
  return r;
}
