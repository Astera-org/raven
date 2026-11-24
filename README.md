<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/raven/brand/raven-lockup-white.svg">
    <img src="docs/raven/brand/raven-lockup-dark.svg" alt="Raven" width="240">
  </picture>
</p>

<p align="center">
  An open source, API-first backend for running your own scientific publishing platform that allows authors to share their work as structured, citable documents.
</p>

<p align="center">
  <a href="https://docs.thestacks.org/raven/">Documentation</a> ·
  <a href="https://api.thestacks.org/api/v1/docs">API reference</a> ·
  <a href="https://thestacks.org">See it live on The Stacks</a>
</p>

> [!IMPORTANT]
> Raven is alpha software, and its formats and APIs may change between releases.
> See [how Raven will evolve](https://docs.thestacks.org/raven/about#how-raven-will-evolve) before you build on it.

![The Raven admin UI, showing an organization with its members and publications](.github/images/readme-screenshot.png)

## Why Raven

- **Machine-readable publications.** Authors write in MyST or Google Docs. Raven stores each version as structured content, so other tools can read it directly.
- **Citable.** Publications get DOIs, authors are linked by ORCID, and organizations by ROR.
- **Configurable.** Each deployment decides who can publish, and brings its own frontend and branding. [The Stacks](https://thestacks.org) is "just" one deployment of Raven, and we hope to see many others.
- **Publish, then discuss.** There's no submission or review workflow. Authors can publish when they're ready, and readers respond in comments.

See [About Raven](https://docs.thestacks.org/raven/about) for more about the project.

## Try it

Run a full Raven deployment on your machine with Docker:

```sh
git clone https://github.com/Astera-org/raven.git
cd raven/deploy/local
docker compose up -d --build --wait
```

The API is at <http://localhost:7001>, and its reference is at <http://localhost:7001/api/v1/docs>.
The admin UI is at <http://localhost:3003>.
Log in with the admin credentials in [`docker-compose.yml`](./deploy/local/docker-compose.yml).
Raven has no reader-facing website of its own.
To see one, run [thestacks](https://github.com/Astera-org/thestacks) and point it at this API.
To run your own server, see the [deployer guide](https://docs.thestacks.org/raven/deployers/).

## Run from source

To run the backend from source, you need Node.js, pnpm, Docker, and a few other tools.
See the [prerequisites](https://docs.thestacks.org/raven/developers/get-started/#prerequisites).
If you started the full deployment above, stop it first by running `docker compose down` in `deploy/local/`.
Both use the same ports.
Then start the databases and the backend:

<!-- dev-setup-start -->

```sh
pnpm install
deploy/local/docker-compose-dev.sh up  # MySQL, Postgres and Garage

cd backend-ts
cp raven.example.toml raven.toml
MIGRATION_DATABASE_URI="mysql://root:root_password@localhost:4306/raven?charset=utf8mb4" pnpm db:migrate
pnpm dev  # API at http://localhost:7001
```

<!-- dev-setup-end -->

The [developer guide](https://docs.thestacks.org/raven/developers/) covers tests, linting, the database, and each package.

## Learn more

| I want to…                     | Go to                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Run my own Raven server        | [Deployer guide](https://docs.thestacks.org/raven/deployers/)                                                     |
| Manage users and organizations | [Admin guide](https://docs.thestacks.org/raven/admins/)                                                           |
| Run Raven from source          | [Developer guide](https://docs.thestacks.org/raven/developers/)                                                   |
| Build on the API               | [API guide](https://docs.thestacks.org/thestacks/api/) and [API reference](https://api.thestacks.org/api/v1/docs) |
| Read or publish on The Stacks  | [The Stacks docs](https://docs.thestacks.org/thestacks/)                                                          |

## Workspace Structure

This is a pnpm monorepo. Packages are defined in [pnpm-workspace.yaml](pnpm-workspace.yaml).

| Path                | Package                    | Description                           |
| ------------------- | -------------------------- | ------------------------------------- |
| `backend-ts/`       | `@raven/backend-ts`        | TypeScript/Hono HTTP server           |
| `admin-ui/`         | `@raven/admin-ui`          | Admin web interface                   |
| `eslint-config/`    | `@raven/eslint-config`     | Shared linter configuration           |
| `eslint-rules/`     | `@raven/eslint-rules`      | Custom lint rules                     |
| `cli/`              | `@raven/cli`               | `raven` command-line interface        |
| `importers/*/`      | `@raven/importer-*`        | Content importers, one per format     |
| `core/*/`           | `@raven/core-*`            | Code shared between packages          |
| `tests/`            | `@raven/integration-tests` | Integration tests (Docker-based)      |
| `admin-ui-e2e/`     | `@raven/e2e-tests`         | Playwright E2E tests for admin-ui     |
| `snapshot-tests/`   | `@raven/snapshot-tests`    | Backend snapshot tests (Docker-based) |
| `docs/`             | `@raven/docs`              | Documentation sites (MyST)            |
| `docs/screenshots/` | `@raven/docs-screenshots`  | Screenshot generation for the docs    |

The `deploy/` folder isn't a package. It has configuration and scripts for deployment.

## Contributing

Astera develops Raven in a private repository and pushes commits here periodically.
We aren't accepting outside pull requests yet, but we welcome issues.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for how the project is run and how to report bugs or security issues.

## License

BSD 3-Clause License. See [LICENSE](./LICENSE).
