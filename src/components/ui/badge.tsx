import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui/cn";

/** Status badge. Meaning is always carried by the text, never by colour alone (02 §4). */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-caption font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-sunken text-foreground",
        info: "border-info/40 bg-info/10 text-foreground",
        success: "border-success/40 bg-success/10 text-foreground",
        warning: "border-warning/50 bg-warning/10 text-foreground",
        danger: "border-danger/40 bg-danger/10 text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
