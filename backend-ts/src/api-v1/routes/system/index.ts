import type { AppEnv } from "#src/types/hono.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { healthHandler, healthRoute } from "./health.js";

const app = new OpenAPIHono<AppEnv>();

const systemRouter = app.openapi(healthRoute, healthHandler);

export default systemRouter;
