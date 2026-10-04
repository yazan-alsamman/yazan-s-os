"use client";

import { useGithubLanguages } from "./use-github";

/** GitHub-reported byte-level language composition for a repository (distinct from "primary language"). */
export function GitHubLanguages({ id }: { id: string }) {
  const q = useGithubLanguages(id);
  if (q.isPending || q.isError) return null;
  const langs = q.data;
  if (langs.length === 0) return null;
  const palette = [
    "bg-primary",
    "bg-success",
    "bg-warning",
    "bg-danger",
    "bg-info",
    "bg-muted-foreground",
  ];
  return (
    <section aria-labelledby="repo-langs" className="rounded-lg border bg-surface p-3">
      <h3 id="repo-langs" className="text-h3 font-semibold">
        Languages
      </h3>
      <p className="mt-0.5 text-caption text-muted-foreground">
        GitHub-reported language composition (byte-level), not the single primary language.
      </p>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full"
        role="img"
        aria-label={langs.map((l) => `${l.language} ${l.percent}%`).join(", ")}
      >
        {langs.map((l, i) => (
          <div
            key={l.language}
            className={palette[i % palette.length]}
            style={{ width: `${l.percent}%` }}
            title={`${l.language} ${l.percent}%`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
        {langs.map((l) => (
          <li key={l.language} className="text-muted-foreground tabular">
            {l.language} {l.percent}%
          </li>
        ))}
      </ul>
    </section>
  );
}
