import { type SVGProps } from "react";
import TheStacksMark from "./TheStacksMark";

export default function TheStacksAdminLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 32" fill="none" aria-hidden="true" {...props}>
      {/* Nested svg positions and scales the mark to match the text block height (y:2–30) */}
      <TheStacksMark x={0} y={2} width={26} height={28} />
      <text
        x="36"
        y="13"
        fontFamily="DM Mono, monospace"
        fontSize="11"
        fontWeight="600"
        letterSpacing="2"
        fill="currentColor"
      >
        THE STACKS
      </text>
      <text
        x="36"
        y="30"
        fontFamily="DM Mono, monospace"
        fontSize="9"
        fontWeight="400"
        letterSpacing="2"
        fill="var(--color-carbon-300)"
      >
        ADMIN CONSOLE
      </text>
    </svg>
  );
}
