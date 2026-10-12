import { Info } from "lucide-react";
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          How it works
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-[540px] overflow-y-auto rounded-[12px] border-border/70 bg-card p-5">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium tracking-[-0.01em]">How this works</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Every development in this feed is produced by the same two-role pipeline, then checked before it can be
            shown.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3">
          {ROLES.map((role) => (
            <div key={role.label}>
              <dt className="text-[12.5px] font-medium">{role.label}</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{role.body}</dd>
            </div>
          ))}
        </dl>

        <p className="border-t border-border/60 pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Source-excerpt support is not independent verification. </span>
          It is a model's judgement about a quote taken from the stored record. Nothing here has been checked against
          the world.
        </p>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Flow</p>
          <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-[1.6] text-muted-foreground">{FLOW}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}