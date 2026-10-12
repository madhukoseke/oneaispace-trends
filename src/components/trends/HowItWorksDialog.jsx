import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// The pipeline as it actually runs, in the words the hackathon brief uses. Four short role
// lines and the standing limitation: no diagram, no imagery, no model marks, and no claim
// that anything here has been checked against the world.
const ROLES = [
  {
    label: "Extraction: GPT-6 Luna",
    body: "GPT-6 Luna extracts developments and claims from stored source material, including the stored excerpt each claim is based on.",
  },
  {
    label: "Support evaluation: Typesafe Jev",
    body: "Typesafe Jev assesses whether the supplied source excerpts support those claims, and records that assessment.",
  },
  {
    label: "Deterministic validation",
    body: "Deterministic checks validate quote and source provenance: the excerpt must appear verbatim in the stored record and belong to a source the development lists, and the batch that produced it must have been authorized, executed and completed successfully.",
  },
  {
    label: "Publication",
    body: "Only eligible developments appear in the public feed.",
  },
];

// The sequence the pipeline code itself runs, in order: deterministic grouping, the extraction
// call, the deterministic claim check against the stored record, the assessment call,
// finalisation, then the feed gate the reader's own row had to pass.
const FLOW = `stored source records
  |
  +- deterministic grouping
  |
  +- extraction: GPT-6 Luna
  |    -> developments + claims
  |
  +- deterministic claim check
  |    quote verbatim in the record
  |
  +- support evaluation: Typesafe Jev
  |    -> supported / partial /
  |       mixed / contradicted /
  |       not evaluated
  |
  +- finalized rows, batch criteria
  |
  +- feed gate: authorized,
  |    executed, completed batch
  |
public feed: eligible only`;

export default function HowItWorksDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] border border-ed-line bg-ed-surface px-4 text-[13.5px] text-ed-text outline-none",
            "transition-[background-color,border-color] duration-200",
            "hover:border-ed-line-strong hover:bg-ed-line active:bg-ed-press",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text"
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          How it works
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-[540px] overflow-y-auto rounded-[12px] border-ed-line bg-ed-surface p-5 text-ed-text">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold tracking-[-0.015em]">How this works</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-ed-muted">
            Every development in this feed is produced by the same two-role pipeline, then checked before it can be
            shown.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3">
          {ROLES.map((role) => (
            <div key={role.label}>
              <dt className="text-[12.5px] font-medium">{role.label}</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-ed-muted">{role.body}</dd>
            </div>
          ))}
        </dl>

        <p className="border-t border-ed-line pt-3 text-[12.5px] leading-relaxed text-ed-muted">
          <span className="font-medium text-ed-text">Source-excerpt support is not independent verification. </span>
          It is a model's judgement about a quote taken from the stored record. Nothing here has been checked against
          the world.
        </p>

        <div>
          <p className="text-[11px] uppercase tracking-[0.09em] text-ed-label">Flow</p>
          <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-[1.6] text-ed-muted">{FLOW}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}