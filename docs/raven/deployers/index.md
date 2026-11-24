---
description: Run a Raven server.
---

# Deployer guide

Raven is designed to be deployed by anybody, independently of The Stacks (which is an opinionated deployment of Raven).
If you're planning a deployment, [tell us about your use case](https://forms.gle/trozK1JUNf2hn9uF9).

A Raven deployment has a backend (`backend-ts/Dockerfile`) and an [admin UI](#admins:admin-ui) (`admin-ui/Dockerfile`).
The backend needs a MySQL database, a Postgres database for its job queue, and S3-compatible storage.
There are no published images, so build them from this repository.

To set up a deployment:

1. [Try it locally](./local.md) to see the full stack running (optional).
2. [Configure](./configuration.md) the backend and admin UI.
3. Host it. See [how The Stacks uses Coolify](xref:thestacks#about:coolify) for one example.

:::{listing}
:source: toc
:display: list
:::
