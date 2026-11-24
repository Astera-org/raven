import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESLint,
  type TSESTree,
} from "@typescript-eslint/utils";

type MessageIds = "preferCreateV1Route";

const FORBIDDEN_SOURCE = "@hono/zod-openapi";
const FORBIDDEN_NAME = "createRoute";
const REPLACEMENT_SOURCE = "#v1/lib/create-v1-route.js";
const REPLACEMENT_NAME = "createV1Route";

const createRule = ESLintUtils.RuleCreator((name) => `internal-rule/${name}`);

function importedName(specifier: TSESTree.ImportSpecifier): string {
  return specifier.imported.type === AST_NODE_TYPES.Identifier
    ? specifier.imported.name
    : specifier.imported.value;
}

function importsReplacement(program: TSESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.source.value === REPLACEMENT_SOURCE &&
      statement.specifiers.some(
        (specifier) =>
          specifier.type === AST_NODE_TYPES.ImportSpecifier &&
          importedName(specifier) === REPLACEMENT_NAME &&
          specifier.local.name === REPLACEMENT_NAME
      )
  );
}

export const preferCreateV1Route = createRule<[], MessageIds>({
  name: "prefer-create-v1-route",
  meta: {
    type: "problem",
    docs: {
      description:
        `Use \`${REPLACEMENT_NAME}\` instead of \`${FORBIDDEN_SOURCE}\`'s ` +
        `\`${FORBIDDEN_NAME}\` so v1 routes document their ` +
        `request-validation 422.`,
    },
    fixable: "code",
    schema: [],
    messages: {
      preferCreateV1Route:
        `Use \`${REPLACEMENT_NAME}\` from \`${REPLACEMENT_SOURCE}\` instead ` +
        `of \`${FORBIDDEN_NAME}\` from \`${FORBIDDEN_SOURCE}\`, so the ` +
        `route documents its request-validation 422.`,
    },
  },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== FORBIDDEN_SOURCE) return;
        if (node.importKind === "type") return;

        const specifier = node.specifiers.find(
          (s): s is TSESTree.ImportSpecifier =>
            s.type === AST_NODE_TYPES.ImportSpecifier &&
            s.importKind !== "type" &&
            importedName(s) === FORBIDDEN_NAME
        );
        if (!specifier) return;

        context.report({
          node: specifier,
          messageId: "preferCreateV1Route",
          fix(fixer) {
            const replacementImport = importsReplacement(sourceCode.ast)
              ? ""
              : `import { ${REPLACEMENT_NAME} } from "${REPLACEMENT_SOURCE}";`;

            const fixes: TSESLint.RuleFix[] =
              node.specifiers.length === 1
                ? [fixer.replaceText(node, replacementImport)]
                : [
                    fixer.removeRange(specifierRemovalRange(specifier)),
                    ...(replacementImport
                      ? [fixer.insertTextAfter(node, `\n${replacementImport}`)]
                      : []),
                  ];

            const [variable] = sourceCode.getDeclaredVariables(specifier);
            for (const reference of variable?.references ?? []) {
              fixes.push(
                fixer.replaceText(reference.identifier, REPLACEMENT_NAME)
              );
            }
            return fixes;
          },
        });
      },
    };

    function specifierRemovalRange(
      specifier: TSESTree.ImportSpecifier
    ): TSESTree.Range {
      const next = sourceCode.getTokenAfter(specifier);
      if (next?.value === ",") {
        const afterComma = sourceCode.getTokenAfter(next, {
          includeComments: true,
        });
        return [specifier.range[0], afterComma?.range[0] ?? next.range[1]];
      }
      const previous = sourceCode.getTokenBefore(specifier);
      return [previous?.range[0] ?? specifier.range[0], specifier.range[1]];
    }
  },
});
