import { type Element } from "hast";
import { s } from "hastscript";

export function downloadIcon(size: number): Element {
  return s(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      xmlns: "http://www.w3.org/2000/svg",
    },
    [
      s("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
      s("polyline", { points: "7 10 12 15 17 10" }),
      s("line", { x1: 12, y1: 15, x2: 12, y2: 3 }),
    ]
  );
}
