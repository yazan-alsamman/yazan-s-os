"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useSignOut } from "./use-sign-out";

export interface ShellUser {
  name: string;
  email: string;
}

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function UserMenu({ user }: { user: ShellUser }) {
  const { signOut, pending } = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Account menu for ${user.name}`}>
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full border bg-surface-sunken text-caption font-semibold"
          >
            {initials(user.name, user.email)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-caption font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
