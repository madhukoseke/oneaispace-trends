import { Button } from "@/components/ui/button";
import SourceCard from "./cards/SourceCard";
import { DiscoveryEmpty, DiscoveryError, DiscoverySkeleton } from "./DiscoveryStates";

// Aligned grid, no masonry: three columns on a wide desktop, two at intermediate widths, one on
// mobile. Every card in a row is the same height, so a category reads as one grid rather than a
// column of differently sized boxes.
export default function DiscoveryGrid({
  items, loading, error, hasMore, onLoadMore, onReset, onRetry, emptyHint, emptyTitle, emptyAction,
}) {
  if (error) return <DiscoveryError onRetry={onRetry} />;
  if (loading && !items.length) return <DiscoverySkeleton />;
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SourceCard key={item.id} item={item} />
        ))}
      </div>

      <div className="flex justify-center">
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={loading}
            className="h-9 rounded-[7px] border-border/70 px-4 text-[13.5px]"
          >
            {loading ? "Loading..." : "Load more"}
          </Button>
        ) : (
          <p className="text-[12px] text-muted-foreground">End of results</p>
        )}
      </div>
    </div>
  );
}