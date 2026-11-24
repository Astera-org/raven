import ts from "typescript";

// Class names as resolved by the checker: `RavenDb` is `MySql2Database & { $client }`
// and a drizzle transaction is `MySqlTransaction`.
const NON_TX_DB_TYPE_NAMES = new Set(["Repositories", "MySql2Database"]);
const TX_DB_TYPE_NAMES = new Set([
  "RepositoriesInTransaction",
  "MySqlTransaction",
]);

function typeNames(type: ts.Type): string[] {
  // `typeof Repositories` shares the class's symbol name but is the constructor, not an instance.
  if (type.getConstructSignatures().length > 0) return [];
  return [type.getSymbol()?.name, type.aliasSymbol?.name].filter(
    (name): name is string => name !== undefined
  );
}

function isNullish(type: ts.Type): boolean {
  return (
    (type.flags &
      (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) !==
    0
  );
}

export function containsDbType(type: ts.Type): boolean {
  if (type.isUnionOrIntersection()) return type.types.some(containsDbType);
  return typeNames(type).some(
    (name) => NON_TX_DB_TYPE_NAMES.has(name) || TX_DB_TYPE_NAMES.has(name)
  );
}

export function isNullable(type: ts.Type): boolean {
  return type.isUnion() && type.types.some(isNullish);
}

/** True only when the value is definitely not bound to a transaction. */
export function isNonTxDbType(type: ts.Type): boolean {
  if (type.isUnion()) {
    const members = type.types.filter((member) => !isNullish(member));
    return members.length > 0 && members.every(isNonTxDbType);
  }
  if (type.isIntersection()) return type.types.some(isNonTxDbType);
  return typeNames(type).some((name) => NON_TX_DB_TYPE_NAMES.has(name));
}
