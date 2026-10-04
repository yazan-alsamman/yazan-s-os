"use client";

import { Bot, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { OwnerScopeProvider } from "@/components/providers/owner-scope";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { CommandPalette, useCommandPaletteShortcut } from "./command-palette";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { findSectionByPath } from "./navigation";
import { Brand, DrawerNav, Sidebar } from "./sidebar";
import { ThemeMenu } from "./theme-menu";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";
import { UserMenu, type ShellUser } from "./user-menu";

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const section = findSectionByPath(pathname);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const togglePalette = useCallback(() => setPaletteOpen((value) => !value), []);
  useCommandPaletteShortcut(togglePalette);

  return (
    <OwnerScopeProvider seed={user.email}>
    <div className="flex min-h-dvh w-full">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-surface-elevated px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>

      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <Menu aria-hidden />
          </Button>
          <div className="lg:hidden">
            <Brand compact />
          </div>

          <p className="min-w-0 truncate text-body font-medium text-muted-foreground" aria-hidden>
            {section?.label}
          </p>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaletteOpen(true)}
              aria-keyshortcuts="Control+K Meta+K"
              className="w-9 justify-center px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
            >
              <Search aria-hidden />
              <span className="hidden sm:inline">Commands…</span>
              <kbd className="ml-auto hidden rounded border bg-surface-sunken px-1.5 font-mono text-caption sm:inline">
                Ctrl K
              </kbd>
              <span className="sr-only sm:hidden">Open command palette</span>
            </Button>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/copilot" aria-label="AI Copilot (not available yet)">
                <Bot aria-hidden />
              </Link>
            </Button>
            <ThemeMenu />
            <UserMenu user={user} />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="w-full max-w-[1600px] flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 md:pb-10 lg:px-8"
        >
          {children}
        </main>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 p-0">
          <SheetHeader className="h-14 justify-center border-b px-4">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription className="sr-only">Primary application sections</SheetDescription>
          </SheetHeader>
          <DrawerNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <MobileBottomNav onOpenMore={() => setDrawerOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
    </OwnerScopeProvider>
  );
}
