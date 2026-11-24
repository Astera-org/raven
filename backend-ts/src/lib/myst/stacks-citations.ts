import {
  canonicalDoiUrl,
  normalizeReferenceUrl,
} from "#src/lib/reference-url.js";
import { type GenericNode, type GenericParent } from "myst-common";
import { walk } from "./walk.js";

/** A bibliography entry a citation key names, as the AST carries it. */
export interface CitedEntry {
  /** The entry's reference URL, or its citation key when it has none. */
  identifier: string;
  /** The entry's formatted text. */
  text: string;
}

const DOI_PREFIX = /^doi:\s*/i;
const SEPARATOR = /^\s*,?\s*$/;

/**
 * The reference URL a `{cite}` label names, or undefined for a bib key.
 * Shared with `parse-bibliography`, so a DOI cited directly and the same DOI
 * carried by a bibliography entry resolve to one identifier.
 */
const doiLabelToUrl = canonicalDoiUrl;

/** The reference URL a link with no text cites, or undefined for other links. */
function blankLinkToUrl(node: GenericNode): string | undefined {
  if (node.children?.length || typeof node.url !== "string") return undefined;
  const url = node.url.trim();
  if (DOI_PREFIX.test(url)) return doiLabelToUrl(url);
  if (!/^https?:\/\//i.test(url)) return undefined;
  return doiLabelToUrl(url) ?? normalizeReferenceUrl(url);
}

function toCite(node: GenericNode, url: string): void {
  for (const key of Object.keys(node)) {
    if (key !== "type") delete node[key];
  }
  Object.assign(node, {
    type: "cite",
    kind: "parenthetical",
    label: url,
    identifier: url,
  });
}

/**
 * Citations that may be grouped. A flagged `cite` is left out: the resolver
 * may still turn it into a cross-reference, which does not belong in a group.
 */
function isCitation(node: GenericNode): boolean {
  return (node.type === "cite" && !node.error) || node.type === "citeGroup";
}

/**
 * Turns runs of citations separated only by whitespace or a comma into one
 * `citeGroup`, so `[](a) [](b)` renders like `{cite}`a,b``.
 */
function groupAdjacentCitations(parent: GenericNode): void {
  const children = parent.children;
  if (isCitation(parent) || !children?.some(isCitation)) return;

  const grouped: GenericNode[] = [];
  let run: GenericNode[] = [];
  let pendingSeparators: GenericNode[] = [];

  const flush = () => {
    if (run.length === 1) grouped.push(run[0]!);
    if (run.length > 1) {
      grouped.push({
        type: "citeGroup",
        kind: "parenthetical",
        children: run.flatMap((c) =>
          c.type === "citeGroup" ? (c.children ?? []) : [c]
        ),
      });
    }
    grouped.push(...pendingSeparators);
    run = [];
    pendingSeparators = [];
  };

  for (const child of children) {
    if (isCitation(child)) {
      if (run.length === 0) grouped.push(...pendingSeparators);
      pendingSeparators = [];
      run.push(child);
    } else if (
      run.length > 0 &&
      child.type === "text" &&
      SEPARATOR.test(child.value ?? "")
    ) {
      pendingSeparators.push(child);
    } else {
      flush();
      grouped.push(child);
    }
  }
  flush();
  parent.children = grouped;
}

/**
 * Raven's citation rules (§ 1c of the `initial-myst-support` skill):
 * `{cite}` with a DOI label, `[](doi:…)`, `[](https://doi.org/…)` and the
 * blank-link convention `[](https://…)` all become `cite` nodes labelled with
 * the reference URL as the `references` table stores it, numbered by first
 * appearance. A label `entries` has, a key of the publication's own
 * bibliography, becomes one too, labelled with the entry's reference URL
 * where it has one, so a work cited both ways is one reference. It carries
 * its `citationText`, which no `references` row holds, and the
 * `citationKey` it was cited by. The remaining labels are flagged with
 * `error` and left for `resolveLinksAndCitationsTransform`, which turns
 * those naming a target into cross-references and warns about the rest.
 *
 * Returns each citation's identifier in citation order, and the bibliography
 * keys among them.
 */
export function stacksCitationsTransform(
  tree: GenericParent,
  entries: ReadonlyMap<string, CitedEntry> = new Map()
): { order: string[]; keys: string[] } {
  walk(tree, (node) => {
    if (node.type === "link") {
      const url = blankLinkToUrl(node);
      if (url) toCite(node, url);
      return;
    }
    if (node.type === "citeGroup") node.kind = "parenthetical";
    if (node.type !== "cite") return;

    const label = String(node.label ?? "");
    const url = doiLabelToUrl(label);
    node.kind = "parenthetical";
    if (url) {
      node.label = url;
      node.identifier = url;
      return;
    }
    const entry = entries.get(label);
    if (!entry) {
      node.error = true;
      return;
    }
    node.label = entry.identifier;
    node.identifier = entry.identifier;
    node.citationKey = label;
    node.citationText = entry.text;
  });

  walk(tree, groupAdjacentCitations);

  // Keys are collected per node, not per identifier: two keys naming the same
  // work share a number, but both are cited.
  const order: string[] = [];
  const keys = new Set<string>();
  walk(tree, (node) => {
    if (node.type !== "cite" || node.error) return;
    const label = String(node.label);
    let index = order.indexOf(label);
    if (index === -1) index = order.push(label) - 1;
    node.enumerator = String(index + 1);
    if (typeof node.citationKey === "string") keys.add(node.citationKey);
  });

  return { order, keys: [...keys] };
}
