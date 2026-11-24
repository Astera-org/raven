import { initConfig } from "#src/config.js";
import { drizzleAdapter, type DB } from "better-auth/adapters/drizzle";
import { drizzleAdapterConfig, generateAuth } from "./auth.js";

/**
 * Config for the `better-auth` CLI schema generator only — run manually via
 * `npx @better-auth/cli generate --config src/lib/auth.generate-config.ts`.
 *
 * The CLI needs a `betterAuth` instance to read the schema shape off, but
 * `drizzleAdapter` never touches `db` until an actual query runs (it only
 * closes over it), and schema generation never issues one — it just reads
 * `drizzleAdapterConfig.schema`. So an empty stub is enough; there's no need
 * for a real (or fake-looking) database connection here.
 */
const stubDb: DB = {};

initConfig();
export const auth = generateAuth(drizzleAdapter(stubDb, drizzleAdapterConfig));
