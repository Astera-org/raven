import {
  getDb,
  type RavenDb,
  type RavenDbClient,
  type RavenDbTx,
} from "#src/db/index.js";
import { TransactionRollbackError } from "drizzle-orm";
import { type BaseRepository } from "./base-repository.js";
import { ContributorsRepository } from "./contributors-repository.js";
import { ImportRepository } from "./import-repository.js";
import { NotificationsRepository } from "./notifications-repository.js";
import { OrgsRepository } from "./orgs-repository.js";
import { PublicationsRepository } from "./publications-repository.js";
import { SessionsRepository } from "./sessions-repository.js";
import { UsersRepository } from "./users-repository.js";
import { VersionsRepository } from "./versions-repository.js";

export class Repositories {
  #cache = new Map<string, BaseRepository>();

  constructor(protected readonly db: RavenDbClient = getDb()) {}

  /** Runs fn atomically. If already inside a transaction, joins it instead of nesting. */
  async transaction<T>(
    fn: (repos: RepositoriesInTransaction, tx: RavenDbTx) => Promise<T>
  ): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new RepositoriesInTransaction(tx), tx)
    );
  }

  /** Escape hatch for when the transaction was opened elsewhere. */
  withTx(tx: RavenDbTx): RepositoriesInTransaction {
    return new RepositoriesInTransaction(tx);
  }

  #memo<T extends BaseRepository>(key: string, make: () => T): T {
    if (!this.#cache.has(key)) this.#cache.set(key, make());
    return this.#cache.get(key) as T;
  }

  // --------------------------- Repositories getters ---------------------------
  // All repositories should be added here with memoization for consistent access
  // ----------------------------------------------------------------------------

  get contributors() {
    return this.#memo(
      "contributors",
      () => new ContributorsRepository(this.db)
    );
  }

  get imports() {
    return this.#memo("imports", () => new ImportRepository(this.db));
  }

  get notifications() {
    return this.#memo(
      "notifications",
      () => new NotificationsRepository(this.db)
    );
  }

  get orgs() {
    return this.#memo("orgs", () => new OrgsRepository(this.db));
  }

  get publications() {
    return this.#memo(
      "publications",
      () => new PublicationsRepository(this.db)
    );
  }

  get sessions() {
    return this.#memo("sessions", () => new SessionsRepository(this.db));
  }

  get users() {
    return this.#memo("users", () => new UsersRepository(this.db));
  }

  get versions() {
    return this.#memo("versions", () => new VersionsRepository(this.db));
  }
}

export class RepositoriesInTransaction extends Repositories {
  override db: RavenDbTx;
  constructor(db: RavenDbTx) {
    super(db);
    this.db = db;
  }

  /** Runs fn atomically. If already inside a transaction, joins it instead of nesting. */
  override async transaction<T>(
    fn: (repos: RepositoriesInTransaction, tx: RavenDbTx) => Promise<T>
  ): Promise<T> {
    return fn(this, this.db);
  }

  /** Escape hatch for when the transaction was opened elsewhere. */
  override withTx(tx: RavenDbTx): RepositoriesInTransaction {
    return new RepositoriesInTransaction(tx);
  }

  /**
   * This is the entire logic of rollback, drizzle just throws an exception and
   * if the `transaction` callback function ends in a thrown exception then it
   * will rollback.
   *
   * If it returns regularly then it will commit the changes.
   *
   * If you catch this error before you leave the transaction callback then it
   * _**will not work**_.
   */
  rollback(): never {
    throw new TransactionRollbackError();
  }
}

export const makeRepositories = (db: RavenDb = getDb()) => new Repositories(db);
export type Repos = Repositories | RepositoriesInTransaction;
