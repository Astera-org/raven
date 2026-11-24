import { DOMParser } from "linkedom";
import type { RootContent } from "mdast";
import type { Directives } from "mdast-util-directive";
import type { Node as UnistNode } from "unist";

// DOM spec node-type constants (stable across implementations). Defined
// locally rather than read off linkedom's `Node` import, which types as an
// unusable stub — see the `#region Types > DOM` comment below.
export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

// #region Types > DOM (linkedom)
//
// linkedom's public entry point only exposes stub types for Document/Element/
// Node (see linkedom/types/shared/facades.d.ts) — real enough for instanceof
// checks at runtime, but useless as type annotations (e.g. `Node.TEXT_NODE`
// doesn't type-check). Its richly-typed classes live at subpaths blocked by
// linkedom's package.json "exports" map, so they can't be imported directly
// either. Deriving aliases from an actual parseFromString() call sidesteps
// both problems: TypeScript resolves the real HTMLDocument/Element types via
// the relative imports inside linkedom's own .d.ts files, which aren't
// subject to the exports-map restriction that blocks external subpath
// imports.
// Type-derivation only — never called (hence the leading `_`). Exists
// purely so `RawGDocDocument` can be inferred from a real call, without
// circularly referencing the stricter `GDocDocument` override that the real
// `parseHtmlDocument` (below) returns.
declare function _rawParseHtmlDocument(
  html: string
): ReturnType<DOMParser["parseFromString"]>;
type RawGDocDocument = Extract<
  ReturnType<typeof _rawParseHtmlDocument>,
  { documentElement: unknown }
>;
type RawGDocElement = RawGDocDocument["documentElement"];

// linkedom's own classes leave many members typed as bare `any` — `nodeType`,
// `parentNode`, `textContent`, `tagName`, `className`, `nodeName`,
// `nextSibling`/`nextElementSibling`, the `NodeList` element type behind
// `childNodes`/`children`, and most DOM-mutation method params/returns
// (`appendChild`, `insertBefore`, `removeChild`, `replaceChild`, `cloneNode`,
// `closest`, `getAttribute`/`setAttribute`/etc.). None of that is visible to
// `tsc` — accessing a member on an explicitly `any`-typed value is legal
// TypeScript, so `strict` mode has nothing to flag — but it defeats
// `@typescript-eslint/no-unsafe-*`, which needs real types to reason about.
// `Omit` the loose members off the real class (per member of the union, via
// `DistributiveOmit` below — see its comment for why a bare `&` override
// doesn't work) and redeclare them with the types they actually have at
// runtime.
type LooseElementMembers =
  | "nodeType"
  | "nodeName"
  | "parentNode"
  | "textContent"
  | "firstChild"
  | "nextSibling"
  | "nextElementSibling"
  | "tagName"
  | "className"
  | "childNodes"
  | "children"
  | "getAttribute"
  | "setAttribute"
  | "hasAttribute"
  | "removeAttribute"
  | "appendChild"
  | "insertBefore"
  | "removeChild"
  | "replaceChild"
  | "cloneNode"
  | "querySelector"
  | "querySelectorAll"
  | "closest"
  | "remove"
  | "after";

export type GDocElement = Omit<RawGDocElement, LooseElementMembers> & {
  nodeType: number;
  nodeName: string;
  parentNode: GDocElement | null;
  textContent: string | null;
  firstChild: GDocChildNode | null;
  nextSibling: GDocChildNode | null;
  nextElementSibling: GDocElement | null;
  tagName: string;
  className: string;
  childNodes: GDocChildNode[];
  children: GDocElement[];
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
  appendChild<T extends GDocChildNode>(node: T): T;
  insertBefore<T extends GDocChildNode>(node: T, ref: GDocChildNode | null): T;
  removeChild<T extends GDocChildNode>(node: T): T;
  replaceChild<T extends GDocChildNode>(node: GDocChildNode, oldChild: T): T;
  cloneNode(deep?: boolean): GDocElement;
  querySelector(selector: string): GDocElement | null;
  querySelectorAll(selector: string): GDocElement[];
  closest(selector: string): GDocElement | null;
  remove(): void;
  after(...nodes: GDocChildNode[]): void;
};

// Non-element children (text nodes in practice — the only kind this file
// distinguishes from elements). Shares the same base members as GDocElement
// above, minus the element-only ones.
interface GDocText {
  nodeType: number;
  nodeName: string;
  parentNode: GDocElement | null;
  textContent: string | null;
  nextSibling: GDocChildNode | null;
  remove(): void;
}

export type GDocChildNode = GDocElement | GDocText;

type LooseDocumentMembers =
  | "documentElement"
  | "createElement"
  | "querySelector"
  | "querySelectorAll";

export type GDocDocument = Omit<RawGDocDocument, LooseDocumentMembers> & {
  documentElement: GDocElement;
  // Real linkedom types this with a required 2nd `options` param — replaced
  // entirely here (1 arg is all this file ever needs, and all linkedom's
  // runtime implementation actually requires).
  createElement(tagName: string): GDocElement;
  querySelector(selector: string): GDocElement | null;
  querySelectorAll(selector: string): GDocElement[];
};

