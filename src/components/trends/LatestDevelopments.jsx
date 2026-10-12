import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import EditorialHeading from "./EditorialHeading";
import DevelopmentCard from "./DevelopmentCard";
import HowItWorksDialog from "./HowItWorksDialog";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";

function CardsSkeleton() {
  return (
    <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2" aria-hidden="true">
      {[0, 1].map((key) => (
        <div key={key} className="space-y-2.5 rounded-[12px] border border-ed-line bg-ed-surface p-4">
          <Skeleton className="h-3 w-28 bg-ed-line" />
          <Skeleton className="h-5 w-full bg-ed-line" />
          <Skeleton className="h-3.5 w-4/5 bg-ed-line" />
          <Skeleton className="h-3 w-1/3 bg-ed-line" />
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
    <section
      className="mt-2 animate-fade-in opacity-0 [animation-delay:0.7s]"
      aria-labelledby="latest-developments"
    >
      <EditorialHeading
        id="latest-developments"
        title="Latest Developments"
        note="Source-supported updates from across AI."
        action={<HowItWorksDialog />}
      />

      {loading ? (
        <CardsSkeleton />
      ) : error ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[8px] border border-dashed border-ed-line bg-ed-surface px-3.5 py-3"
        >
          <span className="text-[13px] text-ed-muted">Developments temporarily unavailable.</span>
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "rounded-[4px] text-[12px] font-medium text-ed-text underline decoration-ed-line-strong underline-offset-[3px] transition-[text-decoration-color] duration-200 hover:decoration-ed-text",
              FOCUS
            )}
          >
            Try again
          </button>
        </div>
      ) : (
        <ul className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.development_id} className="h-full">
              <DevelopmentCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {/* The note about what these cards are sits with them, below them, rather than above. */}
      {!loading && !error && items.length ? (
        <p className="mt-[18px] text-[12px] text-ed-label">
          Accepted developments from sources already stored here, newest first.
        </p>
      ) : null}
    </section>
  );
}