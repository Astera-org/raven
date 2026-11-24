---
title: Get started
description: Set up a development environment and run the backend.
---

See [](#architecture) for how the backend, admin UI, CLI, and a frontend fit together.

There are two ways to set up a development environment:

1. Use the provided devcontainer: follow the [devcontainer README](https://github.com/Astera-org/raven/blob/main/.devcontainer/README.md).
2. Develop directly on your machine, as described below.

## Prerequisites

- Node.js >= 24
- pnpm >= 12
  - Using corepack: `npm install --global corepack@latest && corepack enable pnpm`
- Docker
- FFmpeg (provides `ffprobe`, used to inspect uploaded audio and video)
  - macOS: `brew install ffmpeg`
- [gitleaks](https://github.com/gitleaks/gitleaks) >= 8.19 (scans staged changes for secrets in the pre-commit hook)
  - macOS: `brew install gitleaks`
  - Other platforms: see the [gitleaks installation docs](https://github.com/gitleaks/gitleaks#installing)
- VSCode

`pnpm install` installs the [lefthook](https://lefthook.dev) git hooks.
The pre-commit hook fails if gitleaks is missing or finds a secret in the staged changes.
If a finding is a false positive, add `gitleaks:allow` as a comment on that line, or add the finding's fingerprint to `.gitleaksignore`.

## Setup

Start the databases and the backend:

```{include} ../../../README.md
:start-after: <!-- dev-setup-start -->
:end-before: <!-- dev-setup-end -->
```

## Common commands

Run commands from the repo root unless otherwise noted.
See [](./backend.md) for more on the backend, and [](./docs.md) to build these docs.

### Testing

```sh
# Run all tests across the workspace
pnpm test

# Run backend-ts unit tests only
pnpm --filter @raven/backend-ts test

# Run integration tests (spins up Docker services)
pnpm --filter @raven/integration-tests test

# Run integration tests in watch mode
pnpm --filter @raven/integration-tests test:watch
```

### Linting & Formatting

```sh
# Lint all packages
pnpm lint

# Lint a specific package
pnpm --filter @raven/backend-ts lint

# Format all files
pnpm format

# Check formatting without writing
pnpm format:check
```

### Type Checking

```sh
# Type-check all packages
pnpm typecheck

# Type-check a specific package
pnpm --filter @raven/backend-ts typecheck
```

### Database

See [](./backend.md) for the database migration commands.

## Workspace structure

```{include} ../../../README.md
:start-after: ## Workspace Structure
:end-before: ## Contributing
```
