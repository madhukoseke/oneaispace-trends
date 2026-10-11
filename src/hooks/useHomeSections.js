import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { buildDevelopments, selectBriefs } from "@/lib/briefs";

const FIELDS = [
  "title", "excerpt", "canonical_url", "source", "source_key", "format", "creator",
  "published_at", "trend_slug", "topic_slug",
];

const LOOKBACK_DAYS = 7;
const LOOKBACK_LIMIT = 120;

// One read of the records that are already stored, reused by both feature
// sections, so they always reflect the latest ingestion run and never overlap.
export default function useHomeSections() {
  const [state, setState] = useState({ items: [], loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
        const page = await base44.entities.Item.filter(
          { published_at: { $gte: since } },
          { sort: "-published_at", limit: LOOKBACK_LIMIT, fields: FIELDS }
        );
        if (!cancelled) setState({ items: page.items || [], loading: false, error: "" });
      } catch (error) {
        console.error("Feature section lookup failed", error);
        if (!cancelled) setState({ items: [], loading: false, error: String((error && error.message) || error) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const briefs = useMemo(() => selectBriefs(state.items), [state.items]);
  const trending = useMemo(
    () => buildDevelopments(state.items, { featured: briefs.items.map((item) => item.id) }),
    [state.items, briefs.items]
  );

  return { briefs, trending, loading: state.loading, error: state.error };
}