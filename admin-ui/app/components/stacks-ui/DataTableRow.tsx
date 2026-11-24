import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

export default function DataTableRow({
  className,
  ...props
}: ComponentProps<"tr">) {
  return (
    <tr
      {...props}
      className={cn(
        "h-20 align-top border-b border-carbon-100 transition-colors last:border-0 hover:bg-warm-sand-100",
        className
      )}
    />
  );
}
