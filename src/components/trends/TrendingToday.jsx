import { Skeleton } from "@/components/ui/skeleton";
import SectionHeading from "./SectionHeading";
import TrendClusterRow from "./TrendClusterRow";

function RowsSkeleton() {
  return (
    <div className="mt-2 space-y-3" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-6 w-full" />
      ))}
    </div>
  );
}

// Developments grouped from records that are already stored: a subject that more
// than one source has actually written about inside the window. Until the
// clustering layer exists, this is what the section can honestly show, and it
// says so when there is nothing to show.
export default function TrendingToday({ clusters, window: windowKey, loading, trendNames }) {
  return (
    <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="trending-today">
      <SectionHeading
        id="trending-today"
        title="Trending Today"
        note={
          clusters.length
            ? `Models, tools and terms recorded by more than one source in the last ${windowKey}`
            : ""
        }
      />

      {loading ? (
        <RowsSkeleton />
      ) : clusters.length ? (
        <ul className="mt-1">
          {clusters.map((cluster) => (
            <TrendClusterRow
              key={cluster.key}
              cluster={cluster}
              window={windowKey}
              trendName={(trendNames || {})[cluster.trendSlug] || ""}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-[11px] border border-dashed border-border/70 px-4 py-5 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            No model, tool or term was recorded by two or more sources in the last {windowKey || "72 hours"}, so no
            developments are listed.
          </p>
          <p className="mt-1.5">
            What appears here is grouped from the stored records: a named model, tool or term, or wording the titles
            themselves repeat, has to be mentioned by more than one source. Automated clustering and AI analysis are
            not part of this phase, so no momentum or evidence status is claimed.
          </p>
        </div>
      )}
    </section>
  );
}