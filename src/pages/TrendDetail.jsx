import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TrendDetailHeader from "@/components/trends/TrendDetailHeader";
import TopicTabs from "@/components/trends/TopicTabs";
import FormatTabs from "@/components/trends/FormatTabs";
import DiscoveryToolbar from "@/components/trends/DiscoveryToolbar";
import DiscoveryGrid from "@/components/trends/DiscoveryGrid";
import { DiscoverySkeleton } from "@/components/trends/DiscoveryStates";
import useDiscovery from "@/hooks/useDiscovery";
import { useTrendDetail } from "@/hooks/useTrends";
import useIngestStatus from "@/hooks/useIngestStatus";

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

// A single trend: breadcrumb, compact identity, its own topics, the shared
// toolbar, then ranked items for the selected topic.
export default function TrendDetail() {
  const { slug } = useParams();
  const { trend, topics, loading: trendLoading, notFound } = useTrendDetail(slug);
  const { state, update, reset, loadMore, facets, items, total, loading, error, hasMore, tagQuery } = useDiscovery({ trendSlug: slug });
  const run = useIngestStatus();

  if (notFound && !trendLoading) return <UnknownTrend />;

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-10">
      {trendLoading || !trend ? (
        <div className="space-y-4">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-muted-foreground sm:text-[30px]">Loading trend...</h1>
          <DiscoverySkeleton />
        </div>
      ) : (
        <>
          <TrendDetailHeader
            trend={trend}
            sourceCount={(facets.sources || []).length}
            run={run}
          />

          <div className="mt-3 space-y-2 border-b border-border/70 pb-3">
            <TopicTabs
              topics={topics}
              value={state.topic}
              total={trend.item_count}
              onChange={(topic) => update({ topic: topic || null })}
            />
            <FormatTabs rows={facets.formats} value={state.format} onChange={(value) => update({ format: value })} />
            <DiscoveryToolbar
              state={state}
              facets={facets}
              total={total}
              onParam={update}
              onReset={reset}
              tagQuery={tagQuery}
            />
          </div>

          <div className="mt-4">
            <DiscoveryGrid
              items={items}
              loading={loading}
              error={error}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onReset={reset}
              emptyHint={`No items in this topic match the current format or source. Try Overview, or clear the filters.`}
            />
          </div>
        </>
      )}
    </div>
  );
}