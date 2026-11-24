# @raven/docs-screenshots

Playwright scripts that take screenshots of The Stacks and the Raven admin UI for the docs.

The package drives a local Stacks frontend and admin UI against a dedicated `backend-ts` deployment and writes PNGs to `out/`.
Each screenshot is a Playwright test. They are not an assertion suite: run them on demand and look at the PNGs.
The PNGs are never committed. `pnpm push-images` uploads `out/` to S3, and the docs reference the images there.

All commands below run from this directory (`docs/screenshots/`).

## Quickstart

The following must be done once, before the first run:

```bash
cp .env.template .env                  # once; the defaults match docker-compose.yml
pnpm exec playwright install chromium  # once
```

Afterward, you can use the standard flow:

```bash
pnpm backend:up                        # start the screenshot backend on :7005
pnpm shoot                             # seed, start the frontend on :3005, write PNGs to out/
pnpm push-images --dryrun              # see what would be uploaded to S3
# pnpm push-images                     # actually upload images
pnpm backend:down                      # stop the backend and delete its data
```

## Layout

- `shots/`: the Playwright files. One `<docs-page>.spec.ts` per docs page (`shots/raven/` for the Raven docs), plus `seed.setup.ts`, which seeds the data before every run, and `visual-fixtures-accounts.setup.ts` and `visual-fixtures.setup.ts`, which seed [the visual regression fixtures](#visual-regression-fixtures).
- `src/`: helpers the shots import as `#src/<name>` (`shoot`, `dates`, `data`, `env`, `auth`, `orgs`, `publications`, `visual-fixtures`, `global-setup`).
- `bin/sync-s3.sh`: pushes and pulls the PNGs (see [Pushing and pulling images](#pushing-and-pulling-images)).
- `out/`: the PNGs, with The Stacks shots in `out/stacks/` and the Raven admin UI shots in `out/raven/`. Gitignored.
- `playwright.config.ts`, `docker-compose.yml`, `raven.toml`, `.env.template`: configuration.

## Prerequisites

1. **The Stacks frontend.** Have the `thestacks.org` checkout next to this repo, or set `STACKS_FRONTEND_DIR` in `.env` (relative to this directory).
2. **`.env`.** `cp .env.template .env`. The defaults match the credentials in `docker-compose.yml`.
3. **Chromium.** Install it once with `pnpm exec playwright install chromium`.

### Screenshot deployment

Run `pnpm backend:up` to bring it up.

It is a separate compose project (`raven-screenshots`, defined in `docker-compose.yml`) with its own volumes, so it runs alongside `deploy/local` without sharing data.

A deployment created before the switch from MinIO to Garage keeps publications whose media URLs point at MinIO (`localhost:9010`), and seeding skips publications that are already released. Reset it once with `docker compose down -v --remove-orphans && pnpm backend:up`, then seed again. `--remove-orphans` also stops the old MinIO container. The old `minio-data` volume is no longer in the compose file, so remove it with `docker volume rm raven-screenshots_minio-data` if you want it gone.

### Ports

| Service            | Port       | Why                                                                                        |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| Stacks frontend    | 3005       | `pnpm -F @raven/docs live:thestacks` owns 3000. Must match `BASE_URL_WEB` in `raven.toml`. |
| Admin UI           | 3006       | `deploy/local` owns 3003. Must match `BASE_URL_ADMIN` in `raven.toml`.                     |
| Screenshot backend | 7005       | Does not clash with `deploy/local` (7001) or `backend-ts` dev.                             |
| Garage             | 3930, 3932 | Does not clash with `deploy/local` (3900, 3902).                                           |
| MySQL              | 4307       | Does not clash with `deploy/local` (4306).                                                 |
| Postgres           | 5435       | Does not clash with `deploy/local` (5434).                                                 |

Playwright starts both frontends itself, with `VITE_BACKEND_URL=http://localhost:7005`.
It never reuses a frontend already running on 3005 or 3006, which might point at another backend; stop it first or the run fails with a port-in-use error.

## Accounts and seeded data

The screenshot deployment is seeded with some accounts and data.

There are two accounts:

- **Admin** (`admin`, shown as "Admin User"): the site admin. `shots/seed.setup.ts` uses it through the API to create orgs and memberships. The admin UI shots in `shots/raven/` are taken signed in as it, because the admin UI is only for admins. It never appears in a Stacks screenshot.
- **Test user** (`ada`, shown as "Ada Example"): every Stacks screenshot is taken signed in as this user, who owns the example publications.

`shots/seed.setup.ts` runs before every shot. Each step checks first and skips if already done, so a rerun changes nothing. It creates:

- Org **Example Lab** (`example-lab`), the publications' host org, created by the admin.
- Membership in org **Radial**, which `seed-admin` creates. Creating publications requires membership in one of the backend's `PUBLICATION_CREATOR_ORGS` ("Arcadia Science" or "Radial"), so the test user is a member of both Example Lab and Radial. Do not rename Radial: `seed-admin` fails on startup if its org was renamed.
- Publication **`docs-example`**, released. The reader and version shots use it.
- Publication **`docs-example-comments`**, released. Only the comment shots use it. They post, edit and withdraw a comment on every run, so they get their own publication and the comment count on `docs-example` stays fixed.
- Publication **`docs-example-draft`**, never released. The creating-a-publication shots use it, because a released publication's draft locks the slug and license and would not show what an author sees before the first release.

Both publications are created the way an author would: the PubTemplate Google Doc is imported through the creation flow (`/publications/new`), then the Details on `/publications/<id>/edit` get Ada as a byline contributor, Example Lab as host org and the `Result` tag.
The `/edit` URL uses the publication id, not the slug; `editPagePath()` in `src/publications.ts` returns it.

The constants live in `src/data.ts`.

## Visual regression fixtures

The Stacks' visual regression suite renders two publications, `visual-test-1` and `visual-test-2`, recorded from this deployment. `pnpm seed:visual-fixtures` seeds them, separately from `pnpm shoot`:

```bash
pnpm backend:up
pnpm seed:visual-fixtures
```

`shots/visual-fixtures-accounts.setup.ts` (step 1, its own Playwright project) and `shots/visual-fixtures.setup.ts` (the rest, which depends on it) do it all through the API, the way an author and readers would:

1. Signs up the synthetic users (Alex Example, Sam Sample, Jordan Fixture, and the commenters), creates the orgs **Example Institute** and **Arcadia Science**, and adds Sam, the owner, to both. Arcadia Science membership lets Sam create publications and record `visual-test-2`'s DOI, which the backend allows only for Arcadia Science members. Example Institute membership lets Sam release `visual-test-2`, which it hosts.
2. Imports each publication's Google Doc as Sam, sets its slug, and waits until the import reports its media copied to the deployment.
3. Sets the license, contributors, host org and tags, records `visual-test-2`'s DOI, and releases it.
4. Posts the comment threads, each comment as its author, then edits and withdraws the ones the fixtures say.

The content comes from the Google Docs, so editing a doc changes what the next seed imports. The users, contributors, tags and comments are in `src/visual-fixtures.ts`. Ids and dates are whatever the deployment assigns, so recordings must not depend on them.

Like `seed.setup.ts`, every step checks first, so a rerun changes nothing. A step that fails partway can leave a publication or its comments half seeded; reset with `pnpm backend:down && pnpm backend:up` and seed again.

## Adding a screenshot

1. Find the docs page and the UI state it needs.
2. Add a test to `shots/<docs-page>.spec.ts`, creating the file if needed. Navigate, reach the state, wait for a concrete locator, then call `shoot(page, name, { target })`.
3. Prefer `getByRole`/`getByText` locators that match the GUI labels the docs already use in `{gui}` roles, so the docs and the shots stay in sync.
4. Crop to the relevant component with `target`. Use a viewport or `fullPage` shot only for overviews.
5. If the shot needs more data, add it to `shots/seed.setup.ts` with the same check-then-create pattern. Use the admin (API) for orgs and memberships, and the test user (browser) for everything a user would do.
6. Run just that shot with `pnpm shoot --grep "<test title>"` and look at the PNG in `out/stacks/` (or `out/raven/`).

### `shoot()` options

Defined in `src/shoot.ts`:

- `target`: a locator to crop to. A target taller than the viewport is captured in one piece, and sticky headers are unstuck so they are not drawn over it. Fixed headers are not; hide them (the `/edit` page's header is `div.fixed.top-0`).
- `hide`: CSS selectors or locators to make invisible while keeping the layout. Use `dates(page)` and `relativeTimes(page)` from `src/dates.ts` for dates and "3 minutes ago" text.
- `mask`: locators covered with a solid box.
- `css`: extra CSS applied only during the shot, for example to cap a long text field.
- `fullPage`: capture the whole page instead of the viewport.

### Determinism

- Use only the seeded data. Never use real user data.
- Hide or mask anything time-relative or random. The seeded dates change whenever the deployment is reset.
- The viewport (1280×800), device scale factor (2), color scheme, locale and time zone are fixed in `playwright.config.ts`. Do not override them per shot without a reason.

### Naming

`<docs-page>--<what-it-shows>.png`, in kebab-case, for example `creating-a-publication--import-google-doc.png`.
The name passed to `shoot()` starts with the app's folder in `out/`: Stacks shots pass `stacks/<docs-page>--<what-it-shows>`, and Raven shots pass `raven/<docs-page>--<what-it-shows>`.
The same folders hold them in S3: `out/stacks/` is uploaded to `docs-images/stacks/` and `out/raven/` to `docs-images/raven/`.
The exception is `shots/raven/readme.spec.ts`, the repository README's image. To update it, copy it by hand with `cp out/raven/readme--admin-ui.png ../../.github/images/readme-screenshot.png` and commit the copy.
Names are stable: never rename a published image, because the S3 URLs in the docs depend on them.

## Referencing an image in the docs

```markdown
:::{figure} https://<s3-bucket-url>/docs-images/stacks/creating-a-publication--import-google-doc.png
:alt: The Google Doc link field, with an Import button.

Paste the link to your Google Doc and click {gui}`Import`.
:::
```

Alt text and a caption are required.
Raven docs images are under `docs-images/raven/` instead of `docs-images/stacks/`.
The image appears only after it has been uploaded to S3.

## Pushing and pulling images

- `pnpm push-images` uploads the PNGs in `out/stacks/` to `s3://<bucket>/docs-images/stacks/`, and those in `out/raven/` to `s3://<bucket>/docs-images/raven/`.
- `pnpm pull-images` downloads them into the same folders, for example to compare a new run with what is published.

Both need the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) on the `PATH` (`brew install awscli` on macOS) and a profile in `~/.aws/config` that can read and write the bucket.
The AWS CLI is not an npm dependency, so `pnpm install` does not provide it.

- Both read `DOCS_IMAGES_AWS_PROFILE` (an AWS CLI profile) and `DOCS_IMAGES_S3_BUCKET` from the environment first, then from `.env`.
- Extra arguments go to `aws s3 sync`. Run `pnpm push-images --dryrun` first and check the list, then run it again without `--dryrun`.
- Push only shots you have looked at. A push overwrites the published image with the same name.
- Neither command deletes anything. To retire an image, remove it from the bucket by hand, and only once no docs page references it.

## Troubleshooting

| Symptom                               | Cause and fix                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Global setup says the backend is down | The deployment is not up. Run `pnpm backend:up`.                                        |
| Admin setup step fails                | The admin credentials in `.env` do not match `docker-compose.yml`.                      |
| Sign-in fails with an origin error    | The frontend is not on 3005, or `BASE_URL_WEB` in `raven.toml` was changed.             |
| `/publications/new` redirects to home | The test user is not a member of Radial, so it cannot create publications.              |
| Import never fills the title          | The PubTemplate Google Doc is no longer shared as "Anyone with the link".               |
| Shot is blank or half-rendered        | Hydration. Wait for a concrete locator before calling `shoot()`.                        |
| Port already in use                   | Stop whatever holds 3005, 7005, 3930, 3932 or 4307.                                     |
| Shots do not reflect a backend change | The compose backend is built from the repo. Rerun `pnpm backend:up`, which rebuilds it. |
| Data is in a bad state                | `pnpm backend:down && pnpm backend:up`, then run again.                                 |
