import { useCallback, useMemo } from "react";
import DiscoverHero from "@/components/trends/DiscoverHero";
import CategoryNav from "@/components/trends/CategoryNav";
import FormatTabs from "@/components/trends/FormatTabs";
import ExploreToolbar from "@/components/trends/ExploreToolbar";
import DiscoveryGrid from "@/components/trends/DiscoveryGrid";
import SectionHeading from "@/components/trends/SectionHeading";
import LatestDevelopments from "@/components/trends/LatestDevelopments";
import useDiscovery from "@/hooks/useDiscovery";
import useTrends from "@/hooks/useTrends";
import useTopicOptions from "@/hooks/useTopicOptions";
import useLatestDevelopments from "@/hooks/useLatestDevelopments";
import { categorySlugs, moreTrends } from "@/lib/categories";

const DESCRIPTION =
  "A catalogue of AI developments, gathered from their original sources and kept honest: every item links to the page it came from, and nothing here is verified beyond its source.";

// The discovery surface, in one column: identity and search, the compact category row, the
// developments the public feed has proven, then the whole catalogue under Explore AI. The
// category row narrows the catalogue to existing trend identifiers and is the only
// navigation this page needs.
export default function Trends() {
  const { state, update, loadMore, reload, facets, items, total, loading, error, hasMore, tagQuery } =
    useDiscovery({});
  const trends = useTrends();
  const developments = useLatestDevelopments();

  const more = useMemo(() => moreTrends(trends), [trends]);
  const trendNames = useMemo(
    () => Object.fromEntries(trends.map((trend) => [trend.slug, trend.name])),
    [trends]
  );

  const slugKey = useMemo(() => categorySlugs(state.category).join(","), [state.category]);
  const slugs = useMemo(() => (slugKey ? slugKey.split(",") : []), [slugKey]);
  const topics = useTopicOptions(slugs, Boolean(slugKey));
  // Two trends can each carry a topic of the same name, so the label says which one it is.
  const topicOptions = useMemo(
    () => topics.map((topic) => ({
      value: topic.value,
      label: slugs.length > 1 && trendNames[topic.trend_slug]
        ? `${trendNames[topic.trend_slug]} · ${topic.label}`
        : topic.label,
    })),
    [topics, slugs.length, trendNames]
  );

  const handleQuery = useCallback((value) => update({ q: value }, { replace: true }), [update]);
  // Choosing a category drops the topic with it: a topic belongs to the trends being left.
  const handleCategory = useCallback((value) => update({ category: value, topic: "" }), [update]);
  // Clearing filters leaves the category and the sort alone: they are choices, not filters.
  const clearFilters = useCallback(
    () => update({ q: "", format: null, source: null, tags: [], topic: "" }),
    [update]
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 lg:px-10">
      <DiscoverHero
        title="Trends"
        description={DESCRIPTION}
        query={state.q}
        onQueryChange={handleQuery}
      />

      <div className="mt-6 border-b border-border/70 pb-3">
        <CategoryNav value={state.category} onChange={handleCategory} more={more} />
      </div>

      <LatestDevelopments
        items={developments.items}
        loading={developments.loading}
        error={developments.error}
        onRetry={developments.reload}
      />

      <section className="mt-8 border-t border-border/70 pt-5" aria-labelledby="explore-ai">
        <SectionHeading id="explore-ai" title="Explore AI" />

        <div className="mt-3 space-y-2">
          <FormatTabs rows={facets.formats} value={state.format} onChange={(value) => update({ format: value })} />
          <ExploreToolbar
            state={state}
            facets={facets}
            total={total}
            topics={topicOptions}
            onParam={update}
            onReset={clearFilters}
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
            onReset={clearFilters}
            onRetry={reload}
            emptyHint="Nothing in the catalogue matches these filters yet. Try another category, format, source or search term."
          />
        </div>
      </section>
    </div>
  );
}