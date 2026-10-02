"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/ui/cn";

import { findSectionByPath, NAV_SECTIONS } from "./navigation";

const primary = NAV_SECTIONS.filter((s) => s.mobilePrimary).slice(0, 4);

/** Mobile (<768px) bottom navigation for primary areas (spec 02 §2). */
export function MobileBottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const activeId = findSectionByPath(usePathname())?.id;

  const itemClass =
    "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] leading-none text-muted-foreground";

  return (
    <nav
      aria-label="Primary (mobile)"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primary.map((section) => {
        const Icon = section.icon;
        const isActive = section.id === activeId;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(itemClass, isActive && "font-medium text-foreground")}
          >
            <Icon aria-hidden className={cn("size-5", isActive && "text-brand")} />
            <span className="max-w-full truncate px-1">{section.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onOpenMore} className={itemClass}>
        <Menu aria-hidden className="size-5" />
        <span>More</span>
      </button>
    </nav>
  );
}
