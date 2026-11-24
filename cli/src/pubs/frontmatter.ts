import { CliError, ExitCode } from "#src/errors.js";
import yaml from "js-yaml";

export type Frontmatter = Record<string, unknown>;

export interface SplitDocument {
  frontmatter: Frontmatter | undefined;
  /** Everything after the frontmatter block, verbatim. */
  body: string;
}

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Splits a MyST document into its YAML frontmatter and the rest. */
export function splitFrontmatter(text: string, file: string): SplitDocument {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatter: undefined, body: text };
  return {
    frontmatter: parseYamlObject(match[1] ?? "", file),
    body: text.slice(match[0].length),
  };
}

export function joinFrontmatter(
  frontmatter: Frontmatter,
  body: string
): string {
  const yamlText = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true });
  return `---\n${yamlText}---\n${body}`;
}

export function parseYamlObject(text: string, file: string): Frontmatter {
  let value: unknown;
  try {
    value = yaml.load(text);
  } catch (error) {
    throw new CliError(
      `invalid YAML in ${file}: ${(error as Error).message}`,
      ExitCode.Validation
    );
  }
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CliError(
      `invalid YAML in ${file}: expected a mapping`,
      ExitCode.Validation
    );
  }
  return value as Frontmatter;
}
