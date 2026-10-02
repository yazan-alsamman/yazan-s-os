"use client";

import { useTheme } from "next-themes";

import { THEME_OPTIONS } from "@/components/shell/theme-menu";
import { cn } from "@/lib/ui/cn";
import { useHydrated } from "@/lib/ui/use-hydrated";

export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client; avoid a hydration mismatch.
  const hydrated = useHydrated();
  const current = hydrated ? (theme ?? "system") : undefined;

  return (
    <section aria-labelledby="appearance-heading" className="rounded-lg border bg-surface">
      <h2 id="appearance-heading" className="border-b px-4 py-3 text-h3 font-semibold">
        Appearance
      </h2>
      <fieldset className="p-4">
        <legend className="mb-3 text-muted-foreground">Theme</legend>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border p-3 text-body",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                current === value && "border-brand bg-accent font-medium",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={current === value}
                onChange={() => setTheme(value)}
                className="sr-only"
              />
              <Icon aria-hidden className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