/** @internal Visible for testing */
export function parseHtmlDocument(html: string): GDocDocument {
  // The real HTMLDocument is structurally close to GDocDocument but not an
  // exact match (createElement's real arity, querySelector(All)'s real
  // return type) — this is the one place that difference is bridged.
  return new DOMParser().parseFromString(
    html,
    "text/html"
  ) as unknown as GDocDocument;
}

// `& { attributes: MystAttrs }`-style bare intersections don't widen a
// field, they *narrow* it (TS intersects the two declarations together) —
// that's why every override above goes through `Omit` first. Named here
// since `MystDirective` (in the MDAST region below) needs the same fix for
// the same reason.
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

// `instanceof Element` (the linkedom value import) doesn't narrow usefully --
// see above — so narrow structurally on nodeType instead.
export function isGDocElement(node: GDocChildNode): node is GDocElement {
  return node.nodeType === ELEMENT_NODE;
}

// Convenience so callers don't need to branch on whether `root` is the
// document or an element — both now expose a properly-typed
// querySelectorAll via the overrides above.
export function queryAll(
  root: GDocDocument | GDocElement,
  selector: string
): GDocElement[] {
  return Array.from(root.querySelectorAll(selector));
}

// #endregion

// #region Types > vfile
//
// `remarkExtractPublicationMetadata` stringifies each of these directives'
// children (via `childrenToMarkdownString`, which always returns a string)
// and stashes the result on the vfile so `googleDocToMyst` can read it back
// out after the pipeline runs. `version` is therefore a string too — despite
// the pre-existing code here casting it `as number`, nothing ever actually
// converts it, and no caller currently reads this field.
declare module "vfile" {
  interface DataMap {
    abstract?: string;
    subtitle?: string;
    title?: string;
    version?: string;
  }
}

export type GoogleDocImportOptions = {
  /**
   * How a single line break (Shift+Enter in Google Docs) is imported: as a new
   * paragraph, or as a line break within the paragraph. Defaults to
   * `"paragraph"`. Two or more in a row always start a new paragraph.
   */
  singleLineBreaks?: "paragraph" | "line-break";
};

const PUBLICATION_METADATA_KEYS = [
  "abstract",
  "subtitle",
  "title",
  "version",
] as const;
export type PublicationMetadataKey = (typeof PUBLICATION_METADATA_KEYS)[number];

export function isPublicationMetadataKey(
  name: string
): name is PublicationMetadataKey {
  return (PUBLICATION_METADATA_KEYS as readonly string[]).includes(name);
}

// #endregion

// #region Types > MDAST (MyST tree)
//
// `remarkDirective` (via `mdast-util-directive`) registers `containerDirective`
// /`leafDirective`/`textDirective` onto mdast's own `RootContent` union, so
// `Root`/`RootContent` below already include them without extra work.
//
// `mdast-util-directive` types a directive's `.attributes` as
// `Record<string, string | null | undefined>` and `.children` per its exact
// content model (e.g. a `ContainerDirective` only accepts block content).
// This file is looser on both counts: it stores presence-only boolean flags
// directly in `.attributes` (`unnumbered`, `open` — see
// `attrsToParentAndChildAttrs` and `processDetails`), and it freely mixes
// bare phrasing nodes (e.g. a caption's `text` node) into what would
// normally be block-only children. Rather than fight the upstream shape (or
// change the runtime values — the booleans are only ever read for
// truthiness, so switching to `"true"` strings would be behavior-preserving,
// but isn't a change this pass should make unprompted), directive nodes
// here are typed as `MystDirective`/`MystNode`, local widenings of
// `Directives`/`RootContent` rather than the upstream types directly. A
// handful of spots that pass one of these where strict mdast content is
// expected (e.g. `unified`'s processor calls) need a small cast — that's
// the deliberate trade-off of this approach, made explicit at each cast
// site rather than silently.
export type MystAttrs = Record<string, string | boolean | undefined>;
export type MystNode = RootContent | MystDirective;
// `DistributiveOmit` is defined in the DOM types region above (needed there
// first) and reused here for the same reason.
export type MystDirective = DistributiveOmit<
  Directives,
  "attributes" | "children"
> & {
  attributes?: MystAttrs;
  children: MystNode[];
};

// Takes any unist node (not narrower `MystNode`) because it's also used
// inside unfiltered `visit(tree, (node) => ...)` callbacks, where `node`'s
// inferred type includes `Root` itself — which isn't part of `MystNode`
// (a root is a tree, not content).
export function isMystDirective(
  node: UnistNode | undefined
): node is MystDirective {
  return (
    !!node &&
    (node.type === "containerDirective" ||
      node.type === "leafDirective" ||
      node.type === "textDirective")
  );
}

// #endregion
