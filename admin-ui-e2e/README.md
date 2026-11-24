# @raven/e2e-tests

Playwright end-to-end tests for the admin UI (`admin-ui/`), driven against a
running `admin-ui` dev server and its `backend-ts` API.

## Setup

```bash
cp .env.template .env
pnpm install
pnpm exec playwright install --with-deps chromium
```

`TEST_ADMIN_USERNAME`/`TEST_ADMIN_PASSWORD` must be an account that already
exists (`SITE_ADMIN` or an org admin) in the database you're testing against.
Whether that account is already there depends on which local setup you're
using:

- **`deploy/local/docker-compose.yml`** (the "Full deployment" in the repo's
  own [README](../README.md)) seeds one automatically on container
  startup — its `backend` service runs
  `seed-admin.js` as part of its command with fixed credentials. Use those:
  `TEST_ADMIN_USERNAME=admin`, `TEST_ADMIN_PASSWORD=admin_dev_password`.
- **`deploy/local/docker-compose.dev.yml`** (infra only — MySQL + Garage — with
  `backend-ts`/`admin-ui` run via `pnpm dev`, the setup this README's
  [Running](#running) section below assumes) does **not** seed anything.
  Create the account yourself, once, with whatever credentials you'll put in
  `.env`:

  ```bash
  cd ../backend-ts
  ADMIN_USERNAME=<TEST_ADMIN_USERNAME> ADMIN_PASSWORD=<TEST_ADMIN_PASSWORD> pnpm run seed:admin
  ```

  This runs `src/scripts/seed-admin.ts` directly (same script the Docker
  command invokes) against whatever `DATABASE_URI` your `backend-ts/raven.toml`
  points at. It's idempotent — safe to re-run, it skips creation once the user
  and org already exist.

## Running

```bash
pnpm test              # headless, starts backend-ts + admin-ui for you
pnpm test:headed       # same, with a visible browser
pnpm test:ui           # Playwright's UI mode
```

By default `playwright.config.ts` starts both dev servers itself
(`webServer`) and reuses them if they're already running (`reuseExistingServer`,
disabled in CI). That means backend-ts needs a database it can reach — bring
up local infra first if you don't already have it running:

```bash
docker compose -f ../deploy/local/docker-compose.dev.yml up -d
```

If you'd rather run the servers yourself in separate terminals
(`pnpm --filter @raven/backend-ts dev`, `pnpm --filter @raven/admin-ui dev`),
Playwright will detect and reuse them locally instead of spawning its own.

### Config

| Env var               | Default                 | Meaning                                         |
| --------------------- | ----------------------- | ----------------------------------------------- |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3003` | admin-ui origin (see `admin-ui/vite.config.ts`) |
| `VITE_BACKEND_URL`    | `http://localhost:7001` | backend-ts origin admin-ui proxies `/api` to    |
| `TEST_ADMIN_USERNAME` | —                       | Login for the shared authenticated test session |
| `TEST_ADMIN_PASSWORD` | —                       | Password for the same account                   |

## Structure

```
e2e/
├── auth/
│   ├── admin.setup.ts   # "setup" project: signs in, saves storageState
│   └── login.spec.ts    # exercises the /login form itself
├── models/
│   └── login-page.ts    # Page Object Model classes
└── routes.spec.ts        # smoke test: protected routes load + are auth-gated
utils.ts                  # settle(), authenticateAdmin()
```

## Tests that require authentication

Most specs run as the `chromium` project, which depends on the `setup`
project (`e2e/auth/admin.setup.ts`). That setup step signs in once via
BetterAuth's sign-in endpoint directly (`authenticateAdmin()` in `utils.ts`,
no UI interaction) and writes the resulting session to
`playwright/.auth/admin.json`, which every other test in the project reuses —
so individual specs don't each pay the cost of a fresh login.

A spec that needs to test the _signed-out_ experience (the login form itself,
or that a route redirects to `/login`) overrides this per-`describe` block
with:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

See `e2e/routes.spec.ts` and `e2e/auth/login.spec.ts` for examples of both
patterns.

## Adding a new page object / spec

1. Add a `PageName` class to `e2e/models/` — locators in the constructor,
   action methods (`goto()`, the page's main actions) that end by calling
   `settle(page)` so assertions don't race in-flight requests.
2. Group specs by feature under `e2e/<feature>/`, following `e2e/auth/`.
3. Reuse the authenticated `chromium` project by default; only opt out of
   `storageState` for specs that specifically test unauthenticated behavior.

## CI

No CI workflow wires this up yet. Unlike the frontend repo this pattern was
adapted from (Vercel preview deployments + a `repository_dispatch` trigger),
this monorepo deploys via Docker images with no per-PR preview environment
(see `.github/workflows/build-backend-ts.yml` and `deploy/local/`). A future
CI job would need to either build+run both services in the runner (bringing
up `deploy/local/docker-compose.dev.yml` for infra, then `pnpm dev` for both
apps) or target a shared staging deployment directly.
