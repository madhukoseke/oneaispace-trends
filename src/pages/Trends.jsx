import { useCallback, useMemo } from "react";
import TrendsHeader from "@/components/trends/TrendsHeader";
import CategoryNav from "@/components/trends/CategoryNav";
import FormatTabs from "@/components/trends/FormatTabs";
import ExploreToolbar from "@/components/trends/ExploreToolbar";
import DiscoveryGrid from "@/components/trends/DiscoveryGrid";
import EditorialHeading from "@/components/trends/EditorialHeading";
import LatestDevelopments from "@/components/trends/LatestDevelopments";
import useDiscovery from "@/hooks/useDiscovery";
import useTrends from "@/hooks/useTrends";
import useTopicOptions from "@/hooks/useTopicOptions";
import useLatestDevelopments from "@/hooks/useLatestDevelopments";
import { categorySlugs, moreTrends } from "@/lib/categories";

const SUBTITLE = "Discover what's happening in AI.";

// The editorial discovery surface: the masthead and its one search field, then the developments
// the public feed has proven, then the categories and the whole catalogue as one two-column
// feed. The category row narrows the catalogue to existing trend identifiers and is the only
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

  // The catalogue is narrowed by a search, a category or any Explore filter. Sort order and
  // page are not narrowing, so they leave the section alone.
  const narrowed =
    Boolean(state.q) ||
    state.category !== "all" ||
    state.format !== "all" ||
    state.source !== "all" ||
    state.tags.length > 0 ||
    Boolean(state.topic);

  return (
    <div className="bg-ed-bg pb-[72px] text-ed-text">
      <TrendsHeader title="Trends" subtitle={SUBTITLE} query={state.q} onQueryChange={handleQuery} />

      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <LatestDevelopments
          hidden={narrowed}
          items={developments.items}
          loading={developments.loading}
          error={developments.error}
          onRetry={developments.reload}
        />

        <section
          className="mt-14 animate-fade-in opacity-0 [animation-delay:0.9s]"
          aria-labelledby="explore-ai"
        >
          <CategoryNav value={state.category} onChange={handleCategory} more={more} />

          <EditorialHeading
            id="explore-ai"
            title="Explore AI"
            note="Browse original sources, research, releases, and tools."
            bordered={false}
          />

          <div className="mt-6">
            <FormatTabs
              rows={facets.formats}
              value={state.format}
              onChange={(value) => update({ format: value })}
            />
          </div>

          <div className="mt-4">
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

          <div className="mt-7">
            <DiscoveryGrid
              columns={2}
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
    </div>
  );
}