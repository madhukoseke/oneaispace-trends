import { AlertCircle, SearchX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { GRID_COLUMNS } from "@/lib/trends";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";

const BUTTON = cn(
  "h-9 rounded-[7px] border border-ed-line bg-ed-surface px-4 text-[13.5px] text-ed-text transition-[background-color,border-color] duration-200 hover:border-ed-line-strong hover:bg-ed-line active:bg-ed-press",
  FOCUS
);

export function DiscoverySkeleton({ columns = 3 }) {
  return (
    <div className={cn("grid gap-5", GRID_COLUMNS[columns] || GRID_COLUMNS[3])} aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-[12px] border border-ed-line bg-ed-surface">
          <Skeleton className="aspect-video w-full rounded-none bg-ed-line" />
          <div className="space-y-2.5 p-3.5">
            <Skeleton className="h-3 w-24 bg-ed-line" />
            <Skeleton className="h-5 w-full bg-ed-line" />
            <Skeleton className="h-5 w-2/3 bg-ed-line" />
            <Skeleton className="h-3 w-1/3 bg-ed-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscoveryEmpty({ title = "No results match these filters.", hint, onReset, action }) {
  return (
    <div className="rounded-[12px] border border-dashed border-ed-line px-6 py-14 text-center">
      <SearchX className="mx-auto h-5 w-5 text-ed-label" aria-hidden="true" />
      <p className="mt-3 text-[15px] font-medium">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ed-muted">{hint}</p>
      ) : null}
      {action ? (
        action
      ) : onReset ? (
        <button type="button" onClick={onReset} className={cn("mt-5", BUTTON)}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

// Concise failure state: what happened and a way to try again, never the raw
// error or anything internal.
export function DiscoveryError({ onRetry }) {
  return (
    <div
      className="rounded-[12px] border border-ed-line bg-ed-surface px-6 py-12 text-center"
      role="alert"
    >
      <AlertCircle className="mx-auto h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="mt-3 text-[15px] font-medium">The catalogue could not be loaded</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ed-muted">
        Something went wrong while loading this content. Try again.
      </p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={cn("mt-5", BUTTON)}>
          Retry
        </button>
      ) : null}
    </div>
  );
}