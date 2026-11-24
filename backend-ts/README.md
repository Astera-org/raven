# Raven Backend (TypeScript)

REST API for the Raven scholarly publication platform. Handles publications, versioning, contributors, organizations, comments, notifications, and authentication.

**Stack:** Node.js 24 · TypeScript · [Hono](https://hono.dev/) · MySQL (Drizzle ORM) · S3

---

## Getting started

```bash
pnpm install
```

Copy and fill in `raven.toml` (see [Configuration](#configuration)):

```bash
pnpm dev          # dev server with watch (port 7001)
pnpm build        # compile to dist/
pnpm start        # run compiled output
```

### Database

```bash
pnpm db:migrate   # apply pending migrations
pnpm db:generate  # generate migrations from schema changes
pnpm db:push      # push schema directly (dev only)
```

`db:migrate` skips migrations unless `MIGRATION_DATABASE_URI` is set.

---

## Configuration

The server reads `raven.toml` (or a path set via `RAVEN_CONFIG`). Environment variables override TOML values when set.

| Key                       | Default      | Description                                                                                                                                            |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URI`            | —            | MySQL connection string (required)                                                                                                                     |
| `MIGRATION_DATABASE_URI`  | —            | Connection string for migrations (optional)                                                                                                            |
| `BASE_URL_WEB`            | —            | Frontend origin (used in emails, CORS)                                                                                                                 |
| `BASE_URL_ADMIN`          | —            | Admin UI origin                                                                                                                                        |
| `BASE_URL_API`            | —            | API origin                                                                                                                                             |
| `SERVER_HOST`             | `0.0.0.0`    | Bind address                                                                                                                                           |
| `SERVER_PORT`             | `7001`       | Listen port                                                                                                                                            |
| `JWT_SECRET_KEY`          | —            | JWT signing secret (required)                                                                                                                          |
| `BETTER_AUTH_SECRET`      | —            | BetterAuth secret (required)                                                                                                                           |
| `AWS_*`                   | —            | S3 credentials, bucket, and endpoints (see `raven.example.toml` for a local S3-compatible service like Garage)                                         |
| `MAILGUN_API_KEY`         | —            | Outbound email                                                                                                                                         |
| `DATACITE_*`              | —            | DOI registration credentials                                                                                                                           |
| `DATACITE_PREFIX`         | —            | DOI prefix for all minted DOIs. DOIs are only minted for organizations with DOI minting enabled.                                                       |
| `DATACITE_PUBLISHER`      | `The Stacks` | Publisher name in DOI metadata. When it's `The Stacks`, Astera Institute is also added as the hosting institution, so change it for other deployments. |
| `ORCID_*`                 | —            | ORCID OAuth                                                                                                                                            |
| `GOOGLE_*`                | —            | Google OAuth                                                                                                                                           |
| **Astera Specific Below** | -            | -                                                                                                                                                      |
| `LINEAR_*`                | -            | Our contact-us form uses the data to crerate a linear task, which requires these keys                                                                  |

---

## API routes

All routes are prefixed with `/api`.

| Prefix                    | Purpose                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `/auth`                   | Login, signup, token refresh, ORCID/Google SSO                                                     |
| `/users`                  | User profiles, search, avatar upload                                                               |
| `/publications`           | Publications and versioned content                                                                 |
| `/comments`               | Threaded comments with text anchors                                                                |
| `/orgs`                   | Organization management                                                                            |
| `/files`                  | Serve files from IMG_DIR (local filesystem)                                                        |
| `/notifications`          | In-app and email notifications                                                                     |
| `/sitemap`                | XML sitemap                                                                                        |
| `/health`                 | Health check                                                                                       |
| **Astera Specific Below** | -                                                                                                  |
| `/contact-us`             | [Astera specific] Accepts form data that is submitted to linear, contingent on the above variables |

---

## Project structure

```
src/
├── index.ts          # Entry point — starts the server
├── app.ts            # Hono app, middleware, route wiring
├── config.ts         # Config loading from raven.toml
├── db/
│   ├── index.ts      # DB connection
│   └── schema.ts     # Drizzle schema
├── lib/
│   ├── auth.ts       # BetterAuth setup
│   ├── mail.ts       # Mailgun email
│   ├── media.ts      # S3 image upload
│   └── references.ts # Reference extraction
├── api-v0/           # v0 routes, also served under /api
└── api-v1/           # v1 routes
```

For how MyST publications are stored and built, see [MyST publications](../docs/raven/developers/myst-publications.md).

---

## Testing

```bash
pnpm test         # run unit tests (vitest)
pnpm typecheck    # type-check without emitting
DATACITE_NAME="[user]" DATACITE_PASSWORD="[pass]" DATACITE_PREFIX="[prefix]" pnpm exec vitest run datacite-live.test  # Run datacite-live tests
```

Integration tests use `tests/raven.test.toml` and a real database. See the [integration tests README](../tests/README.md) for the full test environment setup.

---

## Authentication

- **JWT** — 24 h access token, 30 d refresh token (signed with `JWT_SECRET_KEY`)
- **Passwords** — PBKDF2-SHA256, Werkzeug-compatible
- **SSO** — ORCID OAuth, Google OAuth
