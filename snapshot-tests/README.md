# snapshot-tests

TypeScript / Vitest snapshot suite for the Raven API. Each case fires a
request at backend-ts and asserts the response matches a checked-in JSON
snapshot.

The harness boots everything itself (no docker-compose): a MySQL and a
Postgres Testcontainer plus a `backend-ts` subprocess per worker, so Docker
must be running.

## Quick start

```sh
pnpm install
pnpm test                                       # assert all snapshots match
pnpm test:update                                # update snapshots (forwards -u to vitest)
```

Snapshots live under [tests/snapshots/](tests/snapshots/) and
are checked into git as the regression baseline.

Overrides:

- `HARNESS_BACKEND_URL=http://127.0.0.1:3000` — attach to an externally-
  managed server instead. Read the DB URI to connect to from
  `.harness-tmp/backend-db.uri.<pid>`.

## Fixture data

SQL fixtures live under [tests/fixtures/](tests/fixtures/). Each file is a
composable building block; tests declare which fixtures to load and the
harness truncates + reloads before each test.

### Stable integer IDs

Fixtures that need a deterministic integer ID (to avoid collisions when
composed) specify it explicitly in the INSERT. The allocations are:

| Entity        | IDs in use                                | File(s)                                                         |
| ------------- | ----------------------------------------- | --------------------------------------------------------------- |
| users         | 1 (alice), 2 (bob), 3 (charlie), 4 (dave) | `users-multi`, `user-with-orcid`                                |
| organizations | 1 (arcadia), 2 (stealth-lab)              | `org-arcadia`, `org-unlisted`                                   |
| publications  | 1–3, 10, 99                               | `pub-published`, `pubs-multi`, `pub-multi-version`, `pub-draft` |
| versions      | 1–3, 10–11, 99                            | same as publications                                            |
| comments      | 1–3                                       | `pub-with-comments`, `pub-with-deleted-comment`                 |
| notifications | 202                                       | `notification`                                                  |

### ULID scheme

Every entity table has an `id_ulid VARCHAR(26) NOT NULL UNIQUE` column. Each
fixture row supplies a deterministic ULID using the following encoding:

```
000000000E + 16-char Crockford base32 ID (zero-padded)
```

The first 10 characters are the timestamp portion (fixed at zero except for
the last digit, which encodes entity type). The last 16 characters are the
numeric ID encoded in Crockford base32, left-padded with zeros.

| Entity             | Digit | Example (id=1)               |
| ------------------ | ----- | ---------------------------- |
| users              | `1`   | `00000000010000000000000001` |
| organizations      | `2`   | `00000000020000000000000001` |
| publications       | `3`   | `00000000030000000000000001` |
| versions           | `4`   | `00000000040000000000000001` |
| comments           | `5`   | `00000000050000000000000001` |
| notifications      | `6`   | `00000000060000000000000001` |
| notification_types | `7`   | `00000000070000000000000001` |
| accounts           | `8`   | `00000000080000000000000001` |

IDs above 9 are Crockford base32-encoded (e.g. id=10 → `A`, id=11 → `B`,
id=99 → `33`, id=202 → `6A`). When adding new fixture rows, follow the same
pattern to keep ULIDs predictable and collision-free across files.
