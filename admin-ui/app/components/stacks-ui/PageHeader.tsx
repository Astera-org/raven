import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

function PageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-8 flex items-start justify-between gap-4", className)}
    >
      {children}
    </div>
  );
}

function PageHeaderTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <h1 className="font-serif text-headline-40 mb-1 text-foreground">
        {title}
      </h1>
      {subtitle && (
        <div className="text-body-20 text-carbon-400">{subtitle}</div>
      )}
      {children}
    </div>
  );
}

function PageHeaderAction({ children }: { children: ReactNode }) {
  return <div className="shrink-0">{children}</div>;
}

PageHeader.Title = PageHeaderTitle;
PageHeader.Action = PageHeaderAction;

// Declaration merging: the assignments above attach Title/Action to
// PageHeader at runtime, but a function's inferred type has no properties,
// so TS doesn't know they exist. This namespace merges with the function
// declaration to add them to its type — `declare` because they're already
// assigned above, not initialized here.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PageHeader {
  export declare const Title: typeof PageHeaderTitle;
  export declare const Action: typeof PageHeaderAction;
}

export default PageHeader;
