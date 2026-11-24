import { unwrap } from "#src/api/client.js";
import type { components } from "#src/api/v1.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { createContext } from "#src/context.js";
import { formatFields } from "#src/output.js";

type Organization = components["schemas"]["Organization"];

export const orgsGetCommand: CommandSpec = {
  name: "get",
  group: "orgs",
  authLevel: "optional",
  routes: [{ method: "get", path: "/orgs/{idOrSlug}" }],
  register(parent, runtime) {
    parent
      .command("get")
      .description("Show an organization")
      .argument("<org-slug | org-id>", "The organization's slug or id")
      .addHelpText(
        "after",
        [
          "",
          "Logged-in users also see whether they can edit the organization.",
          "",
          "Examples:",
          "  raven orgs get vanderbilt",
          "  raven orgs get 01KVAQ3RGRZ9R8WGB9GXY2WX5F --json",
        ].join("\n")
      )
      .action(async (idOrSlug, _options, command) => {
        const { output, profile, api, tokenSent } = await createContext(
          command,
          orgsGetCommand.authLevel,
          runtime
        );
        const org = await unwrap(profile.apiUrl, () =>
          api.GET("/orgs/{idOrSlug}", {
            params: { path: { idOrSlug } },
          })
        );

        output.data(org, () => formatOrg(org, tokenSent));
      });
  },
};

function formatOrg(org: Organization, showCanEdit: boolean): string {
  const rows: Array<[string, string]> = [
    ["Name", org.name],
    ["Slug", org.slug],
    ["ID", org.id],
    ["ROR ID", org.rorId ?? "-"],
    ["Unlisted", org.unlisted ? "yes" : "no"],
    ["Avatar", org.avatar ?? "-"],
    ["Created", org.createdAt ?? "-"],
    ["Updated", org.updatedAt ?? "-"],
  ];
  if (showCanEdit) rows.push(["Can edit", org.canEdit ? "yes" : "no"]);
  if (org.profile) rows.push(["Profile", org.profile]);
  return formatFields(rows);
}
