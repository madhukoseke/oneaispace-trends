import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const FEED_LIMIT = 6;

// The public developments feed, and nothing else: the analysis entities stay
// administrator-only and are never read from the browser. The feed already returns only
// accepted developments whose stored batch provenance is proven and whose evidence quote was
// verified against the stored record, so this hook adds no filtering of its own - an empty
// response means the feed had nothing eligible to show and the section hides itself; a failed
// request is reported to the caller instead, so an unavailable feed never looks like an empty one.
export default function useLatestDevelopments() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ items: [], loading: true, error: "" });

  // The same lookup, run again on request, so a failed feed can be retried in place.
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ items: [], loading: true, error: "" });
    (async () => {
      try {
        const response = await base44.functions.invoke("devFeed", { limit: FEED_LIMIT });
        const payload = response && response.data ? response.data : response;
        const items = payload && Array.isArray(payload.items) ? payload.items : [];
        if (!cancelled) setState({ items, loading: false, error: "" });
      } catch (error) {
        console.error("Developments feed lookup failed", error);
        if (!cancelled) setState({ items: [], loading: false, error: String((error && error.message) || error) });
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  return { ...state, reload };
}