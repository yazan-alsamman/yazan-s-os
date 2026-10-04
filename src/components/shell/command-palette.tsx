"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, Download, FileText, LogOut, Plus, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

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
import { fetchJson, withQuery } from "@/lib/http/fetch-json";
import { useRecentlyViewed } from "@/lib/ux/hooks";

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

/** Phase 1 pages that are not primary navigation items. */
const EXTRA_DESTINATIONS = [
  { label: "Profile", href: "/career/profile", icon: FileText },
  { label: "Experience", href: "/career/experience", icon: FileText },
  { label: "Education", href: "/career/education", icon: FileText },
  { label: "Technologies", href: "/skills/technologies", icon: FileText },
  { label: "Import data", href: "/settings/import", icon: Upload },
  { label: "Export data", href: "/settings/export", icon: Download },
] as const;

/**
 * Create actions. Each opens the record's list surface with `?new=1`, which the shared ResourceList
 * reads to auto-open its create dialog — so every command performs a real, working action.
 */
const CREATE_ACTIONS = [
  { label: "Create project", href: "/projects?new=1" },
  { label: "Create evidence", href: "/evidence?new=1" },
  { label: "Create opportunity", href: "/opportunities?new=1" },
  { label: "Add skill", href: "/skills?new=1" },
  { label: "Add technology", href: "/skills/technologies?new=1" },
  { label: "Create certification", href: "/certifications?new=1" },
] as const;

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

interface GroupedSearch {
  mode: "grouped";
  data: { type: string; total: number; hits: SearchHit[] }[];
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

/**
 * Command palette. Every enabled command performs a real action. Typing two or more characters
 * runs the user-scoped server search (01 §14) across Phase 1 records.
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
  const recent = useRecentlyViewed();
  const [input, setInput] = useState("");
  const term = useDebounced(input.trim(), 200);
  const search = useQuery({
    queryKey: ["search", term],
    queryFn: () => fetchJson<GroupedSearch>(withQuery("/api/v1/search", { q: term, limit: 5 })),
    enabled: open && term.length >= 2,
  });

  const run = (action: () => void) => {
    onOpenChange(false);
    setInput("");
    action();
  };

  const hits = search.data?.data.flatMap((group) => group.hits) ?? [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setInput("");
        onOpenChange(next);
      }}
      title="Command palette"
      description="Search your records or run a command"
    >
      <CommandInput
        placeholder="Search records or type a command…"
        value={input}
        onValueChange={setInput}
      />
      <CommandList>
        <CommandEmpty>
          {search.isFetching ? "Searching…" : "No matching command or record."}
        </CommandEmpty>

        {term.length >= 2 && hits.length > 0 && (
          <>
            <CommandGroup heading="Records">
              {hits.map((hit) => (
                <CommandItem
                  key={`${hit.type}-${hit.id}`}
                  value={`record-${hit.type}-${hit.id}`}
                  keywords={[hit.title, hit.subtitle ?? "", input]}
                  onSelect={() => run(() => router.push(hit.href as never))}
                >
                  <Search aria-hidden />
                  <span className="truncate">{hit.title}</span>
                  <CommandShortcut>{hit.type}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {term.length < 2 && recent.length > 0 && (
          <>
            <CommandGroup heading="Recently viewed">
              {recent.map((entry) => (
                <CommandItem
                  key={`recent-${entry.type}-${entry.id}`}
                  value={`recent ${entry.title} ${entry.type}`}
                  keywords={[entry.title, entry.type]}
                  onSelect={() => run(() => router.push(entry.href as never))}
                >
                  <Clock aria-hidden />
                  <span className="truncate">{entry.title}</span>
                  <CommandShortcut>{entry.type}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Create">
          {CREATE_ACTIONS.map(({ label, href }) => (
            <CommandItem
              key={href}
              value={label}
              onSelect={() => run(() => router.push(href as never))}
            >
              <Plus aria-hidden />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />

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
          {EXTRA_DESTINATIONS.map(({ label, href, icon: Icon }) => (
            <CommandItem
              key={href}
              value={`Go to ${label}`}
              onSelect={() => run(() => router.push(href))}
            >
              <Icon aria-hidden />
              <span>Go to {label}</span>
            </CommandItem>
          ))}
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
