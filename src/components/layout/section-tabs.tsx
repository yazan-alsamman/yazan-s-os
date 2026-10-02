"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/ui/cn";

export interface SectionTab {
  href: string;
  label: string;
  /** Match only the exact path (for index tabs). */
  exact?: boolean;
}

/** Secondary navigation inside a primary section (e.g. Career → Profile · Experience · Education). */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly SectionTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-5 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-body text-muted-foreground hover:text-foreground",
                  active ? "border-brand font-medium text-foreground" : "border-transparent",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
