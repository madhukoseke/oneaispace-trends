import { cn } from "@/lib/utils";
import { GRID_COLUMNS } from "@/lib/trends";
import SourceCard from "./cards/SourceCard";
import { DiscoveryEmpty, DiscoveryError, DiscoverySkeleton } from "./DiscoveryStates";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";

// Aligned grid, no masonry: every card in a row is the same height, so a category reads as one
// grid rather than a column of differently sized boxes. Density is the page's choice: the
// editorial feed runs two wide columns, the topic surfaces keep three.
export default function DiscoveryGrid({
  items, loading, error, hasMore, onLoadMore, onReset, onRetry, emptyHint, emptyTitle, emptyAction,
  columns = 3,
}) {
  if (error) return <DiscoveryError onRetry={onRetry} />;
  if (loading && !items.length) return <DiscoverySkeleton columns={columns} />;
  if (!items.length) {
    return (
      <DiscoveryEmpty
        title={emptyTitle}
        hint={emptyHint}
        onReset={emptyAction ? undefined : onReset}
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      <div className={cn("grid gap-5", GRID_COLUMNS[columns] || GRID_COLUMNS[3])}>
        {items.map((item) => (
          <SourceCard key={item.id} item={item} />
        ))}
      </div>

      <div className="mt-9 flex flex-col items-center gap-3.5">
        {hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className={cn(
              "h-9 rounded-[7px] border border-ed-line bg-ed-surface px-4 text-[13.5px] text-ed-text transition-[background-color,border-color] duration-200 hover:border-ed-line-strong hover:bg-ed-line disabled:opacity-60",
              FOCUS
            )}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        ) : (
          <p className="text-[12px] text-ed-label">End of results</p>
        )}
      </div>
    </div>
  );
}