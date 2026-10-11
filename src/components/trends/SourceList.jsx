import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoveryEmpty, DiscoveryError } from "./DiscoveryStates";
import SourceRow from "./SourceRow";

function RowsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="space-y-2 rounded-[10px] border border-border/60 bg-card px-4 py-3.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// The catalogue as one vertically stacked list of source items: scanning down a single column
// is faster than reading a wall of preview images, and every row keeps the same order of
// information. One page at a time, with the same load-more control as before.
export default function SourceList({ items, loading, error, hasMore, onLoadMore, onReset, onRetry, emptyHint }) {
  if (error) return <DiscoveryError onRetry={onRetry} />;
  if (loading && !items.length) return <RowsSkeleton />;
  if (!items.length) return <DiscoveryEmpty hint={emptyHint} onReset={onReset} />;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <SourceRow item={item} />
          </li>
        ))}
      </ul>

      <div className="flex items-center">
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={loading}
            className="h-8 rounded-[7px] border-border/60 px-3 text-[13px] font-normal"
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