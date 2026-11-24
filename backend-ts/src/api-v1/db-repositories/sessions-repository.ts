import { sessionElevations } from "#src/db/schema.js";
import { and, eq, gt } from "drizzle-orm";
import { ulid } from "ulid";
import { BaseRepository } from "./base-repository.js";

export class SessionsRepository extends BaseRepository {
  async existsActiveElevation(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sessionElevations.id })
      .from(sessionElevations)
      .where(
        and(
          eq(sessionElevations.sessionId, sessionId),
          gt(sessionElevations.expiresAt, new Date())
        )
      )
      .limit(1);
    return row !== undefined;
  }

  /** Creates or extends the session's elevation in one atomic statement. */
  async upsertElevation(sessionId: string, expiresAt: Date): Promise<void> {
    const createdAt = new Date();
    await this.db
      .insert(sessionElevations)
      .values({ id: ulid(), sessionId, expiresAt, createdAt })
      .onDuplicateKeyUpdate({ set: { expiresAt, createdAt } });
  }
}
