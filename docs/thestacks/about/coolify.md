---
description: How The Stacks deploys Raven with Coolify.
---

(about:coolify)=

# Example: Coolify

The Stacks runs Raven with [Coolify](https://coolify.io) on a single server, with a MySQL database managed by Coolify.
Each of the backend and admin UI is a Coolify application that uses the Dockerfile build pack, with the repository root as the base directory.

For the backend:

- **Dockerfile location**: `/backend-ts/Dockerfile`
- **Port**: `7001`
- **Healthcheck**: HTTP `GET` on `/api/health`.
- **Persistent storage**: a file mount for `raven.toml` at `/app/raven.toml`, and a volume at the `IMG_DIR` path (`/app/imgs` by default) so uploaded images survive redeploys.
- **Environment variables**: secrets such as database and S3 credentials.
- **Domains**: the API domain, plus `<admin domain>/api` so admin UI requests reach the backend.
  Turn off {gui}`Advanced --> Strip Prefixes` so the backend still sees the `/api` prefix.

For the admin UI, use `/admin-ui/Dockerfile` and the admin domain.

Keep the database off the public internet, and connect to it over an SSH tunnel.
