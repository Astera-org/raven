/**
 * The purpose of this function is to normalize human typed erroneous Crockford Base32
 * strings into the canonical form. Particularly for use with ULIDs.
 *
 * Example: "O1L-2I3" -> "011213"
 *
 * @param input {string} The input Crockford Base32 string to normalize.
 * @returns {string} The normalized Crockford Base32 string.
 */
export function normalizeCrockfordBase32(input: string) {
  return (
    input
      .toUpperCase()
      // Remove all hyphens
      .replace(/-/g, "")
      // Map I and L to 1
      .replace(/[IL]/g, "1")
      // Map O to 0
      .replace(/O/g, "0")
  );
}
