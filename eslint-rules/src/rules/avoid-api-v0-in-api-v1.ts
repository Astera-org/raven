import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

type MessageIds = "avoidApiV0";

const createRule = ESLintUtils.RuleCreator((name) => `internal-rule/${name}`);

export const avoidApiV0InV1 = createRule<[], MessageIds>({
  name: "avoid-api-v0-in-api-v1",
  meta: {
    type: "suggestion",
    docs: {
      description: "You should avoid using api-v0 within api-v1",
    },
    schema: [],
    messages: {
      avoidApiV0: "You should avoid using api-v0 within api-v1",
    },
  },
  defaultOptions: [],
  create(context) {
    function checkLiteralSource(source: TSESTree.StringLiteral) {
      if (
        source.value.startsWith("#v0/") ||
        source.value.startsWith("#src/api-v0/")
      ) {
        context.report({
          node: source,
          messageId: "avoidApiV0",
          data: { found: source.value },
        });
      }
      return null;
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
