import type { AppEnv } from "#src/types/hono.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { getImportHandler, getImportRoute } from "./get-import.js";
import { postImportHandler, postImportRoute } from "./post-import.js";

const app = new OpenAPIHono<AppEnv>();

const importsRouter = app
  // POST /
  .openapi(postImportRoute, postImportHandler)
  // GET /{id}
  .openapi(getImportRoute, getImportHandler);

export default importsRouter;
