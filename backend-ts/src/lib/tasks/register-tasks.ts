import { type PgBoss } from "pg-boss";
import { addDoiAudit } from "./doi-audit.js";
import { addUploadMedia } from "./upload-url-media.js";

/** Creates every task's queues and starts their workers. */
export async function registerTasks(boss: PgBoss) {
  await Promise.all([addUploadMedia(boss), addDoiAudit(boss)]);
}
