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

// Developments grouped from records that are already stored: a versioned
// identifier that two or more sources have actually published inside the window.
// Terms such as GPT, agents or research are not developments, so they never
// appear here, and when nothing qualifies the section is not rendered at all
// rather than filled with vocabulary matches.
export default function TrendingToday({ clusters, window: windowKey, loading, trendNames }) {
  if (!loading && !clusters.length) return null;

  return (
    <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="trending-today">
      <SectionHeading
        id="trending-today"
        title="Trending Today"
        note={clusters.length ? `Specific releases recorded by more than one source in the last ${windowKey}` : ""}
      />

      {loading ? (
        <RowsSkeleton />
      ) : (
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
      )}
    </section>
  );
}