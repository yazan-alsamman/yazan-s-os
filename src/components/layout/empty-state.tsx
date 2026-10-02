import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

/** Explains why a view is empty and what happens next (spec 02 §8 "Empty"). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed bg-surface p-6 sm:p-8",
        className,
      )}
    >
      <span className="grid size-9 place-items-center rounded-md border bg-surface-sunken">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
      </span>
      <h2 className="text-h2 font-semibold">{title}</h2>
      {children && (
        <div className="flex max-w-prose flex-col gap-2 text-body text-muted-foreground">
          {children}
        </div>
      )}
    </section>
  );
}
