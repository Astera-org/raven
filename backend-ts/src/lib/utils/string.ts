export function emptyToNull(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}
