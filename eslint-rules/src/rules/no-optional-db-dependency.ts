import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

import { containsDbType, isNullable } from "./db-types.js";

type MessageIds = "optionalDbDependency";

const createRule = ESLintUtils.RuleCreator((name) => `internal-rule/${name}`);

export const noOptionalDbDependency = createRule<[], MessageIds>({
  name: "no-optional-db-dependency",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow optional or defaulted Repositories/RavenDb parameters, which silently fall back to the global pool when called inside a transaction.",
    },
    schema: [],
    messages: {
      optionalDbDependency:
        "'{{name}}' is an optional database dependency. Make it required so callers inside a transaction have to pass their transaction-bound client instead of silently falling back to the global pool.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    const typeOf = (node: TSESTree.Node) => services.getTypeAtLocation(node);

    const annotatedType = (
      node: TSESTree.Node & { typeAnnotation?: TSESTree.TSTypeAnnotation }
    ) => {
      if (!node.typeAnnotation) return undefined;
      return typeOf(node.typeAnnotation.typeAnnotation);
    };

    const report = (node: TSESTree.Node, name: string) => {
      context.report({
        node,
        messageId: "optionalDbDependency",
        data: { name },
      });
    };

    const checkProperties = (
      node: TSESTree.Node,
      type: ts.Type,
      alreadyReported = new Set<string>()
    ) => {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      for (const symbol of checker.getPropertiesOfType(type)) {
        if (alreadyReported.has(symbol.name)) continue;
        const propertyType = checker.getTypeOfSymbolAtLocation(symbol, tsNode);
        const isOptional =
          (symbol.flags & ts.SymbolFlags.Optional) !== 0 ||
          isNullable(propertyType);
        if (isOptional && containsDbType(propertyType))
          report(node, symbol.name);
      }
    };

    const checkObjectPattern = (pattern: TSESTree.ObjectPattern) => {
      const reported = new Set<string>();

      for (const property of pattern.properties) {
        if (
          property.type !== "Property" ||
          property.value.type !== "AssignmentPattern"
        )
          continue;
        if (!containsDbType(typeOf(property.value.right))) continue;
        const name =
          property.key.type === "Identifier" ? property.key.name : "property";
        reported.add(name);
        report(property, name);
      }

      const type = annotatedType(pattern);
      if (type) checkProperties(pattern, type, reported);
    };

    const checkParam = (param: TSESTree.Parameter) => {
      const target =
        param.type === "TSParameterProperty" ? param.parameter : param;

      if (target.type === "AssignmentPattern") {
        if (
          target.left.type === "Identifier" &&
          containsDbType(typeOf(target.right))
        ) {
          report(target, target.left.name);
          return;
        }
        if (target.left.type === "ObjectPattern")
          checkObjectPattern(target.left);
        return;
      }

      if (target.type === "ObjectPattern") {
        checkObjectPattern(target);
        return;
      }

      if (target.type !== "Identifier") return;
      const type = annotatedType(target);
      if (!type) return;
      if (!containsDbType(type)) {
        checkProperties(target, type);
        return;
      }
      if (target.optional || isNullable(type)) report(target, target.name);
    };

    const checkFunction = (node: TSESTree.FunctionLike) => {
      node.params.forEach(checkParam);
    };

    return {
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      TSDeclareFunction: checkFunction,
    };
  },
});
