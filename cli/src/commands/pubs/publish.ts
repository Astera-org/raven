import { AuthClient } from "#src/api/auth-client.js";
import { type ApiClient, unwrap, unwrapResponse } from "#src/api/client.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { createContext } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";
import { formatFields } from "#src/output.js";
import {
  type PublicationRef,
  resolvePublication,
} from "#src/pubs/find-publication.js";
import {
  formatIssues,
  formatValidationErrors,
  type ValidationIssue,
} from "#src/pubs/validation-errors.js";
import { isInteractive, type Runtime } from "#src/runtime.js";

export const pubsPublishCommand: CommandSpec = {
  name: "publish",
  group: "pubs",
  authLevel: "required",
  routes: [
    { method: "get", path: "/publications/p/{slug}" },
    { method: "get", path: "/publications/id/{id}/draft" },
    { method: "patch", path: "/publications/id/{id}/draft" },
    { method: "post", path: "/publications/id/{id}/versions" },
  ],
  register(parent, runtime) {
    parent
      .command("publish")
      .description("Publish a publication's draft as a new version")
      .argument("[path]", "A linked .md file or MyST project directory")
      .option("--slug <slug>", "Publish this publication instead")
      .option(
        "--page <file>",
        "The article to use in a project with several pages"
      )
      .option(
        "--note <text>",
        "What changed in this version; required after the first version"
      )
      .option(
        "--add-me-to-byline",
        `Add yourself to an empty byline, as ${BYLINE_ROLE}, without asking`
      )
      .option(
        "--authors-consented",
        `Confirm without a prompt: "${AUTHORS_CONSENT}"`
      )
      .option("-y, --yes", "Don't ask for confirmation")
      .option(
        "--dry-run",
        "Check that the draft can be published, without publishing it"
      )
      .addHelpText(
        "after",
        [
          "",
          "Publishes the draft on the server, so push your latest changes first.",
          "Publishing makes the version public, registers its DOIs and notifies",
          "followers, so it asks for confirmation; pass --yes when there is no",
          "terminal. It also asks you to confirm that all byline authors have",
          "consented to the release, which --yes doesn't cover; pass",
          "--authors-consented when there is no terminal.",
          "",
          "A publication needs someone in its byline: authors in the document's",
          "frontmatter who are Stacks users are added on push, and when nobody",
          "is, publish offers to add you (--add-me-to-byline).",
          "",
          "Examples:",
          "  raven pubs publish paper.md",
          '  raven pubs publish paper.md --note "Added the 2026 field data"',
          "  raven pubs publish paper.md --authors-consented --yes",
          "  raven pubs publish --slug corvid-cognition --dry-run",
        ].join("\n")
      )
      .action(async (path, options, command) => {
        const { output, profile, api } = await createContext(
          command,
          pubsPublishCommand.authLevel,
          runtime
        );
        const { publication, source } = await resolvePublication(
          api,
          profile.apiUrl,
          { path, slug: options.slug, page: options.page }
        );
        const draft = await readDraft(api, profile.apiUrl, publication);
        let issues = [
          ...draft.validationErrors.filter(
            (issue) => issue.path[0] !== "versionDesc"
          ),
          ...noteIssues(draft, options.note),
        ];

        const sourceLink = source?.link;
        if (
          sourceLink?.id === publication.id &&
          draft.etag !== undefined &&
          draft.etag !== sourceLink.etag
        ) {
          output.warn(
            `the draft of ${publication.slug} was edited on the server since ${source?.linkPath}'s last push; this publishes the server's draft`
          );
        }

        if (options.dryRun) {
          const plan = {
            dryRun: true,
            publicationId: publication.id,
            slug: draft.slug,
            versionNumber: draft.versionNumber,
            title: draft.title,
            note: options.note ?? draft.versionDesc,
            validationErrors: issues,
          };
          output.data(plan, () =>
            [
              `Would publish version ${plan.versionNumber} of ${plan.slug}.`,
              formatFields([
                ["Title", plan.title ?? "-"],
                ["Note", plan.note ?? "-"],
              ]),
              formatValidationErrors(issues),
              ...(issues.some(isBylineIssue) ? [BYLINE_HINT] : []),
            ].join("\n")
          );
          return;
        }

        if (
          issues.length > 0 &&
          issues.every(isBylineIssue) &&
          (await confirmAddToByline(runtime, draft.slug, options))
        ) {
          const token = profile.token;
          if (token === undefined) {
            throw new CliError("not logged in", ExitCode.Auth);
          }
          const session = await new AuthClient(
            profile.apiUrl,
            runtime.authFetch
          ).getSession(token);
          if (session === undefined) {
            throw new CliError("the session has expired", ExitCode.Auth);
          }
          await unwrap(profile.apiUrl, () =>
            api.PATCH("/publications/id/{id}/draft", {
              params: { path: { id: publication.id } },
              body: {
                contributors: withSelfInByline(
                  draft.contributors,
                  session.userId
                ),
              },
            })
          );
          issues = [];
        }

        if (issues.length > 0) {
          throw new CliError(
            [
              `${draft.slug} can't be published yet:`,
              ...formatIssues(issues),
              ...(issues.some(isBylineIssue) ? [BYLINE_HINT] : []),
            ].join("\n"),
            ExitCode.Validation,
            { validationErrors: issues }
          );
        }

        await confirmAuthorsConsented(runtime, draft.slug, options);

        if (options.yes !== true) {
          if (!isInteractive(runtime)) {
            throw new CliError(
              `pass --yes to publish ${draft.slug} without a prompt`,
              ExitCode.Usage
            );
          }
          const confirmed = await runtime.prompter.confirm({
            message: `Publish version ${draft.versionNumber} of ${draft.slug}${draft.title ? ` ("${draft.title}")` : ""}? It becomes public, its DOIs are registered and followers are notified.`,
            initialValue: false,
          });
          if (!confirmed) throw new CliError("cancelled", ExitCode.General);
        }

        const data = await unwrap(profile.apiUrl, () =>
          api.POST("/publications/id/{id}/versions", {
            params: { path: { id: publication.id } },
            body: options.note === undefined ? {} : { note: options.note },
          })
        );

        if (
          sourceLink?.id === data.publicationId &&
          sourceLink.slug !== data.slug
        ) {
          await source?.links.set(profile.apiUrl, source.linkPath, {
            ...sourceLink,
            slug: data.slug,
          });
        }

        output.data(data, () =>
          [
            `Published version ${data.versionNumber} of ${data.slug}.`,
            formatFields([
              ["DOI", data.doi ?? "-"],
              ["Version DOI", data.versionDoi ?? "-"],
            ]),
          ].join("\n")
        );
      });
  },
};

