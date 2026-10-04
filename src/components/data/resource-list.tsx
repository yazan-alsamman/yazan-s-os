"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import {
  EntityFormDialog,
  type FieldDescriptor,
  type FieldOption,
} from "@/components/forms/entity-form";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiList, useApiMutation, type QueryParams } from "@/lib/api/hooks";
import { cn } from "@/lib/ui/cn";

import { ConfirmDelete } from "./confirm-delete";
import { SavedViewsMenu } from "./saved-views-menu";
import { ErrorState, ListSkeleton } from "./states";
import { useUrlState } from "./use-url-state";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** URL parameter honoured by the list without its own control (e.g. a Command Center drill-down). */
export interface ExtraParam {
  name: string;
  label: string;
  /** Human-readable value, e.g. "true" → "yes". */
  format?: (value: string) => string;
}

export interface FilterDef {
  name: string;
  label: string;
  options: readonly FieldOption[];
}

export interface ResourceListProps<T extends { id: string }> {
  /** Query/invalidation key, e.g. "projects". */
  resource: string;
  /** API collection path, e.g. "/api/v1/projects". */
  path: string;
  singular: string;
  plural: string;
  columns: readonly Column<T>[];
  /** Accessible name of a row, used for row action labels. */
  rowLabel: (row: T) => string;
  detailHref?: (row: T) => string;
  filters?: readonly FilterDef[];
  /** Drill-down parameters shown as removable chips. */
  extraParams?: readonly ExtraParam[];
  sortOptions: readonly FieldOption[];
  defaultSort: string;
  fields: readonly FieldDescriptor[];
  /** Edit form fields when they differ from the create form (default: fields). */
  editFields?: readonly FieldDescriptor[];
  /** Other resources whose cached views change when this one does. */
  related?: readonly string[];
  empty: { title: string; body: ReactNode };
  searchPlaceholder: string;
  /** false when records are created elsewhere (e.g. milestones inside a project). Default true. */
  canCreate?: boolean;
}

/**
 * Standard Phase 1 list view: URL-driven search/filters/sort/pagination, responsive table
 * (cards below md), complete loading/empty/error states, create/edit dialogs and delete
 * confirmation. Shows only what the API returns — never sample data.
 */
