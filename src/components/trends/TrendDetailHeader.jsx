import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import EvidenceStatus from "./EvidenceStatus";
import { momentumLabel, relativeTime } from "@/lib/trends";

// Compact trend identity plus what is actually known about it: how much it holds,
// which sources it came from, whether momentum is measured at all, that evidence
// has not been evaluated, and when the catalogue last refreshed. A trend score is
// only shown when one exists, and none does yet.
export default function TrendDetailHeader({ trend, sourceCount, run }) {
  const momentum = momentumLabel(trend.momentum);
  const refreshed = run && run.finished_at ? relativeTime(run.finished_at) : "";

  return (
    <header>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Link
          to="/trends"
          className="rounded-[4px] outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Trends
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground/80">{trend.name}</span>
      </nav>

      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">{trend.name}</h1>
          {trend.description ? (
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{trend.description}</p>
          ) : null}
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground lg:justify-end">
          <span className="tabular-nums">{trend.item_count} items</span>
          {sourceCount ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{sourceCount} sources</span>
            </>
          ) : null}
          {momentum ? (
            <>
              <span aria-hidden="true">·</span>
              <span title={trend.momentum_basis || ""}>{momentum}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <EvidenceStatus />
          {refreshed ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Updated {refreshed}</span>
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}