# @raven/cli

`raven`, the command-line interface for the Raven backend.

## Install

Each [GitHub release](https://github.com/Astera-org/raven/releases) carries the
CLI in two forms:

- **Standalone executable**, which needs nothing else installed, for macOS
  (Apple silicon and Intel), Linux (x64 and arm64) and Windows (x64). Download
  the archive for your platform, extract it and put `raven` on your `PATH`.
- **npm package**, `raven-cli-<version>.tgz`, for Node.js 24 or newer:
  `npm install --global ./raven-cli-<version>.tgz`.

The Linux executables need glibc, so they don't run on Alpine Linux or other
musl-based systems, including `*-alpine` Docker images. Use the npm package
there: npm installs the musl build of the keychain module.

macOS blocks executables downloaded with a browser until they're notarized,
which these aren't yet. Download with `curl` or `gh release download`, or run
`xattr -d com.apple.quarantine raven`.

## Usage

```sh
pnpm --filter @raven/cli dev version         # run from source
pnpm --filter @raven/cli build && node cli/dist/index.mjs version
```

| Command                                                                                                                                              | Description                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `raven version`                                                                                                                                      | CLI version, plus the server and API version of the profile                     |
| `raven -V`                                                                                                                                           | CLI version only, with no network call                                          |
| `raven profile add <name> [<api-url>]`                                                                                                               | Add a profile for a server, with no user                                        |
| `raven profile list`                                                                                                                                 | List profiles; `*` marks the current one                                        |
| `raven profile use <name>`                                                                                                                           | Make a profile the current one                                                  |
| `raven profile remove <name> [--yes]`                                                                                                                | Remove a profile, ending its session                                            |
| `raven auth login [<api-url>] [--username <name>] [--password-stdin]`                                                                                | Log in in the browser (or with a password), and make the profile current        |
| `raven auth logout`                                                                                                                                  | End the session and delete the token; the profile stays                         |
| `raven auth status`                                                                                                                                  | Show the profile, server and user; exit code 3 if the session has expired       |
| `raven orgs list [--page <n>] [--per-page <n>] [--all]`                                                                                              | List organizations; site admins also see unlisted ones                          |
| `raven orgs get <org-slug \| org-id>`                                                                                                                | Show an organization; logged-in users also see whether they can edit it         |
| `raven pubs create <path> [--slug <slug>] [--org <org>]... [--page <file>] [--dry-run]`                                                              | Create a draft from a MyST file or project and link the file to it              |
| `raven pubs push <path> [--slug <slug>] [--page <file>] [--force] [--dry-run]`                                                                       | Replace the linked draft; refuses if it changed on the server, unless `--force` |
| `raven pubs publish [<path>] [--slug <slug>] [--page <file>] [--note <text>] [--add-me-to-byline] [--authors-consented] [--yes] [--dry-run]`         | Publish the draft as a new version, after a confirmation                        |
| `raven pubs get [<path>] [--slug <slug>] [--page <file>] [--version-number <n>] [--draft [--rebuild]] [--bibliography [<file>]] [--format md\|json]` | Print a published version as Markdown, or the draft as MyST                     |

Global options, accepted by every command:

| Option             | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| `--profile <name>` | Profile to use. Defaults to `RAVEN_PROFILE`, then `current` |
| `--json`           | Print JSON on stdout, and errors as JSON on stderr          |
| `--anonymous`      | Send requests without a token                               |

## Profiles

A profile is a server plus an optional user, stored in `config.toml` in the
config directory (`~/.config/raven`, or `$XDG_CONFIG_HOME/raven`; the OS
default on Windows). Tokens are kept in the OS keychain, or in `credentials.json` (mode
`0600`) when no keychain is available.

```toml
current = "local"

[profiles.local]
apiUrl = "http://localhost:7001"
user = "alice"

[profiles.public]
apiUrl = "https://api.thestacks.org"
```

With no profile, the CLI uses `https://api.thestacks.org` anonymously.

| Variable           | Effect                                                     |
| ------------------ | ---------------------------------------------------------- |
| `RAVEN_PROFILE`    | Profile to use when `--profile` isn't given                |
| `RAVEN_API_URL`    | Server to use; the profile's stored token is then not sent |
| `RAVEN_TOKEN`      | Token to send instead of the stored one                    |
| `RAVEN_CONFIG_DIR` | Config directory to use instead of the OS default          |

## Quickstart: publish a MyST document

1. [Install](#install) the CLI and log in. Logging in to a server creates a
   profile for it, named after its host, and makes it the current one:

   ```sh
   raven auth login https://api.thestacks.org
   ```

2. Write the document. Its frontmatter becomes the publication's fields;
   authors with an ORCID iD or email that matches a Stacks user go in the
   byline. This one cites by DOI and shows an image from the web, so it needs
   no other files; save it as `paper.md`:

   ````md
   ---
   title: How ravens plan ahead
   abstract: Ravens cache food and tools for later use.
   license: CC-BY-4.0
   keywords: [corvids, planning]
   authors:
     - name: Alice Example
       orcid: 0000-0002-1825-0097
   ---

   ## Background

   Scrub jays cache food with the future in mind {cite}`10.1038/35106560`.

   ```{figure} https://upload.wikimedia.org/wikipedia/commons/b/be/Corvus_corax_%28FWS%29.jpg
   :alt: A common raven perched on a rock

   A common raven. Photo: Gary M. Stolz, U.S. Fish and Wildlife Service (public domain).
   ```
   ````

   Local images and BibTeX files work too, at paths relative to the file (see
   [below](#publishing-myst-documents)).

3. Check it, then create the publication. `create` makes a draft, uploads any
   local images and BibTeX files, and links `paper.md` to the publication in
   `.raven/publications.json`:

   ```sh
   raven pubs create paper.md --dry-run
   ```

   Run the command without `--dry-run` to create a draft.

   ```sh
   raven pubs create paper.md
   ```

4. Edit the file and replace the draft with it, as often as you like:

   ```sh
   raven pubs push paper.md
   ```

5. Publish the draft as version 1. It becomes public and gets a DOI, so
   `publish` asks for confirmation:

   ```sh
   raven pubs publish paper.md
   ```

   For later versions, `push` your changes and publish again with a note:
   `raven pubs publish paper.md --note "Added the 2026 field data"`.

For a MyST project (a directory with `myst.yml`), pass the directory instead
of the file, and `--page <file>` if it has several pages. See
[`examples/`](https://github.com/Astera-org/raven/tree/main/cli/examples) for
a single file and a project.

## Publishing MyST documents

`raven pubs create` creates a draft from a MyST `.md` file, or from the one
article of a MyST project (a directory with `myst.yml`; use `--page` if it has
several). The document's frontmatter sets the title, subtitle, abstract,
license (an SPDX ID), keywords, DOI and authors; `numbering` and `math` are
kept with the version. An author is matched to a Stacks user by ORCID iD,
then by email, and matched authors are added to the byline. `raven pubs push` then replaces the
draft with the current file.

Both commands record the link between the file and its publication in
`.raven/publications.json`, next to the file or in the project root, per
server. It also stores the draft's ETag, which `push` uses to refuse
overwriting edits made on the server since the file's last push (exit code 8;
`--force` overwrites them).

Whether to commit `.raven/` is up to you:

- **Commit it** to share the link, so collaborators push to the same
  publication. The stored ETag is then shared too: after someone else pushes,
  your next push is refused until you merge their changes or use `--force`.
- **Ignore it** (add `.raven/` to `.gitignore`) to keep links per checkout.
  Others can still push to the publication with `--slug` (and `--force` the
  first time, since their checkout has no stored ETag).

The document's BibTeX files are sent with it, so `` {cite}`smith2020` ``,
`@smith2020` and `[@smith2020; @jones2019]` resolve against the
publication's own bibliography. They are the files `myst.yml`'s
`bibliography` names, or every `.bib` file in the project when it names
none, plus the files the page's frontmatter names; each is sent once,
under its path from the directory holding `.raven/`. A URL in that list is
refused: download the file and name the local copy, since the server never
fetches one. `push` always sends what's on disk, so removing a file from
the list removes it from the draft, and an entry nothing cites is never
published. A file that doesn't parse, and a key defined twice, are
reported as warnings; the files are stored either way.

Local images, in Markdown and HTML images and the `{image}` and `{figure}`
directives, are uploaded to the draft first, and their paths are replaced
with the uploaded URLs in what's sent; the file itself isn't changed. Paths
are relative to the page, and name the file exactly: a `?query` or
`#fragment` isn't supported on a local path (`plot.svg#panel` looks for a
file called `plot.svg#panel`). A missing file, or a local `{include}` or
`{literalinclude}`, stops the command before anything is sent (exit code 5).
If an upload fails, the draft isn't changed; with `create`, the publication
is still created and linked, so run `raven pubs push` to finish.
`--dry-run` lists the files it would upload.

Raven doesn't run `myst build`, so some MyST features aren't supported yet
(see
[MyST publications](../docs/raven/developers/myst-publications.md)).

`raven pubs publish` publishes the draft on the server as a new version, so
push your changes first. It makes the version public, registers its DOIs and
notifies followers, so it asks for confirmation (`--yes` skips it, and is
required without a terminal). It also asks you to confirm that all byline
authors have consented to the release; `--yes` doesn't cover that, so pass
`--authors-consented` without a terminal. Every version after the first needs `--note`,
unless the draft already has a version description. A publication needs
someone in its byline: when nobody is, `publish` offers to add you as
Writing (`--add-me-to-byline` does so without asking). `--dry-run` reports
whether the draft can be published.

`raven pubs get` prints the latest published version, or the one
`--version-number` names, as Markdown meant for reading. An editor of a
publication that was never published gets its draft instead, with a
warning. `--draft` prints the
MyST source last pushed instead. If the draft was edited on the server since
then (in the web editor, say), that source no longer describes it, and
`--draft --rebuild` prints the draft rendered as MyST. Both forms record the
draft's ETag for the linked file, so after merging the output into your file,
`push` replaces the draft without a conflict. That ETag covers the draft's
bibliography too, which isn't printed, so `get` names the BibTeX files that
differ from the local ones: get them with `--bibliography` (below) and merge
them as well, or the push replaces them. Write the output to a separate
file (`raven pubs get paper.md --draft --rebuild > server.md`), not over the
file you are merging into.

`raven pubs get --draft --bibliography` lists the BibTeX files stored with
the draft, one per line; with a filename it prints that file, to redirect
into a local copy (`raven pubs get paper.md --draft --bibliography refs.bib > refs.bib`). The document is never printed with it. It needs `--draft`:
a published version exposes only the entries its document cites, parsed,
as `bibliography` in its JSON.

Both `publish` and `get` take a linked file (with `--page` for a project
with several pages), or `--slug` for any publication.

## Exit codes

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| 0    | Success                                                 |
| 1    | Other error                                             |
| 2    | Usage error (unknown command, bad option, etc.)         |
| 3    | Authentication or permission error (401, 403)           |
| 4    | Not found (404)                                         |
| 5    | Validation error (400, 422)                             |
| 6    | Network error (server unreachable, timeout)             |
| 7    | Server error (5xx)                                      |
| 8    | Conflict (409, 412), e.g. a draft changed on the server |

## Development

| Script                  | Description                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev <args>`       | Run the CLI from source with tsx                                                                                         |
| `pnpm build`            | Bundle to `dist/index.mjs` with tsdown                                                                                   |
| `pnpm test`             | Unit tests (vitest)                                                                                                      |
| `pnpm generate:api [x]` | Regenerate `src/api/openapi.json` and `src/api/v1.d.ts` from a server URL or spec file (default `http://localhost:7001`) |

Commit the regenerated files whenever the v1 API changes. Each command in
`src/commands/` declares its auth level (`none`, `optional`, `required`) and the
v1 routes it calls; `auth-levels.test.ts` checks the levels against the spec.

### Releasing

`scripts/release.sh`, run from the repository root, releases the whole monorepo
as one version: it tags `main` and attaches the npm package and the executables
to a draft GitHub release. `scripts/release.sh create <version> --dry-run` runs
every check and build without tagging, and `scripts/release.sh build` only
builds and smoke-tests the working tree. See `scripts/release.sh --help`.
