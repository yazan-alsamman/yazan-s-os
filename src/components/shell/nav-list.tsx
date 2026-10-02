"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/cn";

import { findSectionByPath, type NavSection } from "./navigation";

interface NavListProps {
  sections: readonly NavSection[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Vertical navigation list used by the desktop sidebar and the mobile drawer. */
export function NavList({ sections, collapsed = false, onNavigate }: NavListProps) {
  const pathname = usePathname();
  const activeId = findSectionByPath(pathname)?.id;

  return (
    <ul className="flex flex-col gap-0.5">
      {sections.map((section) => {
        const isActive = section.id === activeId;
        const Icon = section.icon;
        const link = (
          <Link
            href={section.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            aria-label={collapsed ? section.label : undefined}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground",
              isActive && "bg-accent font-medium text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon
              aria-hidden
              className={cn("size-4 shrink-0", isActive ? "text-brand" : "text-muted-foreground")}
            />
            {!collapsed && <span className="truncate">{section.label}</span>}
            {!collapsed && section.availability === "planned" && (
              <span className="ml-auto text-caption text-muted-foreground" aria-hidden>
                soon
              </span>
            )}
            {section.availability === "planned" && (
              <span className="sr-only"> (not available yet)</span>
            )}
          </Link>
        );

        return (
          <li key={section.id}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{section.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}
