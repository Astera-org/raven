import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

const dataTableHeaderVariants = cva(
  "text-caption-20 px-4 py-3 font-normal uppercase tracking-widest text-carbon-400",
  {
    variants: {
      align: {
        left: "text-left",
        center: "text-center",
      },
    },
    defaultVariants: {
      align: "left",
    },
  }
);

// `th` has a deprecated HTML `align` attribute, replaced here by the variant.
export type DataTableHeaderProps = Omit<ComponentProps<"th">, "align"> &
  VariantProps<typeof dataTableHeaderVariants>;

export default function DataTableHeader({
  align,
  className,
  ...props
}: DataTableHeaderProps) {
  return (
    <th
      scope="col"
      {...props}
      className={cn(dataTableHeaderVariants({ align }), className)}
    />
  );
}
