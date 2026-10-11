import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// One development, resolved through the public feed by its stable identifier. The feed
// applies the same provenance and evidence checks it applies to the list, and answers an
// unknown or ineligible identifier as unavailable. The analysis entities stay
// administrator-only, so an unavailable development stays unavailable: this never falls
// back to reading an analysis row, and never renders a record the feed did not project.
export default function useDevelopment(developmentId) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ item: null, loading: true, unavailable: false, error: "" });

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const id = String(developmentId || "").trim();
    if (!id) {
      setState({ item: null, loading: false, unavailable: true, error: "" });
      return undefined;
    }

    let cancelled = false;
    setState({ item: null, loading: true, unavailable: false, error: "" });
    (async () => {
      try {
        const response = await base44.functions.invoke("devFeed", { development_id: id });
        const payload = response && response.data ? response.data : response;
        const item = payload && payload.found && payload.development ? payload.development : null;
        if (!cancelled) setState({ item, loading: false, unavailable: !item, error: "" });
      } catch (error) {
        console.error("Development lookup failed", error);
        if (!cancelled) {
          setState({ item: null, loading: false, unavailable: false, error: String((error && error.message) || error) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [developmentId, attempt]);

  return { ...state, reload };
}