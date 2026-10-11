import { AlertCircle, SearchX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function DiscoverySkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-[11px] border border-border/70 bg-card">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-3.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscoveryEmpty({ title = "Nothing matches these filters", hint, onReset }) {
  return (
    <div className="rounded-[11px] border border-dashed border-border/70 px-6 py-14 text-center">
      <SearchX className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-[15px] font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{hint}</p> : null}
      {onReset ? (
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="mt-5 h-9 rounded-[7px] border-border/70 text-[13.5px]"
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

export function DiscoveryError({ message }) {
  return (
    <div className="rounded-[11px] border border-border/70 bg-card px-6 py-12 text-center" role="alert">
      <AlertCircle className="mx-auto h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="mt-3 text-[15px] font-medium">The catalogue could not be loaded</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}