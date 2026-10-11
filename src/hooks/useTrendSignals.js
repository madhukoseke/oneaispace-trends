import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const FIELDS = ["title", "canonical_url", "source", "creator", "published_at"];

// The newest records in one trend and the sources they came from. Read-only reuse
// of stored items: no analysis is inferred from them here.
export default function useTrendSignals(slug) {
  const [state, setState] = useState({ items: [], sources: [], loading: true });

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    setState({ items: [], sources: [], loading: true });
    (async () => {
      try {
        const [page, sourceRows] = await Promise.all([
          base44.entities.Item.filter({ trend_slug: slug }, { sort: "-published_at", limit: 3, fields: FIELDS }),
          base44.entities.Item.aggregate({ query: { trend_slug: slug }, groupBy: "source" }),
        ]);
        if (cancelled) return;
        const sources = (sourceRows.rows || [])
          .slice()
          .sort((a, b) => (b.count || 0) - (a.count || 0) || String(a.source).localeCompare(String(b.source)));
        setState({ items: page.items || [], sources, loading: false });
      } catch (error) {
        console.error("Trend signal lookup failed", error);
        if (!cancelled) setState({ items: [], sources: [], loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return state;
}