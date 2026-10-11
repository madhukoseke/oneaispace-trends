import { cn } from "@/lib/utils";
import { provenanceInfo } from "@/lib/provenance";

// Who published the record: an organisation's own channel, an author-attributed
// paper, a community source or the press. This is provenance, not a verification
// claim, so an official record is never shown as verified.
export default function ProvenanceLabel({ sourceKey, className }) {
  const info = provenanceInfo(sourceKey);

  return (
    <span
      title={info.hint}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] border border-border/70 px-1.5 py-[2px] text-[11px] font-medium leading-none text-muted-foreground",
        className
      )}
    >
      {info.label}
    </span>
  );
}