import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { relativeTime } from "@/lib/trends";

// Compact topic identity: what it holds, how many distinct sources those records
// came from, and when the catalogue last refreshed. No momentum and no evidence
// badge is shown here: neither is measured for a broad topic, and a topic is not
// a claim that could be verified.
export default function TrendDetailHeader({ trend, sourceCount, run }) {
  const refreshed = run && run.finished_at ? relativeTime(run.finished_at) : "";
  const meta = [
    `${trend.item_count || 0} ${trend.item_count === 1 ? "item" : "items"}`,
    sourceCount ? `${sourceCount} ${sourceCount === 1 ? "source" : "sources"}` : "",
    refreshed ? `Updated ${refreshed}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

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

      <h1 className="mt-2.5 text-[24px] font-semibold tracking-[-0.02em] sm:text-[27px]">{trend.name}</h1>

      {trend.description ? (
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{trend.description}</p>
      ) : null}

      <p className="mt-2 text-[12.5px] tabular-nums text-muted-foreground">{meta}</p>
    </header>
  );
}