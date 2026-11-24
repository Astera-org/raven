---
description: Read publications from code and build your own tools with The Stacks API.
---

# API guide

The Stacks has an HTTP API at `https://api.thestacks.org/api/v1`.
The [API reference](https://api.thestacks.org/api/v1/docs) lists every endpoint with its parameters and responses.
To work on Raven, the software behind The Stacks, see the [Raven developer guide](https://docs.thestacks.org/raven/developers/) instead.

## Log in

You don't need an account to read published publications.
You do need one to create, edit, or publish them.
To publish from a script, use the [`raven` command-line tool](https://docs.thestacks.org/raven/developers/cli/), which logs in for you.

## API versions

Build new tools on `/api/v1`.
The `.md` and `.json` publication URLs in [](./formats.md) use an older API.
That API's JSON has different field names, like `version_number` instead of `versionNumber`.

:::{listing}
:source: toc
:display: list
:::
