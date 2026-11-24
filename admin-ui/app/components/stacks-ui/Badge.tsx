import { cn } from "~/lib/utils";

type BadgeVariant =
  | "success"
  | "info"
  | "neutral"
  | "primary"
  | "warning"
  | "error";

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-mint-green-300 text-mint-green-dark",
  info: "bg-gray-blue-100 text-gray-blue-700",
  neutral: "bg-carbon-100 text-carbon-400",
  primary: "bg-sky-blue-100 text-sky-blue-900",
  warning: "bg-butter-yellow-300 text-butter-yellow-900",
  error: "bg-error-700 text-error-900",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({
  variant = "neutral",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "text-caption-20 font-mono inline-flex items-center text-center rounded-full px-2.5 py-0.5 whitespace-nowrap",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
