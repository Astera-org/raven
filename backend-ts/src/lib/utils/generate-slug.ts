import { emptyToNull } from "./string.js";
import { toKebabCase } from "./to-kebab-case.js";

export function generateSlug(title: string, pubUlid: string): string | null {
  const titleSlug = (title ? toKebabCase(title) : "").slice(0, 224);
  const generatedSlug = (titleSlug ? `${titleSlug}-` : "") + pubUlid;
  // Pub ID shouldn't be empty, but just in case, return null
  return emptyToNull(generatedSlug.toLowerCase());
}
