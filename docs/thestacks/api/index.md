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

## Deprecated endpoints

When an endpoint is replaced, the [API reference](https://api.thestacks.org/api/v1/docs) marks it deprecated and names its replacement.
A deprecated endpoint keeps working, but it may get a sunset date, after which it returns `410 Gone`.
Responses from an endpoint with a sunset date carry these headers:

- `Deprecation`: when the endpoint was deprecated, like `@1793577600` ([RFC 9745](https://www.rfc-editor.org/rfc/rfc9745)).
- `Sunset`: when it starts returning `410 Gone`, like `Mon, 03 May 2027 00:00:00 GMT` ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)).
- `Link`: the replacement endpoint (`rel="successor-version"`) or a migration guide (`rel="deprecation"`), if there is one.

Check your tools for these headers, and move to the replacement before the sunset date.

:::{listing}
:source: toc
:display: list
:::
