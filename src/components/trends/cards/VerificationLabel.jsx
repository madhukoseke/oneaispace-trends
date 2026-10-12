import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Shows only for items whose own title or excerpt carries an unconfirmed claim.
// Verification is never inferred, and nothing is ever marked confirmed here.
export default function VerificationLabel({ item, className }) {
  if (!item.claim_uncertain) return null;

  return (
    <span
      title="Reported claim - not independently verified."
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] border border-signal-fire/35 px-1.5 py-[2px] text-[11px] font-medium leading-none text-signal-fire",
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Unverified
    </span>
  );
}