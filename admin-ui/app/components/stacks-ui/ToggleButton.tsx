import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}

export default function ToggleButton({
  active,
  onClick,
  children,
  count,
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-body-20 flex items-center rounded-full px-4 py-1.5 transition-colors",
        active
          ? "bg-white font-medium text-carbon-800 shadow-sm"
          : "text-gray-blue-300"
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            "ml-1.5 rounded-full px-1.5 py-0.5 text-caption-20",
            active
              ? "bg-warm-sand-200 text-carbon-800"
              : "bg-gray-300 text-gray-blue-300"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
