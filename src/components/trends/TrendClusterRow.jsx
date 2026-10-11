import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import EvidenceStatus from "./EvidenceStatus";

// One grouped development: the named model, tool or term that records from
// different sources mention, what it was grouped from, and the trend those records
// sit in. Nothing beyond the records is asserted - no momentum is claimed, because
// none is measured.
export default function TrendClusterRow({ cluster, window: windowKey, trendName }) {
  const signals = cluster.items.length;
  const explanation = `${signals} items from ${cluster.sources.length} sources mention this in the last ${windowKey}.`;

  return (
    <li className="border-t border-border/60 first:border-t-0">
      <Link
        to={`/trends/${cluster.trendSlug}`}
        className="group flex flex-col gap-1 py-3 outline-none transition-colors duration-150 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring sm:-mx-2 sm:flex-row sm:items-baseline sm:gap-4 sm:px-2"
      >
        <span className="text-[14px] font-medium tracking-[-0.01em] sm:w-[190px] sm:shrink-0">{cluster.title}</span>

        <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">{explanation}</span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground sm:shrink-0">
          <span className="font-medium tabular-nums text-foreground/75">
            {signals} {signals === 1 ? "signal" : "signals"}
          </span>
          <span aria-hidden="true">·</span>
          <span className="max-w-[190px] truncate">{cluster.sources.slice(0, 3).join(", ")}</span>
          <span aria-hidden="true">·</span>
          <EvidenceStatus prefix="" />
          {trendName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{trendName}</span>
            </>
          ) : null}
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}