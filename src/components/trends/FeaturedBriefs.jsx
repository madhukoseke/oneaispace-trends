import { Skeleton } from "@/components/ui/skeleton";
import SectionHeading from "./SectionHeading";
import FeaturedBrief from "./FeaturedBrief";

function BriefsSkeleton() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
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

// Recent official announcements and research, taken from records that are already
// in the catalogue. The window widens from 72 hours to 7 days only when the
// shorter window cannot fill the section, and the note states which one applies.
export default function FeaturedBriefs({ items, window: windowKey, loading, contextFor }) {
  return (
    <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="official-and-research">
      <SectionHeading
        id="official-and-research"
        title="Official & Research"
        note={windowKey ? `Official channels and research from the last ${windowKey}` : ""}
      />

      {loading ? (
        <BriefsSkeleton />
      ) : items.length ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <FeaturedBrief key={item.id} item={item} context={contextFor ? contextFor(item) : ""} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[11px] border border-dashed border-border/70 px-4 py-5 text-[13px] leading-relaxed text-muted-foreground">
          No official announcement or research paper was catalogued in the last seven days, so this section stays
          empty rather than filling the space with older or unrelated records.
        </p>
      )}
    </section>
  );
}