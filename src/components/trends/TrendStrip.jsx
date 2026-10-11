import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { momentumLabel } from "@/lib/trends";
import BrowseTrendsPopover from "./BrowseTrendsPopover";

const LINK_BASE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring";

export function TrendLink({ trend, active = false }) {
  const marked = trend.momentum === "surging" || trend.momentum === "rising";

  return (
    <Link
      to={`/trends/${trend.slug}`}
      title={trend.momentum_basis || ""}
      className={cn(
        LINK_BASE,
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      {marked ? <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" /> : null}
      {trend.name}
      <span className="sr-only">
        {trend.momentum ? ` - ${momentumLabel(trend.momentum)}` : ""} ({trend.item_count} items)
      </span>
    </Link>
  );
}

// Compact cross-trend navigation: All trends, the most active trends, and a
// lightweight popover for the rest. Horizontal scroll on narrow screens.
export default function TrendStrip({ trends, activeSlug = null, max = 6 }) {
  const shown = trends.slice(0, max);
  const rest = trends.slice(max);

  if (!trends.length) return null;

  return (
    <nav aria-label="Browse by trend" className="flex items-center gap-1 overflow-x-auto pb-0.5">
      {activeSlug ? (
        <Link to="/trends" className={cn(LINK_BASE, "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}>
          All trends
        </Link>
      ) : (
        <span className={cn(LINK_BASE, "bg-secondary font-medium text-foreground")} aria-current="page">
          All trends
        </span>
      )}
      {shown.map((trend) => (
        <TrendLink key={trend.slug} trend={trend} active={trend.slug === activeSlug} />
      ))}
      {rest.length ? <BrowseTrendsPopover trends={rest} activeSlug={activeSlug} /> : null}
    </nav>
  );
}