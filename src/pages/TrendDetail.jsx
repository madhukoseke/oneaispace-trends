import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TrendDetailHeader from "@/components/trends/TrendDetailHeader";
import FormatTabs from "@/components/trends/FormatTabs";
import DiscoveryToolbar from "@/components/trends/DiscoveryToolbar";
import DiscoveryGrid from "@/components/trends/DiscoveryGrid";
import SectionHeading from "@/components/trends/SectionHeading";
import { DiscoverySkeleton } from "@/components/trends/DiscoveryStates";
import useDiscovery from "@/hooks/useDiscovery";
import { useTrendDetail } from "@/hooks/useTrends";
import useIngestStatus from "@/hooks/useIngestStatus";
import useTrendSources from "@/hooks/useTrendSources";
import { hasActiveFilters } from "@/lib/discovery";

function UnknownTrend() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-muted-foreground">
        <Link to="/trends" className="rounded-[4px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          Trends
        </Link>
      </nav>
      <div className="mt-4 rounded-[11px] border border-dashed border-border/70 px-6 py-14 text-center">
        <h1 className="text-[18px] font-medium">That trend is not in the catalogue</h1>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
          The link may be outdated, or the trend has not been populated by an ingestion run yet.
        </p>
        <Button asChild className="mt-5 h-9 rounded-[7px] text-[13.5px]">
          <Link to="/trends">Browse all trends</Link>
        </Button>
      </div>
    </div>
  );
}

// A topic surface: compact identity, then the content itself. Nothing is
// asserted about the topic beyond what the stored records support, so the page
// runs straight from the header into Latest Content.
export default function TrendDetail() {
  const { slug } = useParams();
  const { trend, topics, loading: trendLoading, notFound } = useTrendDetail(slug);
  const { state, update, reset, loadMore, facets, items, total, loading, error, hasMore, tagQuery, reload } =
    useDiscovery({ trendSlug: slug });
  const run = useIngestStatus();
  const sources = useTrendSources(slug);

  if (notFound && !trendLoading) return <UnknownTrend />;

  // Subtopics come from the topic's own taxonomy and are offered only where the
  // records actually fill them, so filtering stays one control, not a second row.
  const subtopics = (topics || []).map((topic) => ({
    value: topic.slug,
    label: topic.name,
    count: topic.item_count,
  }));
  const narrowed = hasActiveFilters(state) || Boolean(state.topic);

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-10">
      {trendLoading || !trend ? (
        <div className="space-y-4">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-muted-foreground sm:text-[27px]">
            Loading topic...
          </h1>
          <DiscoverySkeleton />
        </div>
      ) : (
        <>
          <TrendDetailHeader trend={trend} sourceCount={sources.length} run={run} />

          <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="latest-content">
            <SectionHeading id="latest-content" title="Latest Content" />

            <div className="mt-2 space-y-2">
              <FormatTabs rows={facets.formats} value={state.format} onChange={(value) => update({ format: value })} />
              <DiscoveryToolbar
                state={state}
                facets={facets}
                total={total}
                onParam={update}
                onReset={reset}
                tagQuery={tagQuery}
                subtopics={subtopics}
              />
            </div>

            <div className="mt-3">
              <DiscoveryGrid
                items={items}
                loading={loading}
                error={error}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onReset={reset}
                onRetry={reload}
                emptyTitle={narrowed ? "No results match these filters." : "No content available yet."}
                emptyHint={
                  narrowed
                    ? "Clear the filters to see everything catalogued in this topic."
                    : "Nothing has been catalogued in this topic yet. The catalogue refreshes on a schedule."
                }
                emptyAction={
                  narrowed ? null : (
                    <Button asChild variant="outline" className="mt-5 h-9 rounded-[7px] border-border/70 text-[13.5px]">
                      <Link to="/trends">Back to all Trends</Link>
                    </Button>
                  )
                }
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}