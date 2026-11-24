import { getDb, type RavenDbClient } from "#src/db/index.js";

export class BaseRepository {
  constructor(protected db: RavenDbClient = getDb()) {}
}
