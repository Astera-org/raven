import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

import { containsDbType, isNonTxDbType } from "./db-types.js";

type MessageIds = "nonTxDbInTransaction";

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

const createRule = ESLintUtils.RuleCreator((name) => `internal-rule/${name}`);

function isFunctionNode(node: TSESTree.Node | undefined): node is FunctionNode {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionExpression"
  );
}

function isWithTxReceiver(node: TSESTree.Node): boolean {
  const parent = node.parent;
  return (
    parent?.type === "MemberExpression" &&
    parent.object === node &&
    parent.property.type === "Identifier" &&
    parent.property.name === "withTx"
  );
}

export const noNonTxDbInTransaction = createRule<[], MessageIds>({
  name: "no-non-tx-db-in-transaction",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow using a Repositories/RavenDb that is not bound to the transaction inside a transaction callback.",
    },
    schema: [],
    messages: {
      nonTxDbInTransaction:
        "'{{text}}' is not bound to the surrounding transaction, so its queries run on a separate connection. Use the callback's transaction client or repositories (e.g. `makeRepositories().withTx(tx)`).",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const transactionCallbacks = new Set<FunctionNode>();
    const reportedNodes = new Set<TSESTree.Node>();
    let transactionDepth = 0;

    const reportIfNonTx = (node: TSESTree.Node) => {
      // A reference escaping nested transaction callbacks shows up in each one's `through`.
      if (reportedNodes.has(node)) return;
      if (isWithTxReceiver(node)) return;
      if (!isNonTxDbType(services.getTypeAtLocation(node))) return;
      reportedNodes.add(node);
      context.report({
        node,
        messageId: "nonTxDbInTransaction",
        data: { text: context.sourceCode.getText(node) },
      });
    };

    const enterFunction = (node: FunctionNode) => {
      if (!transactionCallbacks.has(node)) return;
      transactionDepth++;

      for (const reference of context.sourceCode.getScope(node).through) {
        if (reference.isValueReference) reportIfNonTx(reference.identifier);
      }
    };

    const exitFunction = (node: FunctionNode) => {
      if (transactionCallbacks.has(node)) transactionDepth--;
    };

    return {
      CallExpression(node) {
        if (transactionDepth > 0) reportIfNonTx(node);

        const [callback] = node.arguments;
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "transaction" ||
          !isFunctionNode(callback) ||
          !containsDbType(services.getTypeAtLocation(node.callee.object))
        ) {
          return;
        }
        transactionCallbacks.add(callback);
      },
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
    };
  },
});
