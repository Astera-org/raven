import { getConfig } from "#src/config.js";
import { type Links } from "#v1/lib/route-responses/links.js";

/** A draft's links: `edit` is where to edit it in the web UI. */
export function draftLinks(publicationId: string): Links {
  return [
    {
      rel: "edit",
      href: `${getConfig().BASE_URL_WEB}/publications/${publicationId}/edit`,
    },
  ];
}