export function ResourceList<T extends { id: string }>(props: ResourceListProps<T>) {
  const { get, set } = useUrlState();
  const searchId = useId();
  const [term, setTerm] = useState(get("q"));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const invalidates = [props.resource, "search", ...(props.related ?? [])];

  // Debounce search input into the URL.
  const urlTerm = get("q");
  useEffect(() => {
    if (term === urlTerm) return;
    const handle = setTimeout(() => set({ q: term.trim() || null }), 300);
    return () => clearTimeout(handle);
  }, [term, urlTerm, set]);

  const params: QueryParams = {
    q: urlTerm || undefined,
    page: get("page") || undefined,
    sort: get("sort") || props.defaultSort,
  };
  for (const filter of props.filters ?? []) params[filter.name] = get(filter.name) || undefined;
  const activeExtras = (props.extraParams ?? []).filter((p) => get(p.name));
  for (const extra of activeExtras) params[extra.name] = get(extra.name);
  const query = useApiList<T>(props.resource, props.path, params);

  // Command-palette "Create …" actions open the list with ?new=1; honour it once, then clear.
  const wantsNew = get("new");
  useEffect(() => {
    if (wantsNew && props.canCreate !== false) {
      // Honour the command-palette ?new=1 deep link once, then strip it from the URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreating(true);
      set({ new: null });
    }
  }, [wantsNew, props.canCreate, set]);

  // Saved views: the managed param keys for this surface and the current snapshot (page excluded).
  const managedKeys = [
    "q",
    "sort",
    ...(props.filters ?? []).map((f) => f.name),
    ...(props.extraParams ?? []).map((p) => p.name),
  ];
  const currentView = new URLSearchParams();
  for (const key of managedKeys) {
    const value = key === "q" ? urlTerm : get(key);
    if (value) currentView.set(key, value);
  }
  const currentQuery = currentView.toString();
  const applyView = (query: string) => {
    const parsed = new URLSearchParams(query);
    const updates: Record<string, string | null> = { page: null };
    for (const key of managedKeys) updates[key] = parsed.get(key) || null;
    setTerm(parsed.get("q") ?? "");
    set(updates);
  };

  const create = useApiMutation<Record<string, unknown>>("POST", props.path, invalidates);
  const update = useApiMutation<Record<string, unknown> & { id: string }>(
    "PATCH",
    (body) => `${props.path}/${body.id}`,
    invalidates,
  );
  const remove = useApiMutation<{ id: string }>(
    "DELETE",
    (body) => `${props.path}/${body.id}`,
    invalidates,
  );

  const filtered =
    Boolean(urlTerm) || (props.filters ?? []).some((f) => get(f.name)) || activeExtras.length > 0;
  const rows = query.data?.data ?? [];
  const page = query.data?.page;

  const rowActions = (row: T) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${props.rowLabel(row)}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditing(row)}>Edit</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setDeleting(row)}
          className="text-danger focus:text-danger"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section aria-label={props.plural} className="rounded-lg border bg-surface">
      <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={searchId} className="text-caption text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={props.searchPlaceholder}
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {props.filters?.map((filter) => (
            <label
              key={filter.name}
              className="flex min-w-36 flex-col gap-1 text-caption text-muted-foreground"
            >
              {filter.label}
              <NativeSelect
                value={get(filter.name)}
                onChange={(e) => set({ [filter.name]: e.target.value || null })}
              >
                <option value="">All</option>
                {filter.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
          <label className="flex min-w-36 flex-col gap-1 text-caption text-muted-foreground">
            Sort
            <NativeSelect
              value={get("sort") || props.defaultSort}
              onChange={(e) => set({ sort: e.target.value })}
            >
              {props.sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <SavedViewsMenu
            surface={props.resource}
            currentQuery={currentQuery}
            onApply={applyView}
            canSave={currentQuery.length > 0}
          />
          {props.canCreate !== false && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New {props.singular}
            </Button>
          )}
        </div>
      </div>

      {activeExtras.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-caption">
          <span className="text-muted-foreground">Also filtered by:</span>
          {activeExtras.map((p) => (
            <Button
              key={p.name}
              variant="outline"
              size="xs"
              onClick={() => set({ [p.name]: null })}
              aria-label={`Remove filter ${p.label}: ${p.format ? p.format(get(p.name)) : get(p.name)}`}
            >
              {p.label}: {p.format ? p.format(get(p.name)) : get(p.name)}
              <X aria-hidden />
            </Button>
          ))}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {page ? `${page.total} ${page.total === 1 ? props.singular : props.plural} found` : ""}
      </p>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 p-6">
          <h2 className="text-h3 font-semibold">
            {filtered ? `No matching ${props.plural}` : props.empty.title}
          </h2>
          <div className="max-w-prose text-muted-foreground">
            {filtered ? "Nothing matches the current search or filters." : props.empty.body}
          </div>
          {filtered ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTerm("");
                set(
                  Object.fromEntries([
                    ["q", null],
                    ...(props.filters ?? []).map((f) => [f.name, null]),
                    ...(props.extraParams ?? []).map((p) => [p.name, null]),
                  ]),
                );
              }}
            >
              Clear search and filters
            </Button>
          ) : props.canCreate !== false ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Add the first {props.singular}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div
            className={cn(
              "relative hidden overflow-x-auto md:block",
              query.isFetching && "opacity-70",
            )}
          >
            <table className="w-full text-left text-body">
              <caption className="sr-only">{props.plural}</caption>
              <thead className="border-b text-caption text-muted-foreground">
                <tr>
                  {props.columns.map((c) => (
                    <th
                      key={c.header}
                      scope="col"
                      className={cn("px-3 py-2 font-medium", c.className)}
                    >
                      {c.header}
                    </th>
                  ))}
                  <th scope="col" className="w-12 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-sunken/60">
                    {props.columns.map((c, index) => (
                      <td key={c.header} className={cn("px-3 py-2 align-top", c.className)}>
                        {index === 0 && props.detailHref ? (
                          <Link
                            href={props.detailHref(row) as never}
                            className="font-medium hover:underline"
                          >
                            {c.cell(row)}
                          </Link>
                        ) : (
                          c.cell(row)
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right">{rowActions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-2 p-3">
                <dl className="grid min-w-0 flex-1 grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
                  {props.columns.map((c, index) => (
                    <div key={c.header} className="contents">
                      <dt className="text-caption text-muted-foreground">{c.header}</dt>
                      <dd className="min-w-0 break-words">
                        {index === 0 && props.detailHref ? (
                          <Link
                            href={props.detailHref(row) as never}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {c.cell(row)}
                          </Link>
                        ) : (
                          c.cell(row)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {rowActions(row)}
              </li>
            ))}
          </ul>
          {page && page.totalPages > 1 && (
            <nav
              aria-label={`${props.plural} pages`}
              className="flex items-center justify-between border-t px-3 py-2"
            >
              <p className="text-caption text-muted-foreground tabular">
                Page {page.page} of {page.totalPages} · {page.total} total
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page.page <= 1}
                  onClick={() => set({ page: String(page.page - 1) })}
                >
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page.page >= page.totalPages}
                  onClick={() => set({ page: String(page.page + 1) })}
                >
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}

      <EntityFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={`New ${props.singular}`}
        fields={props.fields}
        submitLabel={`Create ${props.singular}`}
        onSubmit={(payload) => create.mutateAsync(payload)}
      />
      <EntityFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={`Edit ${props.singular}`}
        fields={props.editFields ?? props.fields}
        initial={editing as Record<string, unknown> | null}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync({ ...payload, id: editing!.id })}
      />
      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${props.singular}?`}
        description={`“${deleting ? props.rowLabel(deleting) : ""}” and its relationships will be permanently deleted. The deletion is recorded in the audit log.`}
        onConfirm={() => remove.mutateAsync({ id: deleting!.id })}
      />
    </section>
  );
}
