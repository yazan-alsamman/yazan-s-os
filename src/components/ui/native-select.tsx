import * as React from "react";
import { cn } from "@/lib/ui/cn";

/** Styled native <select>: fully keyboard/screen-reader accessible on every platform. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-base shadow-xs outline-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
