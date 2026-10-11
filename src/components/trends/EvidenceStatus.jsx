import { cn } from "@/lib/utils";

// Evidence is reported only as far as it has been evaluated: claims are not
// extracted yet, so nothing is marked supported, mixed or disputed, and agreement
// between models is never treated as proof.
export default function EvidenceStatus({ className, prefix = "Evidence:" }) {
  return (
    <span
      title="No claims have been extracted or evaluated yet."
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-muted-foreground", className)}
    >
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}
      <span className="font-medium text-foreground/75">Not evaluated</span>
    </span>
  );
}