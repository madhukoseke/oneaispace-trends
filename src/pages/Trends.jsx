import { useCallback, useMemo } from "react";
import TrendsHeader from "@/components/trends/TrendsHeader";
import DatasetMeta from "@/components/trends/DatasetMeta";
import TrendStrip from "@/components/trends/TrendStrip";
import FormatTabs from "@/components/trends/FormatTabs";
import DiscoveryToolbar from "@/components/trends/DiscoveryToolbar";
import DiscoveryGrid from "@/components/trends/DiscoveryGrid";
import useDiscovery from "@/hooks/useDiscovery";
import useTrends from "@/hooks/useTrends";
import useIngestStatus from "@/hooks/useIngestStatus";

// Cross-trend discovery surface: heading and search, trend strip, format
// navigation and toolbar, then straight into real results.
export default function Trends() {
  const { state, update, reset, loadMore, facets, items, total, loading, error, hasMore, tagQuery } = useDiscovery({});
  const trends = useTrends();
  const run = useIngestStatus();

  const browsable = useMemo(() => trends.filter((trend) => trend.item_count > 0), [trends]);
  const trendNames = useMemo(
    () => Object.fromEntries(trends.map((trend) => [trend.slug, trend.name])),
    [trends]
  );
  const scopeTotal = useMemo(
    () => (facets.formats || []).reduce((sum, row) => sum + (row.count || 0), 0),
    [facets.formats]
  );

  const handleQuery = useCallback((value) => update({ q: value }, { replace: true }), [update]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-10">
      <TrendsHeader
        title="Trends"
        query={state.q}
        onQueryChange={handleQuery}
        meta={<DatasetMeta total={scopeTotal} run={run} sourceCount={(facets.sources || []).length} />}
      >
        <div className="mt-3 space-y-2 border-b border-border/70 pb-3">
          <TrendStrip trends={browsable} />
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
      </TrendsHeader>

      <div className="mt-4">
        <DiscoveryGrid
          items={items}
          loading={loading}
          error={error}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onReset={reset}
          contextFor={(item) => trendNames[item.trend_slug]}
          emptyHint="Nothing in the catalogue matches these filters yet. Try another format, source or search term."
        />
      </div>
    </div>
  );
}