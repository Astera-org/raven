import { type Element } from "hast";
import { s } from "hastscript";

export function expandIcon(size: number): Element {
  return s(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "20 20 60 60",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      width: size,
      height: size,
    },
    [
      s("g", [
        s("line", { x1: 52.47, y1: 47.53, x2: 70, y2: 30 }),
        s("polyline", { points: "70 47.53 70 30 52.47 30" }),
      ]),
      s("g", [
        s("line", { x1: 47.53, y1: 52.47, x2: 30, y2: 70 }),
        s("polyline", { points: "30 52.47 30 70 47.53 70" }),
      ]),
    ]
  );
}
