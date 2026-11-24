---
title: About Raven
description: What Raven is for, the principles behind it, and how we expect it to change.
---

Raven is an open source, API-first backend for running your own scientific publishing platform.
It's for organizations that want to make their own choices about publishing, like who can publish and what readers see.
You run Raven and build or adapt a frontend on its API.
[The Stacks](https://thestacks.org) is one deployment of Raven, run by Astera, and we hope to see many others.
See [](xref:thestacks#about:raven-and-the-stacks) for how the two relate, and the [deployer guide](./deployers/index.md) for what a deployment needs.

## Design principles

These principles guide our product and engineering decisions.

**API first.**
Everything goes through the same public [API](https://api.thestacks.org/api/v1/docs), so each deployment can design its own experience.
Raven has no reader-facing website of its own, and The Stacks' frontend gets no special access.

**Structured, reusable content.**
Publications should be structured documents with rich metadata, so people and machines (including AI tools) can find, judge, and reuse them.
Readers, not the platform, decide what's worth reading.

**Meet authors where they are.**
Authors should be able to write in the tools they already use.
We aim for every importer to produce the same publication structure.

**Part of the scientific record.**
Every publication should be citable, persistent, and linked to other work.
Publications get DOIs, authors are linked by ORCID, and organizations by ROR.
A change creates a new version, and we avoid deleting contributions that others rely on.

**Publish, then discuss.**
By default, authors publish when they're ready, and review adds to the public record instead of gating it.
Each deployment decides who can publish and what checks to run.

**Deployers make the choices.**
Each deployment sets its own policies, frontend, and branding through [configuration](./deployers/configuration.md) and the [admin UI](#admins:admin-ui), not code changes.
Raven's pieces each have a clear job, and nothing in Raven should be specific to The Stacks.

**Built for experiments.**
Raven should make it easy to try new ideas in publishing. We'll share what we learn, including what doesn't work, and we hope others do as well.

## Built on open tools

We're committed to building Raven on open technology wherever possible, and to contributing back to it where we can.
For example, Raven uses the [MyST Document Engine](https://mystmd.org) to work with content.
When Raven needs a publishing feature that other projects could use, we try to add it to MyST instead of only to Raven.

Raven is licensed under BSD 3-Clause, so you can use, adapt, and redistribute it.

## How Raven will evolve

**Raven is alpha software.**
It changes quickly, and its formats, APIs, and configuration may change as we learn what works.
If you deploy it, use a tagged [release](https://github.com/Astera-org/raven/releases) and expect some upgrades to need work on your side.
The API marks each endpoint as [stable or alpha](https://github.com/Astera-org/raven/blob/main/backend-ts/src/api-v1/README.md#endpoint-status).

- Alpha endpoints can change in any way, so read the release notes before you upgrade.
- Stable endpoints only change in backwards-compatible ways, but they may become deprecated
- Deprecated endpoints may get marked with a sunset-date, after which the endpoint will no longer be available

Astera leads Raven, and our priorities come from The Stacks and a few partner groups that deploy their own Raven.
See the [contributing guide](https://github.com/Astera-org/raven/blob/main/CONTRIBUTING.md) for how the project is run today.

## Logo and brand

Raven's logo, colors, fonts, and voice are in the [Raven brand guidelines](https://raven-brand.vercel.app/), along with a downloadable kit of every file.
If you build a platform on Raven, the kit has a "Powered by Raven" credit for your footer.
See the [design acknowledgements](https://docs.thestacks.org/thestacks/about/brand/#brand-acknowledgements).
