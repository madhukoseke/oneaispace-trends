import { Skeleton } from "@/components/ui/skeleton";
import SectionHeading from "./SectionHeading";
import DevelopmentCard from "./DevelopmentCard";

function CardsSkeleton() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="space-y-2.5 rounded-[11px] border border-border/70 bg-card p-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-4/5" />
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
    <section className="mt-8 border-t border-border/70 pt-5" aria-labelledby="latest-developments">
      <SectionHeading
        id="latest-developments"
        title="Latest Developments"
        note={items.length ? "Accepted developments from sources already stored here, newest first" : ""}
      />

      {loading ? (
        <CardsSkeleton />
      ) : error ? (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
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
        <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.development_id} className="h-full">
              <DevelopmentCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}