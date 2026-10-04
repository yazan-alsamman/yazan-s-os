"use client";

import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useSavedViews } from "@/lib/ux/hooks";
import { SAVED_VIEW_NAME_MAX } from "@/lib/ux/saved-views";

/**
 * Saved views for a list surface (Phase 11). A named snapshot of the current filter/sort/search
 * state (the URL query). Owner- and surface-scoped, stored in the browser; applying one rewrites the
 * URL params so views stay shareable. Create/apply/delete; empty state explains the feature.
 */
export function SavedViewsMenu({
  surface,
  currentQuery,
  onApply,
  canSave,
}: {
  surface: string;
  currentQuery: string;
  onApply: (query: string) => void;
  canSave: boolean;
}) {
  const { views, save, remove } = useSavedViews(surface);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const inputId = useId();

  const confirmSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    save(trimmed, currentQuery);
    setName("");
    setSaving(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Saved views">
            <BookmarkPlus aria-hidden />
            Views
            {views.length > 0 && (
              <span className="ml-1 rounded bg-surface-sunken px-1 text-caption tabular">
                {views.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {views.length === 0 ? (
            <p className="px-2 py-1.5 text-caption text-muted-foreground">
              No saved views yet. Filter and sort this list, then save it as a named view.
            </p>
          ) : (
            views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onSelect={() => onApply(view.query)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Check aria-hidden className="size-3.5 opacity-70" />
                  <span className="truncate">{view.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  className="text-muted-foreground hover:text-danger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(view.id);
                  }}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canSave}
            // Let the menu close, then open the dialog on the next frame (Radix focus handoff).
            onSelect={() => setTimeout(() => setSaving(true), 0)}
          >
            <BookmarkPlus aria-hidden />
            {canSave ? "Save current view…" : "Apply a filter to save a view"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Save the current search, filters and sort as a named view. Views are stored in this
              browser for your account.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmSave();
            }}
          >
            <label htmlFor={inputId} className="text-caption text-muted-foreground">
              View name
            </label>
            <Input
              id={inputId}
              autoFocus
              value={name}
              maxLength={SAVED_VIEW_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Active · newest first"
              className="mt-1"
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setSaving(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Save view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
