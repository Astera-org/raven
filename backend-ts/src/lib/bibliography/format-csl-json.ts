/** An HTML tag citation-js emits for formatting, e.g. `<i>` or `<span …>`. */
const TAG = /<\/?[a-zA-Z][^<>]*>/g;

function formatAuthors(authors: unknown[]): string | null {
  if (!authors || authors.length === 0) return null;
  const parts: string[] = [];
  for (const a of authors as Record<string, string>[]) {
    const family = a["family"] || "";
    const given = a["given"] || "";
    const literal = a["literal"] || a["name"] || "";
    if (literal) {
      parts.push(literal);
      continue;
    }
    const initials = given
      .split(/\s+/)
      .map((part: string) => part[0] ?? "")
      .join("");
    if (family) parts.push(`${family} ${initials}`.trim());
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * A reference's text: authors, year and title, as references fetched from the
 * DOI resolver have always read.
 *
 * Titles lose their formatting: the parsers mark up emphasis and protected
 * case as HTML (`\emph{x}` becomes `<i>x</i>`), which the text is shown
 * without.
 */
export function formatCslJson(data: Record<string, unknown>): string {
  return citedAs(data, names(data, "author"));
}

/**
 * A bibliography entry's text: `formatCslJson`'s authors, year and title,
 * followed by where the work was published (journal, volume, issue and pages;
 * the book a chapter is in; edition, publisher and place). An entry with
 * neither a DOI nor a URL has no link to find the work by, so its text has to
 * carry these details. An entry with editors but no authors is listed by its
 * editors.
 */
export function formatBibliographyEntry(data: Record<string, unknown>): string {
  const authors = names(data, "author");
  const editors = names(data, "editor");
  const listedBy = authors ?? (editors && `${editors} ${edLabel(data)}`);
  const details = publicationDetails(data, authors ? editors : null);
  return [citedAs(data, listedBy), ...details.map(sentence)].join(" ");
}

function names(data: Record<string, unknown>, role: string): string | null {
  return formatAuthors((data[role] as unknown[]) ?? []);
}

function citedAs(data: Record<string, unknown>, by: string | null): string {
  const byStr = by ? `${sentence(by)} ` : "";

  let year = "n.d.";
  const issued = data["issued"] as Record<string, unknown> | undefined;
  if (issued?.["date-parts"]) {
    const parts = (issued["date-parts"] as unknown[][])[0];
    if (parts?.[0]) year = String(parts[0]);
  }

  const title = plainText(data["title"]) || "Untitled";
  return `${byStr}(${year}). ${sentence(title)}`;
}

const IN_CONTAINER_TYPES = new Set([
  "chapter",
  "paper-conference",
  "entry",
  "entry-dictionary",
  "entry-encyclopedia",
]);

const THESIS_GENRES: Record<string, string> = {
  phdthesis: "PhD thesis",
  mastersthesis: "Master's thesis",
};

/** `editors` are named only for a work inside an edited book. */
function publicationDetails(
  data: Record<string, unknown>,
  editors: string | null
): string[] {
  const field = (name: string) => plainText(data[name]);
  const pages = field("page").replace(/(\d)\s*-+\s*(\d)/g, "$1–$2");
  const container = field("container-title");
  const details: string[] = [];

  if (container && IN_CONTAINER_TYPES.has(String(data["type"]))) {
    const by = editors ? `${editors} ${edLabel(data)}, ` : "";
    details.push(`In ${by}${container}${pages ? ` (pp. ${pages})` : ""}`);
  } else if (container) {
    const volume = field("volume");
    const issue = field("issue");
    const numbering = `${volume}${issue ? `(${issue})` : ""}`;
    details.push([container, numbering, pages].filter(Boolean).join(", "));
  }

  const genre = THESIS_GENRES[field("genre")];
  if (genre) details.push(genre);
  const edition = field("edition");
  if (edition) details.push(`${ordinal(edition)} ed`);
  const number = field("number");
  if (number) details.push(`No. ${number}`);

  const publisher = field("publisher");
  const place = field("publisher-place");
  if (publisher) details.push(place ? `${place}: ${publisher}` : publisher);
  return details;
}

function edLabel(data: Record<string, unknown>): string {
  return ((data["editor"] as unknown[]) ?? []).length > 1 ? "(Eds.)" : "(Ed.)";
}

function ordinal(edition: string): string {
  if (!/^\d+$/.test(edition)) return edition;
  const n = Number(edition);
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

function plainText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(TAG, "").replace(/\s+/g, " ").trim();
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}
