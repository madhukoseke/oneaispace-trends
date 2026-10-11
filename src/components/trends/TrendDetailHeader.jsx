import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { momentumLabel } from "@/lib/trends";

// Compact trend identity plus the provenance it actually has: how much it holds,
// how fresh that content is, and which sources it came from.
export default function TrendDetailHeader({ trend, sourceCount, run }) {
  const momentum = momentumLabel(trend.momentum);

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
          {run && run.finished_at ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Unverified catalogue</span>
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}