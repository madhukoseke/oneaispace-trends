import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function useTrends() {
  const [trends, setTrends] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await base44.entities.Trend.filter({}, { sort: "sort_order", limit: 40 });
        if (!cancelled) setTrends(page.items || []);
      } catch (error) {
        console.error("Trend lookup failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return trends;
}

// A single trend plus the topics that actually hold items. No empty topic tabs.
export function useTrendDetail(slug) {
  const [state, setState] = useState({ trend: null, topics: [], loading: true, notFound: false });

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    setState({ trend: null, topics: [], loading: true, notFound: false });
    (async () => {
      try {
        const [trendPage, topicPage] = await Promise.all([
          base44.entities.Trend.filter({ slug }, { limit: 1 }),
          base44.entities.Topic.filter({ trend_slug: slug }, { sort: "sort_order", limit: 40 }),
        ]);
        if (cancelled) return;
        const trend = (trendPage.items || [])[0] || null;
        const topics = (topicPage.items || []).filter((topic) => topic.item_count > 0);
        setState({ trend, topics, loading: false, notFound: !trend });
      } catch (error) {
        console.error("Trend detail lookup failed", error);
        if (!cancelled) setState({ trend: null, topics: [], loading: false, notFound: true });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return state;
}