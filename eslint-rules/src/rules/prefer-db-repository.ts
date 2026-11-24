import { ESLintUtils } from "@typescript-eslint/utils";

type MessageIds = "preferRepository" | "preferRepositoriesFacade";

const DB_MODULE_SOURCE_PATTERN = /\/db\/index(\.[cm]?[tj]s)?$/;
const REPOSITORY_MODULE_SOURCE_PATTERN =
  /\/db-repositories\/[^/]+-repository(\.[cm]?[tj]s)?$/;

function isDbModuleSource(source: string): boolean {
  return source === "#src/db/index.js" || DB_MODULE_SOURCE_PATTERN.test(source);
}

function isRepositoryModuleSource(source: string): boolean {
  return REPOSITORY_MODULE_SOURCE_PATTERN.test(source);
}

const createRule = ESLintUtils.RuleCreator((name) => `internal-rule/${name}`);

export const preferDbRepository = createRule<[], MessageIds>({
  name: "prefer-db-repository",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer the Repositories facade over calling getDb() directly or instantiating an individual db-repositories class.",
    },
    schema: [],
    messages: {
      preferRepository:
        "Prefer a repository in 'db-repositories' (e.g. OrgsRepository, UsersRepository) over calling getDb() directly here. Add to or extend an existing repository instead of querying the database ad hoc.",
      preferRepositoriesFacade:
        "Prefer 'new Repositories()' over instantiating '{{name}}' directly. Access it via its getter on the facade instead (e.g. '.orgs', '.users').",
    },
  },
  defaultOptions: [],
  create(context) {
    const getDbLocalNames = new Set<string>();
    const repositoryClassLocalNames = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return;
        const source = node.source.value;

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== "ImportSpecifier" ||
            specifier.imported.type !== "Identifier"
          ) {
            continue;
          }

          if (isDbModuleSource(source) && specifier.imported.name === "getDb") {
            getDbLocalNames.add(specifier.local.name);
          }

          if (
            isRepositoryModuleSource(source) &&
            specifier.imported.name.endsWith("Repository")
          ) {
            repositoryClassLocalNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          getDbLocalNames.has(node.callee.name)
        ) {
          context.report({ node: node.callee, messageId: "preferRepository" });
        }
      },
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          repositoryClassLocalNames.has(node.callee.name)
        ) {
          context.report({
            node: node.callee,
            messageId: "preferRepositoriesFacade",
            data: { name: node.callee.name },
          });
        }
      },
    };
  },
});
