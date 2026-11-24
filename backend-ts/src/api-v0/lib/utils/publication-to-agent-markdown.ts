import { getConfig } from "#src/config.js";
import { licenseToLink } from "#src/lib/utils/licenses.js";
import { markdownToText } from "#src/lib/utils/markdown.js";
import {
  contributorsToAuthors,
  dateToDashYYYYMMDD,
  publicationUrls,
} from "#v0/lib/utils/publications.js";
import { type PublicationResponse } from "#v0/types/response.js";

/**
 * Quote a string as a safe double-quoted YAML scalar.
 */
function yamlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Serialize a publication to clean Markdown for AI agents: YAML frontmatter with
 * key metadata followed by the title, subtitle, abstract, and the MyST body verbatim.
 *
 * The body, title, subtitle, and abstract are already authored as MyST markdown, so
 * they are emitted as-is (no Google-Docs-specific transforms from `exportToMyst`).
 */
export async function publicationToAgentMarkdown(
  publication: PublicationResponse
): Promise<string> {
  const cfg = getConfig();
  const titleText = await markdownToText(publication.title ?? "");
  const versionNumber = publication.version_number;

  const { basePublicationUrl } = publicationUrls(
    publication,
    versionNumber,
    cfg.BASE_URL_WEB
  );

  const authors = contributorsToAuthors(publication).map((a) => a.full_name);
  const date = dateToDashYYYYMMDD(publication.created_at);
  const licenseLink = licenseToLink(publication.license);
  const resolvedVersion =
    versionNumber != null ? versionNumber : publication.version_number;

  const frontmatter: string[] = ["---"];
  frontmatter.push(`title: ${yamlString(titleText.trim())}`);
  if (authors.length > 0) {
    frontmatter.push("authors:");
    authors.forEach((name) => {
      frontmatter.push(`  - ${yamlString(name)}`);
    });
  }
  if (publication.doi) {
    frontmatter.push(`doi: ${yamlString(publication.doi)}`);
  }
  if (licenseLink) {
    frontmatter.push(`license: ${yamlString(licenseLink)}`);
  }
  if (date) {
    frontmatter.push(`date: ${yamlString(date)}`);
  }
  if (resolvedVersion != null) {
    frontmatter.push(`version: ${resolvedVersion}`);
  }
  frontmatter.push(`canonical_url: ${yamlString(basePublicationUrl)}`);
  frontmatter.push("---");

  const sections: string[] = [frontmatter.join("\n")];
  const titleHeading = (publication.title ?? "").trim();
  if (titleHeading) {
    sections.push(`# ${titleHeading}`);
  }

  const subtitle = publication.subtitle?.trim();
  if (subtitle) {
    sections.push(`_${subtitle}_`);
  }

  const abstract = publication.abstract?.trim();
  if (abstract) {
    sections.push(`## Abstract\n\n${abstract}`);
  }

  const body = publication.body?.trim();
  if (body) {
    sections.push(body);
  }

  return sections.join("\n\n") + "\n";
}
