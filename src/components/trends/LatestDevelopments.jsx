import { Skeleton } from "@/components/ui/skeleton";
import SectionHeading from "./SectionHeading";
import DevelopmentCard from "./DevelopmentCard";
import HowItWorksDialog from "./HowItWorksDialog";

function CardsSkeleton() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2" aria-hidden="true">
      {[0, 1].map((key) => (
        <div key={key} className="space-y-2 rounded-[10px] border border-border/60 bg-card p-3.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
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
export default function LatestDevelopments({ items, loading, error, onRetry, hidden = false }) {
  // While the catalogue is narrowed the section stands down: it is the unfiltered view of what
  // is new, and it would otherwise sit above a filtered result set as though it belonged to it.
  if (hidden) return null;
  // Nothing eligible and nothing wrong: the section stays out of the page entirely.
  if (!loading && !error && !items.length) return null;

  return (
    <section className="mt-7 border-t border-border/60 pt-5" aria-labelledby="latest-developments">
      <SectionHeading
        id="latest-developments"
        title="Latest Developments"
        note="Source-supported updates from across AI."
        action={<HowItWorksDialog />}
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
        <ul className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.development_id} className="h-full">
              <DevelopmentCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {/* The note about what these cards are sits with them, below them, rather than above. */}
      {!loading && !error && items.length ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Accepted developments from sources already stored here, newest first.
        </p>
      ) : null}
    </section>
  );
}