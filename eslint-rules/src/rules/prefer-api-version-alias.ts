import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

type MessageIds = "preferAlias";

const ALIASES: ReadonlyArray<readonly [generic: string, alias: string]> = [
  ["#src/api-v0", "#v0"],
  ["#src/api-v1", "#v1"],
];

function toAliasedSpecifier(value: string): string | null {
  for (const [generic, alias] of ALIASES) {
    if (value === generic || value.startsWith(`${generic}/`)) {
      return alias + value.slice(generic.length);
    }
  }
  return null;
}

const createRule = ESLintUtils.RuleCreator((name) => `internal-rule/${name}`);

export const preferApiVersionAlias = createRule<[], MessageIds>({
  name: "prefer-api-version-alias",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Use the '#v0'/'#v1' path aliases instead of the generic '#src/api-v0' and '#src/api-v1' forms.",
    },
    fixable: "code",
    schema: [],
    messages: {
      preferAlias: "Use '{{suggested}}' instead of '{{found}}'.",
    },
  },
  defaultOptions: [],
  create(context) {
    function checkLiteralSource(source: TSESTree.StringLiteral) {
      const suggested = toAliasedSpecifier(source.value);
      if (!suggested) return;

      context.report({
        node: source,
        messageId: "preferAlias",
        data: { found: source.value, suggested },
        fix(fixer) {
          const quote = source.raw[0];
          return fixer.replaceText(source, `${quote}${suggested}${quote}`);
        },
      });
    }

    return {
      ImportDeclaration(node) {
        checkLiteralSource(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkLiteralSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkLiteralSource(node.source);
      },
      ImportExpression(node) {
        const { source } = node;
        if (
          source.type === AST_NODE_TYPES.Literal &&
          typeof source.value === "string"
        ) {
          checkLiteralSource(source);
        }
      },
      TSImportType(node) {
        checkLiteralSource(node.source);
      },
    };
  },
});
