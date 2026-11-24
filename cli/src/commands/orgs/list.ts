import { unwrap, type ApiClient } from "#src/api/client.js";
import type { components } from "#src/api/v1.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { positiveInteger } from "#src/commands/option-parsers.js";
import { createContext } from "#src/context.js";
import { formatTable } from "#src/output.js";
import { Option } from "@commander-js/extra-typings";

type OrgListItem = components["schemas"]["OrganizationListItem"];
type Pagination = components["schemas"]["Pagination"];

/** The API caps `perPage` at 100; `--all` fetches pages of that size. */
const MAX_PER_PAGE = 100;

export const orgsListCommand: CommandSpec = {
  name: "list",
  group: "orgs",
  authLevel: "optional",
  routes: [{ method: "get", path: "/orgs" }],
  register(parent, runtime) {
    parent
      .command("list")
      .description("List organizations, newest first")
      .addOption(
        new Option("--page <number>", "Page to show")
          .argParser(positiveInteger)
          .default(1)
      )
      .addOption(
        new Option("--per-page <number>", "Organizations per page (max 100)")
          .argParser(positiveInteger)
          .default(20)
      )
      .option("--all", "Fetch every page")
      .addHelpText(
        "after",
        [
          "",
          "Site admins see every organization; everyone else sees listed ones.",
          "",
          "Examples:",
          "  raven orgs list",
          "  raven orgs list --page 2 --per-page 50",
          "  raven orgs list --all --json",
        ].join("\n")
      )
      .action(async (options, command) => {
        const { output, profile, api } = await createContext(
          command,
          orgsListCommand.authLevel,
          runtime
        );
        const listPage = (page: number, perPage: number) =>
          fetchPage(api, profile.apiUrl, page, perPage);

        const result = options.all
          ? await fetchAll(listPage)
          : await listPage(options.page, options.perPage);

        output.data(result, () => formatOrgs(result, options.all === true));
      });
  },
};

interface OrgPage {
  items: OrgListItem[];
  pagination: Pagination;
}

async function fetchPage(
  api: ApiClient,
  apiUrl: string,
  page: number,
  perPage: number
): Promise<OrgPage> {
  return unwrap(apiUrl, () =>
    api.GET("/orgs", {
      params: { query: { page, perPage } },
    })
  );
}

async function fetchAll(
  listPage: (page: number, perPage: number) => Promise<OrgPage>
): Promise<OrgPage> {
  const items: OrgListItem[] = [];
  for (let page = 1; ; page++) {
    const result = await listPage(page, MAX_PER_PAGE);
    items.push(...result.items);
    const done =
      result.items.length === 0 || items.length >= result.pagination.total;
    if (done) {
      return {
        items,
        pagination: { total: items.length, page: 1, perPage: items.length },
      };
    }
  }
}

function formatOrgs({ items, pagination }: OrgPage, all: boolean): string {
  if (items.length === 0) return "No organizations";

  const table = formatTable(
    ["SLUG", "NAME", "ROR ID", "UNLISTED"],
    items.map((org) => [
      org.slug,
      org.name,
      org.rorId ?? "-",
      org.unlisted ? "yes" : "",
    ])
  );
  if (all) return `${table}\n\n${items.length} organizations`;

  const { total, page, perPage } = pagination;
  const first = (page - 1) * perPage + 1;
  const last = first + items.length - 1;
  const summary = `Showing ${first}-${last} of ${total}`;
  const next =
    last < total ? `; next page: raven orgs list --page ${page + 1}` : "";
  return `${table}\n\n${summary}${next}`;
}
