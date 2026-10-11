import { useCallback, useMemo } from "react";
import TrendsHeader from "@/components/trends/TrendsHeader";
import DatasetMeta from "@/components/trends/DatasetMeta";
import TrendStrip from "@/components/trends/TrendStrip";
import FormatTabs from "@/components/trends/FormatTabs";
import DiscoveryToolbar from "@/components/trends/DiscoveryToolbar";
import DiscoveryGrid from "@/components/trends/DiscoveryGrid";
import SectionHeading from "@/components/trends/SectionHeading";
import FeaturedBriefs from "@/components/trends/FeaturedBriefs";
import TrendingToday from "@/components/trends/TrendingToday";
import useDiscovery from "@/hooks/useDiscovery";
import useTrends from "@/hooks/useTrends";
import useIngestStatus from "@/hooks/useIngestStatus";
import useHomeSections from "@/hooks/useHomeSections";

// Discovery surface in four parts: heading and search, official and research
// briefs, the developments grouped from recent records, then the whole catalogue
// with its own content-type navigation.
export default function Trends() {
  const { state, update, reset, loadMore, facets, items, total, loading, error, hasMore, tagQuery } = useDiscovery({});
  const trends = useTrends();
  const run = useIngestStatus();
  const { briefs, trending, loading: sectionsLoading } = useHomeSections();

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
  const contextFor = useCallback((item) => trendNames[item.trend_slug] || "", [trendNames]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-10">
      <TrendsHeader
        title="Trends"
        query={state.q}
        onQueryChange={handleQuery}
        meta={<DatasetMeta total={scopeTotal} run={run} sourceCount={(facets.sources || []).length} />}
      >
        <div className="mt-3 border-b border-border/70 pb-3">
          <TrendStrip trends={browsable} />
        </div>
      </TrendsHeader>

      <FeaturedBriefs
        items={briefs.items}
        window={briefs.window}
        loading={sectionsLoading}
        contextFor={contextFor}
      />

      <TrendingToday
        clusters={trending.clusters}
        window={trending.window}
        loading={sectionsLoading}
        trendNames={trendNames}
      />

      <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="all-content">
        <SectionHeading id="all-content" title="All Content" />

        <div className="mt-2 space-y-2">
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

        <div className="mt-3">
          <DiscoveryGrid
            items={items}
            loading={loading}
            error={error}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onReset={reset}
            contextFor={contextFor}
            emptyHint="Nothing in the catalogue matches these filters yet. Try another format, source or search term."
          />
        </div>
      </section>
    </div>
  );
}