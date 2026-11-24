---
description: Configure the backend and admin UI, and create the first site admin.
---

# Configure a deployment

## Backend settings

```{include} ../../../backend-ts/README.md
:start-after: ## Configuration
:end-before: ## API routes
```

## Set up DataCite

To mint DOIs, set the `DATACITE_*` settings above.
Then an admin [turns on DOI minting](#admins:doi-minting) for each organization that needs it.

:::{warning} To be filled
How to get a DataCite account and DOI prefix.
Tracked in [STACKS-559](https://linear.app/astera/issue/STACKS-559).
:::

## First run

The backend image runs database migrations on startup if `MIGRATION_DATABASE_URI` is set.

To create the first [site admin](#admins:roles), run `node dist/scripts/seed-admin.js` in the backend container with `ADMIN_USERNAME` and `ADMIN_PASSWORD` set.
The local deployment does this on startup.

## Admin UI

```{include} ../../../admin-ui/README.md
:start-after: ## Production deployment
:end-before: ## Local docker-based deployment
```

## Log in as the first admin

:::{warning} To be filled
Where to log in with the first site admin, and what to set up first.
Tracked in [STACKS-559](https://linear.app/astera/issue/STACKS-559).
:::