const BYLINE_ROLE = "Writing";
const AUTHORS_CONSENT =
  "I confirm that all byline authors have consented to this release.";
const BYLINE_HINT =
  "Add yourself with --add-me-to-byline, or list yourself in the document's `authors` (with your ORCID iD or email) and push.";

type Contributor = {
  userId: string;
  roles: string[];
  inByline: boolean;
  affiliations: string[];
};

interface DraftSummary {
  slug: string;
  title: string | null;
  versionNumber: number;
  versionDesc: string | null;
  validationErrors: ValidationIssue[];
  etag: string | undefined;
  contributors: Contributor[];
}

async function readDraft(
  api: ApiClient,
  apiUrl: string,
  publication: PublicationRef
): Promise<DraftSummary> {
  const { data, response } = await unwrapResponse(apiUrl, () =>
    api.GET("/publications/id/{id}/draft", {
      params: { path: { id: publication.id } },
      headers: { Accept: "application/json" },
    })
  ).catch((error: unknown) => {
    throw explainNoDraft(error, publication.slug);
  });
  // The route can also answer in MyST or as a MyST AST; this request asks
  // for JSON.
  if (typeof data === "string" || !("publication" in data)) {
    throw new CliError(
      `unexpected non-JSON response for the draft of ${publication.slug}`,
      ExitCode.Server
    );
  }
  const draft = data.publication;
  return {
    slug: draft.slug,
    title: draft.title || null,
    versionNumber: draft.versionNumber,
    versionDesc: draft.versionDesc || null,
    validationErrors: data.validationErrors ?? [],
    etag: response.headers.get("ETag") ?? undefined,
    contributors: (draft.contributors ?? []).map((contributor) => ({
      userId: contributor.userId,
      roles: contributor.roles,
      inByline: contributor.inByline ?? false,
      affiliations: contributor.affiliations.map(
        (affiliation) => affiliation.orgId
      ),
    })),
  };
}

