// "unist-util-to-string-with-nodes" ships no types of its own (no bundled
// .d.ts, no @types package), so without this ambient declaration every
// import of it resolves to `any` and TS reports
// "Could not find a declaration file for module ...".
declare module "unist-util-to-string-with-nodes" {
  import type { Node } from "unist";

  interface CharacterNode {
    value: string;
    line: number;
    column: number;
    offset: number;
  }

  export default function toString(tree: Node): {
    text: string;
    nodes: CharacterNode[];
  };
}
