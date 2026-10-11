import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { PAGE_SIZE } from "@/lib/trends";
import { itemQuery, nextParams, readDiscovery, scopeQuery } from "@/lib/discovery";

const ITEM_FIELDS = [
  "title", "excerpt", "canonical_url", "source", "source_key", "format", "creator",
  "published_at", "thumbnail_url", "media_kind", "duration_seconds", "metric_label",
  "metric_value", "metrics", "verification", "claim_uncertain", "provenance_url",
  "provenance_label", "tags", "trend_slug", "topic_slug",
];

// One query path for the Trends home and for a Trend/topic detail surface.
// Filters, search, topic and page all live in the URL.
export default function useDiscovery({ trendSlug = null } = {}) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readDiscovery(params), [params]);
  const [data, setData] = useState({ items: [], total: 0, loading: true, error: "" });
  const [facets, setFacets] = useState({ formats: [], sources: [] });

  const tagKey = state.tags.join(",");
  const scope = { trendSlug, topicSlug: state.topic };
  const query = useMemo(
    () => itemQuery(scope, state),
    [trendSlug, state.topic, state.q, state.format, state.source, tagKey]
  );

  useEffect(() => {
    let cancelled = false;
    setData((previous) => ({ ...previous, loading: true, error: "" }));
    const order = state.sort === "newest" ? "-published_at" : "-score";
    (async () => {
      try {
        const [page, total] = await Promise.all([
          base44.entities.Item.filter(query, { sort: order, limit: PAGE_SIZE * state.page, fields: ITEM_FIELDS }),
          base44.entities.Item.count(query),
        ]);
        if (cancelled) return;
        setData({ items: page.items || [], total, loading: false, error: "" });
      } catch (error) {
        if (cancelled) return;
        setData({ items: [], total: 0, loading: false, error: String((error && error.message) || error) });
      }
    })();
    return () => { cancelled = true; };
  }, [JSON.stringify(query), state.sort, state.page]);

  // Facets describe the scope being browsed (trend, topic, search), so only
  // formats and sources that actually exist there are ever offered.
  const facetQuery = useMemo(
    () => ({ ...scopeQuery({ q: state.q }), ...(trendSlug ? { trend_slug: trendSlug } : {}), ...(state.topic ? { topic_slug: state.topic } : {}) }),
    [trendSlug, state.topic, state.q]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [formatRows, sourceRows] = await Promise.all([
          base44.entities.Item.aggregate({ query: facetQuery, groupBy: "format" }),
          base44.entities.Item.aggregate({ query: facetQuery, groupBy: "source" }),
        ]);
        if (cancelled) return;
        setFacets({
          formats: formatRows.rows || [],
          sources: (sourceRows.rows || []).slice().sort((a, b) => String(a.source).localeCompare(String(b.source))),
        });
      } catch (error) {
        console.error("Facet lookup failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, [JSON.stringify(facetQuery)]);

  const update = useCallback((patch, options) => {
    const { next, replace } = nextParams(params, patch, options);
    setParams(next, { replace });
  }, [params, setParams]);

  const reset = useCallback(() => {
    setParams(new URLSearchParams());
  }, [setParams]);

  const loadMore = useCallback(() => {
    update({ page: state.page + 1 }, { resetPage: false });
  }, [update, state.page]);

  return {
    state,
    update,
    reset,
    loadMore,
    tagQuery: facetQuery,
    facets,
    items: data.items,
    total: data.total,
    loading: data.loading,
    error: data.error,
    hasMore: data.items.length < data.total,
  };
}

// Tag options are only needed once the Filters surface is opened.
export function useTagFacets(query, enabled) {
  const [tags, setTags] = useState([]);
  const key = JSON.stringify(query);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await base44.entities.Item.aggregate({ query, groupBy: "tags" });
        const counts = new Map();
        for (const row of result.rows || []) {
          for (const tag of row.tags || []) counts.set(tag, (counts.get(tag) || 0) + (row.count || 0));
        }
        if (!cancelled) setTags([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
      } catch (error) {
        console.error("Tag lookup failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, [key, enabled]);

  return tags;
}