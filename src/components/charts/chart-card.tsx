"use client";

import { Download, Info, Table2 } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { escapeCsvCell } from "@/modules/imports/csv";

export interface ChartTableRow {
  label: string;
  values: (number | string)[];
  href?: string | null;
}

export interface ChartTable {
  caption: string;
  columns: string[];
  rows: ChartTableRow[];
}

/**
 * Every visualisation follows 00 §6: title, one-sentence interpretation, date range, filters,
 * freshness, drill-down, empty state and an accessible alternative. The data table is always
 * rendered (collapsible) and carries the drill-down links for keyboard and screen-reader users;
 * "Download CSV" exports exactly the table (02 §7 export option).
 */
export function ChartCard({
  title,
  interpretation,
  meta,
  onShowDefinition,
  empty,
  table,
  csvName,
  children,
}: {
  title: string;
  interpretation: string | null;
  meta: ReactNode;
  onShowDefinition?: () => void;
  empty?: ReactNode;
  table: ChartTable | null;
  csvName: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);

  function downloadCsv() {
    if (!table) return;
    const lines = [
      ["Category", ...table.columns].map(escapeCsvCell).join(","),
      ...table.rows.map((r) => [r.label, ...r.values].map(escapeCsvCell).join(",")),
    ];
    const url = URL.createObjectURL(
      new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col rounded-lg border bg-surface">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-h3 font-semibold">
            {title}
          </h2>
          {interpretation && <p className="mt-0.5 text-body">{interpretation}</p>}
          <p className="mt-1 text-caption text-muted-foreground">{meta}</p>
        </div>
        {onShowDefinition && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onShowDefinition}
            aria-label={`About the ${title} metric`}
          >
            <Info aria-hidden />
          </Button>
        )}
      </header>
      {empty ?? (
        <div className="flex flex-1 flex-col gap-2 p-4">
          {children}
          {table && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-expanded={showTable}
                aria-controls={`${id}-table`}
                onClick={() => setShowTable((v) => !v)}
              >
                <Table2 aria-hidden />
                {showTable ? "Hide data table" : "Show data table"}
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadCsv}>
                <Download aria-hidden />
                Download CSV
              </Button>
            </div>
          )}
          {table && (
            <div id={`${id}-table`} hidden={!showTable} className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <caption className="sr-only">{table.caption}</caption>
                <thead className="text-caption text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Category
                    </th>
                    {table.columns.map((c) => (
                      <th key={c} scope="col" className="py-1 pr-3 text-right font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {table.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="py-1 pr-3 font-normal">
                        {row.href ? (
                          <Link href={row.href as never} className="underline underline-offset-4">
                            {row.label}
                          </Link>
                        ) : (
                          row.label
                        )}
                      </th>
                      {row.values.map((v, i) => (
                        <td key={i} className="py-1 pr-3 text-right tabular">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
