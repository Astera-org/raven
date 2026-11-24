import { z } from "@hono/zod-openapi";
import { DoiUpdateSchema } from "./patch-publication.js";

export const PutDoiBodySchema = z.object({ doi: DoiUpdateSchema });
