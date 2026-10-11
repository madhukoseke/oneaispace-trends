import { Skeleton } from "@/components/ui/skeleton";
import SectionHeading from "./SectionHeading";
import FeaturedBrief from "./FeaturedBrief";

function BriefsSkeleton() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="space-y-2 rounded-[11px] border border-border/70 bg-card p-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

// Recent first-party publications and papers, taken from records that are already
// in the catalogue, capped at three. Only the publisher registry can mark a
// record Official; everything else is shown as the source it came from. The
// window widens from 72 hours to 7 days only when the shorter one cannot fill the
// section, and the note states which one applies.
export default function FeaturedBriefs({ items, window: windowKey, loading, contextFor }) {
  return (
    <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="official-and-research">
      <SectionHeading
        id="official-and-research"
        title="Official & Research"
        note={windowKey ? `First-party publications and research from the last ${windowKey}` : ""}
      />

      {loading ? (
        <BriefsSkeleton />
      ) : items.length ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <FeaturedBrief key={item.id} item={item} context={contextFor ? contextFor(item) : ""} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[11px] border border-dashed border-border/70 px-4 py-5 text-[13px] leading-relaxed text-muted-foreground">
          No first-party publication or paper from a known publisher was catalogued in the last seven days, so this
          section stays empty rather than filling the space with third-party coverage or older records.
        </p>
      )}
    </section>
  );
}