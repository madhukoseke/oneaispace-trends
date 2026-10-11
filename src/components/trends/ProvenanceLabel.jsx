import { cn } from "@/lib/utils";
import { itemProvenance } from "@/lib/provenance";

// Who published the record. Official is granted only when the publisher registry
// confirms both the canonical host and the source identity of the record itself,
// so it always says "the organisation published this", never "this is verified".
export default function ProvenanceLabel({ item, className }) {
  const info = itemProvenance(item);

  return (
    <span
      title={info.hint}
      data-provenance={info.label}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] border border-border/70 px-1.5 py-[2px] text-[11px] font-medium leading-none text-muted-foreground",
        className
      )}
    >
      {info.label}
    </span>
  );
}