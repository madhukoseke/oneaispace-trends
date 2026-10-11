import { Button } from "@/components/ui/button";
import ItemCard from "./cards/ItemCard";
import { DiscoveryEmpty, DiscoveryError, DiscoverySkeleton } from "./DiscoveryStates";

// Aligned grid, no masonry: three columns on a wide desktop, two at
// intermediate widths, one on mobile. Cards keep their own height.
export default function DiscoveryGrid({
  items, loading, error, hasMore, onLoadMore, onReset, contextFor, emptyHint,
}) {
  if (error) return <DiscoveryError message={error} />;
  if (loading && !items.length) return <DiscoverySkeleton />;
  if (!items.length) return <DiscoveryEmpty hint={emptyHint} onReset={onReset} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} context={contextFor ? contextFor(item) : ""} />
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
            {loading ? "Loading..." : "Show more items"}
          </Button>
        ) : (
          <p className="text-[12px] text-muted-foreground">End of results</p>
        )}
      </div>
    </div>
  );
}