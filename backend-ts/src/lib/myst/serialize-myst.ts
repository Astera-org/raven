import { type MystFrontmatter } from "@raven/core-import-format";
import yaml from "js-yaml";
/** What `serializeMyst` writes; `license` is an SPDX ID. */
export interface MystDocumentFields {
  title: string | undefined;
  subtitle: string | undefined;
  abstract: string | undefined;
  license: string | undefined;
  keywords: string[];
  doi: string | undefined;
  /** The version's stored `numbering` and `math`. */
  frontmatter?: MystFrontmatter | null;
  body: string;
}

/**
 * Builds a MyST document that `importMystmd` reads back as the same fields:
 * the fields as YAML frontmatter, then the body verbatim.
 *
 * Not an exact inverse in three cases: an abstract loses surrounding
 * whitespace, without a title a body starting with an H1 loses it to the
 * title, and a body starting with an H1 that repeats the title loses it.
 * `numbering` is written in the expanded form it was stored in, which reads
 * back the same. Authors aren't written: contributors are managed on The
 * Stacks.
 */
export function serializeMyst(fields: MystDocumentFields): string {
  const yamlFields = Object.fromEntries(
    Object.entries({
      title: fields.title,
      subtitle: fields.subtitle,
      abstract: fields.abstract,
      license: fields.license,
      keywords: fields.keywords.length > 0 ? fields.keywords : undefined,
      doi: fields.doi,
      numbering: fields.frontmatter?.numbering,
      math: fields.frontmatter?.math,
    }).filter(([, value]) => value !== undefined && value !== "")
  );
  const body = fields.body.endsWith("\n") ? fields.body : `${fields.body}\n`;
  if (Object.keys(yamlFields).length === 0) return body;

  const yamlText = yaml.dump(yamlFields, { lineWidth: -1, noRefs: true });
  return `---\n${yamlText}---\n\n${body}`;
}
