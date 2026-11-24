import { getConfig } from "#src/config.js";
import { createFilesRouter } from "#src/lib/shared-routes/files.js";
import { type AppEnv } from "#src/types/hono.js";
import authRouter from "#v0/routes/auth.js";
import commentsRouter from "#v0/routes/comments.js";
import contactUsRouter from "#v0/routes/contact-us.js";
import notificationsRouter from "#v0/routes/notifications.js";
import orgsRouter from "#v0/routes/orgs.js";
import publicationsRouter from "#v0/routes/publications.js";
import sitemapRouter from "#v0/routes/sitemap.js";
import usersRouter from "#v0/routes/users.js";
import { Hono } from "hono";

export function createV0App() {
  const config = getConfig();
  const app = new Hono<AppEnv>();
  const filesRouter = createFilesRouter((c) =>
    c.var.jsonErrors({ file: ["Not found"] }, 404)
  );
  let routes = app
    .route("/auth", authRouter)
    .route("/users", usersRouter)
    .route("/publications", publicationsRouter)
    .route("/comments", commentsRouter)
    .route("/orgs", orgsRouter)
    .route("/files", filesRouter)
    .route("/notifications", notificationsRouter)
    .route("/sitemap", sitemapRouter);

  if (config.LINEAR_API_KEY && config.LINEAR_TEAM_ID) {
    routes = routes.route("/contact-us", contactUsRouter);
  }

  return routes;
}
