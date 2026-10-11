import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// The distinct sources one topic's records actually came from, counted from the
// stored items rather than from a record count, so repeats never inflate it.
export default function useTrendSources(slug) {
  const [sources, setSources] = useState([]);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await base44.entities.Item.aggregate({ query: { trend_slug: slug }, groupBy: "source" });
        if (!cancelled) setSources((result.rows || []).filter((row) => row.source));
      } catch (error) {
        console.error("Source lookup failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return sources;
}