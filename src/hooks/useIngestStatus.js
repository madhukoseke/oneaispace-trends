import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Reads the most recent ingestion run so the header can state dataset freshness
// honestly instead of implying live reporting.
export default function useIngestStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await base44.entities.IngestionRun.list({ sort: "-started_at", limit: 6 });
        if (cancelled) return;
        const runs = page.items || [];
        const latest = runs.find((run) => run.status === "success" || run.status === "partial") || runs[0] || null;
        setStatus(latest);
      } catch (error) {
        console.error("Ingestion status lookup failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return status;
}