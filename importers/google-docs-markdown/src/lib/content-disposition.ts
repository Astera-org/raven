interface ContentDisposition {
  type: string;
  parameters: Record<string, string>;
}

/**
 * Minimal, browser-safe parser for the Content-Disposition header.
 * Handles both:
 *   attachment; filename="report.pdf"
 *   attachment; filename*=UTF-8''report%20final.pdf
 *
 *
 * the 'content-disposition' npm package is for node only apparently
 */
export function parse(header: string): ContentDisposition {
  if (!header || typeof header !== "string") {
    // ERROR-SITE(throws): caught by parseFilename.
    throw new TypeError("argument header is required and must be a string");
  }

  const parts = header.split(";").map((p) => p.trim());
  const type = parts.shift()?.toLowerCase() ?? "";

  if (!/^[!#$%&'*+\-.^_`|~0-9a-z]+$/i.test(type)) {
    // ERROR-SITE(throws): caught by parseFilename.
    throw new TypeError("invalid type format");
  }

  const parameters: Record<string, string> = {};

  for (const part of parts) {
    if (!part) continue;

    // RFC 5987 extended notation: filename*=UTF-8''encoded%20name.pdf
    const extendedMatch = part.match(
      /^([!#$%&'*+\-.^_`|~0-9a-z]+)\*\s*=\s*([^']*)'([^']*)'(.+)$/i
    );
    if (extendedMatch) {
      const [, key, , , encodedValue] = extendedMatch;
      try {
        parameters[key!.toLowerCase()] = decodeURIComponent(encodedValue!);
      } catch {
        // ERROR-SITE(swallowed): malformed percent-encoding.
        // fall back to raw value if decoding fails
        parameters[key!.toLowerCase()] = encodedValue!;
      }
      continue;
    }

    // Standard notation: filename="report.pdf"  or  filename=report.pdf
    const standardMatch = part.match(
      /^([!#$%&'*+\-.^_`|~0-9a-z]+)\s*=\s*(.*)$/i
    );
    if (standardMatch) {
      const [, key, rawValue] = standardMatch;
      const lowerKey = key!.toLowerCase();
      // Don't overwrite an already-set extended value (RFC 5987 takes precedence
      // when both filename and filename* are present, since it comes later or
      // should be preferred for non-ASCII support)
      if (parameters[lowerKey] !== undefined) continue;

      let value = rawValue!.trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      }
      parameters[lowerKey] = value;
    }
  }

  return { type, parameters };
}
