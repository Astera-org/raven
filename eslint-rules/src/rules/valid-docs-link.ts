import { existsSync } from "node:fs";
import path from "node:path";

import type { MarkdownRuleDefinition } from "@eslint/markdown/types";

type MessageIds = "linkToSourceFile" | "missingTarget";

interface LinkLike {
  url: string;
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function relativeTargetPath(url: string): string | null {
  if (URL_SCHEME.test(url) || url.startsWith("#") || url.startsWith("/")) {
    return null;
  }
  const [target = ""] = url.split(/[?#]/);
  return target === "" ? null : target;
}

/**
 * MyST only rewrites relative links that point at a source file; anything else
 * (e.g. `./guide/`) is emitted verbatim and resolves against the deployed page
 * URL, which breaks once the site is served under a base path.
 */
export const validDocsLink: MarkdownRuleDefinition<{
  RuleOptions: [];
  MessageIds: MessageIds;
}> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require relative links in MyST docs to point at a source file that exists.",
    },
    schema: [],
    messages: {
      linkToSourceFile:
        "Link to the page's source file (e.g. 'page.md' or 'folder/index.md') instead of '{{target}}' so MyST can resolve its URL.",
      missingTarget: "Link target '{{target}}' does not exist.",
    },
  },
  create(context) {
    const dir = path.dirname(context.physicalFilename);

    function check(node: LinkLike) {
      const target = relativeTargetPath(node.url);
      const loc = node.position;
      if (!target || !loc) return;

      if (target.endsWith("/") || path.extname(target) === "") {
        context.report({
          loc,
          messageId: "linkToSourceFile",
          data: { target },
        });
        return;
      }

      if (!existsSync(path.resolve(dir, decodeURIComponent(target)))) {
        context.report({
          loc,
          messageId: "missingTarget",
          data: { target },
        });
      }
    }

    return {
      link: check,
      definition: check,
    };
  },
};
