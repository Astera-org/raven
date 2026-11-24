import { fromHtml } from "hast-util-from-html";
import { INLINE_PARENTS, type MystNode } from "./parse.js";

/**
 * The attributes of HTML elements that name a media file the page loads.
 * `<source>` gives a `<video>` or `<audio>` its file.
 */
export const HTML_MEDIA_ATTRIBUTES: ReadonlyMap<string, readonly string[]> =
  new Map([
    ["img", ["src"]],
    ["video", ["src", "poster"]],
    ["audio", ["src"]],
    ["source", ["src"]],
  ]);

/**
 * The HTML a node belongs to. `mystParse` makes each tag of inline HTML a
 * node of its own, so `<template><img src="a.png"></template>` in a paragraph
 * is three nodes; the first of them stands for its siblings' HTML parsed
 * together, with the Markdown between them as a space, and the others for
 * nothing. A block of HTML is one node.
 */
export function htmlFragment(
  node: MystNode,
  parent: MystNode | undefined
): string {
  if (!parent || !INLINE_PARENTS.has(parent.type)) return node.value ?? "";
  const siblings = parent.children ?? [];
  if (siblings.find(({ type }) => type === "html") !== node) return "";
  return siblings
    .map((sibling) => (sibling.type === "html" ? (sibling.value ?? "") : " "))
    .join("");
}

type HtmlNode = ReturnType<typeof fromHtml>["children"][number];

/**
 * The media files an HTML fragment loads, parsed as a browser would: comments
 * and `<template>` contents load nothing, attributes may be unquoted, and
 * character references are decoded.
 */
export function htmlMediaTargets(html: string): string[] {
  const targets: string[] = [];
  const collect = (node: HtmlNode) => {
    if (node.type !== "element" || node.tagName === "template") return;
    for (const attribute of HTML_MEDIA_ATTRIBUTES.get(node.tagName) ?? []) {
      const value = node.properties[attribute];
      if (typeof value === "string" && value !== "") targets.push(value);
    }
    node.children.forEach(collect);
  };
  fromHtml(html, { fragment: true }).children.forEach(collect);
  return targets;
}
