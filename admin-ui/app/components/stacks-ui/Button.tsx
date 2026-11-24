import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "text-caption-40 inline-flex w-fit items-center justify-center border px-6 font-mono transition-colors disabled:pointer-events-none",
  {
    variants: {
      size: {
        sm: "h-8",
        md: "h-7 md:h-9",
        lg: "h-11",
      },
      pill: {
        true: "rounded-full",
        false: "rounded-sm",
      },
      intent: {
        primary:
          "bg-gray-blue-900 border-gray-blue-900 text-white hover:bg-gray-blue-800 active:bg-gray-blue-800 disabled:opacity-80",
        secondary:
          "border-gray-blue-900 border text-gray-blue-900 disabled:opacity-50 hover:bg-gray-blue-900 hover:text-white",
      },
    },
    defaultVariants: {
      size: "md",
      pill: true,
      intent: "primary",
    },
  }
);

interface ButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  asChild?: boolean;
}

export default function Button(props: ButtonProps) {
  const { children, className, size, pill, intent, asChild, ...rest } = props;
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      type={asChild ? undefined : "button"}
      className={cn(buttonVariants({ size, pill, intent }), className)}
      {...rest}
    >
      {children}
    </Comp>
  );
}
