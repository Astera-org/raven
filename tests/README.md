# Tests

Integration tests for the Raven backend, written in TypeScript with [Vitest](https://vitest.dev/).

## Structure

- `src/integration/` — API integration tests (auth, users, orgs, publications, comments, sitemap)
- `src/config.ts` — Reads config from a TOML file

## Running

Tests spin up a MySQL database and a backend instance via Docker Compose, run, then tear down.

```sh
# From the tests/ directory:
make test          # build, run, teardown
make test-watch    # keep containers up between runs (faster iteration)
make test-up       # start containers only
make test-down     # stop and remove containers + volumes
```

## Config

The integration tests use `src/integration/raven.integration.toml`, which is baked into the Docker image at test time. It points at the `db-test` and `backend-test` containers defined in `docker-compose.test.yml`.

The live DataCite tests (`backend-ts/tests/live/`) read credentials from environment variables (`DATACITE_NAME`, `DATACITE_PASSWORD`, `DATACITE_PREFIX`) and must be run manually against the DataCite sandbox.

## Debugging

For development and debugging, it can be useful to run the tests against a backend that you can modify. For this, do the following:

1. Start the integration test db and Garage (S3 storage) with `make test-up`.
2. Run the backend against the integration test stack, from `backend-ts/`: `RAVEN_CONFIG=../tests/raven.local-backend.toml pnpm dev`.
3. Run the tests against the development backend

For example, you can do the following:

```
SERVER_URL=http://localhost:7001 pnpm exec vitest run integration
```

To run just one test (e.g., comments):

```
SERVER_URL=http://localhost:7001 pnpm exec vitest run integration/comments
```
