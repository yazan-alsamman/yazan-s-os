"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

import { NavList } from "./nav-list";
import { NAV_SECTIONS } from "./navigation";

const mainSections = NAV_SECTIONS.filter((s) => s.placement === "main");
const footerSections = NAV_SECTIONS.filter((s) => s.placement === "footer");

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/command-center"
      className="flex items-center gap-2 rounded-md font-semibold tracking-tight text-foreground"
    >
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-md bg-brand font-mono text-caption font-bold text-brand-foreground"
      >
        P
      </span>
      {!compact && <span className="text-h3">PEOS</span>}
      <span className="sr-only">PEOS — go to Command Center</span>
    </Link>
  );
}

/** Desktop (≥1024px) sidebar: 260px, collapsible to a 64px icon rail (spec 02 §2). */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-surface lg:flex",
        collapsed ? "w-16" : "w-[260px]",
      )}
    >
      <div
        className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}
      >
        <Brand compact={collapsed} />
      </div>
      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col justify-between p-2">
        <div className="min-h-0 overflow-y-auto">
          <NavList sections={mainSections} collapsed={collapsed} />
        </div>
        <div className="flex flex-col gap-1 border-t pt-2">
          <NavList sections={footerSections} collapsed={collapsed} />
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn("justify-start text-muted-foreground", collapsed && "justify-center")}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </nav>
    </aside>
  );
}

/** Drawer navigation for tablet and mobile (<1024px). */
export function DrawerNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-4 overflow-y-auto p-2">
      <NavList sections={mainSections} onNavigate={onNavigate} />
      <div className="border-t pt-2">
        <NavList sections={footerSections} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
