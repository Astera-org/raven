import { avoidApiV0InV1 } from "./rules/avoid-api-v0-in-api-v1.js";
import { noNonTxDbInTransaction } from "./rules/no-non-tx-db-in-transaction.js";
import { noOptionalDbDependency } from "./rules/no-optional-db-dependency.js";
import { preferApiVersionAlias } from "./rules/prefer-api-version-alias.js";
import { preferCreateV1Route } from "./rules/prefer-create-v1-route.js";
import { preferDbRepository } from "./rules/prefer-db-repository.js";
import { validDocsLink } from "./rules/valid-docs-link.js";

const plugin = {
  meta: {
    name: "@raven/eslint-rules",
  },
  rules: {
    "avoid-api-v0-in-api-v1": avoidApiV0InV1,
    "no-non-tx-db-in-transaction": noNonTxDbInTransaction,
    "no-optional-db-dependency": noOptionalDbDependency,
    "prefer-api-version-alias": preferApiVersionAlias,
    "prefer-create-v1-route": preferCreateV1Route,
    "prefer-db-repository": preferDbRepository,
    "valid-docs-link": validDocsLink,
  },
};

export default plugin;
