import { getDb } from "#src/db/index.js";
import { type Row } from "#v0/lib/db/db-select.js";
import { sql, type SQL } from "drizzle-orm";

// Shared column list for the public-facing user shape, kept in one place so
// call sites can't drift out of sync with each other. It deliberately leaves
// out `email`: these routes are unauthenticated, so anything here is readable
// by anyone. Routes that may show a user their own email select it separately
// (see `canSeeUserEmail`).
export const PUBLIC_USER_FIELDS = sql`id_int, username, first_name, last_name, image as avatar, profile, orcid, created_at, updated_at`;

export class UsersRepository {
  private db: ReturnType<typeof getDb>;

  constructor() {
    this.db = getDb();
  }

  private async execute(query: SQL): Promise<Row[]> {
    const [rows] = (await this.db.execute(query)) as unknown as [Row[]];
    return rows;
  }

  private async executeValue(query: SQL): Promise<unknown> {
    const rows = await this.execute(query);
    const row = rows[0];
    return row ? (Object.values(row)[0] ?? null) : null;
  }

  async getUserState(userId: number): Promise<string | null> {
    return (await this.executeValue(
      sql`SELECT state FROM users WHERE id_int = ${userId}`
    )) as string | null;
  }

  async listPublicUsers({
    perPage,
    offset,
  }: {
    perPage: number;
    offset: number;
  }): Promise<{ items: Row[]; total: number }> {
    const [items, total] = await Promise.all([
      this.execute(
        sql`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE state IN ('ACTIVE','SITE_ADMIN') ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`
      ),
      this.executeValue(
        sql`SELECT COUNT(*) FROM users WHERE state IN ('ACTIVE','SITE_ADMIN')`
      ),
    ]);

    return { items, total: Number(total ?? 0) };
  }
}