/** The server's issue for a draft nobody is in the byline of. */
function isBylineIssue(issue: ValidationIssue): boolean {
  return issue.path.length === 1 && issue.path[0] === "contributors";
}

/**
 * Whether to add the caller to an empty byline: with `--add-me-to-byline`,
 * or when they agree on a terminal. The byline is public, so it's never
 * filled in silently.
 */
async function confirmAddToByline(
  runtime: Runtime,
  slug: string,
  options: { addMeToByline?: boolean }
): Promise<boolean> {
  if (options.addMeToByline === true) return true;
  if (!isInteractive(runtime)) return false;
  return runtime.prompter.confirm({
    message: `Nobody is in the byline of ${slug}. Add yourself as ${BYLINE_ROLE}?`,
    initialValue: true,
  });
}

/**
 * The caller attests that the byline's authors agreed to the release. It's
 * an attestation, so `--yes` doesn't stand in for it.
 */
async function confirmAuthorsConsented(
  runtime: Runtime,
  slug: string,
  options: { authorsConsented?: boolean }
): Promise<void> {
  if (options.authorsConsented === true) return;
  if (!isInteractive(runtime)) {
    throw new CliError(
      `pass --authors-consented to confirm that all byline authors of ${slug} have consented to this release`,
      ExitCode.Usage
    );
  }
  const confirmed = await runtime.prompter.confirm({
    message: AUTHORS_CONSENT,
    initialValue: false,
  });
  if (!confirmed) throw new CliError("cancelled", ExitCode.General);
}

/** `contributors` with `userId` in the byline, added if they aren't there. */
function withSelfInByline(
  contributors: Contributor[],
  userId: string
): Contributor[] {
  if (contributors.some((contributor) => contributor.userId === userId)) {
    return contributors.map((contributor) =>
      contributor.userId === userId
        ? { ...contributor, inByline: true }
        : contributor
    );
  }
  return [
    ...contributors,
    { userId, roles: [BYLINE_ROLE], inByline: true, affiliations: [] },
  ];
}

/** With no open draft, the latest version is already published. */
function explainNoDraft(error: unknown, slug: string): unknown {
  if (!(error instanceof CliError)) return error;
  const { status, body } = (error.details ?? {}) as {
    status?: number;
    body?: { errors?: { draft?: unknown } };
  };
  if (status !== 404 || body?.errors?.draft === undefined) return error;
  return new CliError(
    `nothing to publish: the latest version of ${slug} is already published; push changes with \`raven pubs push\` to open a new draft`,
    ExitCode.NotFound,
    error.details
  );
}

/**
 * Replaces the server's `versionDesc` issue, which doesn't know that the
 * note is applied before readiness is checked. The server keeps the draft's
 * own description when no note is sent.
 */
function noteIssues(
  draft: DraftSummary,
  note: string | undefined
): ValidationIssue[] {
  if (draft.versionNumber === 1 || note || draft.versionDesc) return [];
  return [
    {
      path: ["note"],
      message: "pass --note to describe what changed in this version",
    },
  ];
}
