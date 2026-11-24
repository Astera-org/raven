import type { AppEnv } from "#src/types/hono.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  getCurrentUserHandler,
  getCurrentUserRoute,
} from "./get-current-user.js";
import {
  getMyPublicationListHandler,
  getMyPublicationListRoute,
} from "./get-my-publication-list.js";
import { getUsersHandler, getUsersRoute } from "./get-users.js";

const app = new OpenAPIHono<AppEnv>();

const usersRouter = app
  // GET /
  .openapi(getUsersRoute, getUsersHandler)
  // GET /me
  .openapi(getCurrentUserRoute, getCurrentUserHandler)
  // GET /me/publications
  .openapi(getMyPublicationListRoute, getMyPublicationListHandler);

export default usersRouter;
