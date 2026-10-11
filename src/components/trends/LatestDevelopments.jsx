import { Skeleton } from "@/components/ui/skeleton";
import SectionHeading from "./SectionHeading";
import DevelopmentRow from "./DevelopmentRow";

function RowsSkeleton() {
  return (
    <div className="mt-2 divide-y divide-border/60 border-y border-border/60" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="space-y-2 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Accepted developments from the public, read-only feed. The function returns only rows whose
// parent batch was explicitly authorized, armed and completed successfully, and whose evidence
// quote was verified against the stored record; mocked fixtures, dry runs and unproven rows are
// excluded by the feed itself, so nothing here filters or re-ranks. When the feed returns
// nothing the section is not rendered at all; when the request fails it says so and offers a
// retry, so an unavailable feed can never be mistaken for an empty one.
export default function LatestDevelopments({ items, loading, error, onRetry }) {
  // Nothing eligible and nothing wrong: the section stays out of the page entirely.
  if (!loading && !error && !items.length) return null;

  return (
    <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="latest-developments">
      <SectionHeading
        id="latest-developments"
        title="Latest Developments"
        note={items.length ? "Accepted developments from sources already stored here, newest first" : ""}
      />

      {loading ? (
        <RowsSkeleton />
      ) : error ? (
        <div
          role="status"
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border/60 py-3"
        >
          <p className="text-[13px] text-muted-foreground">Developments temporarily unavailable.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[4px] text-[12px] font-medium text-muted-foreground underline decoration-border underline-offset-2 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
          {items.map((item) => (
            <DevelopmentRow key={item.development_id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}