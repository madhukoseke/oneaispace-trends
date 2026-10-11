import { relativeTime } from "@/lib/trends";

// States exactly what this dataset is and when it last refreshed - no claim of
// live reporting.
export default function DatasetMeta({ total, run, sourceCount }) {
  const updated = run && run.finished_at ? relativeTime(run.finished_at) : "";

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground tabular-nums">
      <span className="tabular-nums">{total} {total === 1 ? "item" : "items"}</span>
      {sourceCount ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{sourceCount} sources</span>
        </>
      ) : null}
      {updated ? (
        <>
          <span aria-hidden="true">·</span>
          <span>Updated {updated}</span>
        </>
      ) : null}
      <span aria-hidden="true">·</span>
      <span>Catalogue of public sources, refreshed on a schedule</span>
    </p>
  );
}