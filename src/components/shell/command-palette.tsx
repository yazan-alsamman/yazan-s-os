"use client";

import { LogOut, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

import { NAV_SECTIONS } from "./navigation";
import { THEME_OPTIONS } from "./theme-menu";
import { useSignOut } from "./use-sign-out";

/** Global Cmd/Ctrl+K listener (spec 02 §6). */
export function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}

/**
 * Command palette foundation. Every enabled command performs a real action; commands
 * whose capability does not exist yet are shown disabled with their planned phase.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { signOut } = useSignOut();

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search for a command to run"
    >
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <CommandItem
                key={section.id}
                value={`Go to ${section.label}`}
                onSelect={() => run(() => router.push(section.href))}
              >
                <Icon aria-hidden />
                <span>Go to {section.label}</span>
                {section.availability === "planned" && (
                  <CommandShortcut>not available yet</CommandShortcut>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="Search" disabled>
            <Search aria-hidden />
            <span>Search</span>
            <CommandShortcut>planned — Phase 1</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Preferences">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <CommandItem
              key={value}
              value={`Theme: ${label}`}
              onSelect={() => run(() => setTheme(value))}
            >
              <Icon aria-hidden />
              <span>Theme: {label}</span>
            </CommandItem>
          ))}
          <CommandItem value="Sign out" onSelect={() => run(() => void signOut())}>
            <LogOut aria-hidden />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
