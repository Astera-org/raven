import { cn } from "~/lib/utils";
import ToggleButton from "./ToggleButton";

export interface Tab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface TabBarProps<T extends string> {
  tabs: readonly Tab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  "aria-label": string;
  className?: string;
}

export default function TabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  "aria-label": ariaLabel,
  className,
}: TabBarProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-full bg-gray-200 p-1", className)}
    >
      {tabs.map(({ value, label, count }) => (
        <ToggleButton
          key={value}
          active={activeTab === value}
          onClick={() => onTabChange(value)}
          count={count}
        >
          {label}
        </ToggleButton>
      ))}
    </div>
  );
}
