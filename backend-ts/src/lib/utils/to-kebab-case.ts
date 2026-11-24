export function toKebabCase(str: string): string {
  return (
    (str &&
      str
        .match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g)
        ?.map((x) => x.toLowerCase())
        ?.join("-")) ||
    ""
  );
}
