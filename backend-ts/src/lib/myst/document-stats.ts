import { type GenericNode, type GenericParent } from "myst-common";

export interface MdastStats {
  /** Depth 1–2 body headings, as thestacks.org's table of contents lists them. */
  sections: number;
  audio: number;
  images: number;
  videos: number;
  iframes: number;
  tables: number;
}

/** Containers whose headings stay out of the table of contents. */
const NESTED_CONTENT = new Set([
  "admonition",
  "details",
  "tabSet",
  "tabItem",
  "card",
  "grid",
  "aside",
  "container",
]);

const VIDEO = /\.(mp4|webm|mov|ogv|m4v)(\?|#|$)/i;
const AUDIO = /\.(mp3|wav|oga|ogg|m4a|flac)(\?|#|$)/i;

/** Counts what `generateDocumentStats` reports, from a publication's AST. */
export function mdastStats(tree: GenericParent): MdastStats {
  const stats: MdastStats = {
    sections: 0,
    audio: 0,
    images: 0,
    videos: 0,
    iframes: 0,
    tables: 0,
  };

  const visit = (node: GenericNode, inBody: boolean, nested: boolean) => {
    const isBody = inBody || node.data?.part === "body";
    if (
      node.type === "heading" &&
      isBody &&
      !nested &&
      node.depth >= 1 &&
      node.depth <= 2
    ) {
      stats.sections++;
    }
    if (node.type === "image") {
      const url = String(node.url ?? "");
      if (VIDEO.test(url)) stats.videos++;
      else if (AUDIO.test(url)) stats.audio++;
      else stats.images++;
    }
    if (node.type === "iframe") stats.iframes++;
    if (node.type === "table") stats.tables++;

    const nestChildren = nested || NESTED_CONTENT.has(node.type);
    for (const child of node.children ?? []) visit(child, isBody, nestChildren);
  };
  visit(tree, false, false);
  return stats;
}
