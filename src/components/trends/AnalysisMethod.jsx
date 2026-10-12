import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const STEPS = [
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
];

// Compact, collapsed by default. The public feed projects no per-record model attribution, so
// this states the general workflow rather than claiming which model handled this development;
// the one development-specific line it does make comes from the support state the feed already
// projects. Run details, prompts, raw outputs and analysis entities stay out of it entirely.
export default function AnalysisMethod({ support = {} }) {
  const [open, setOpen] = useState(false);
  const assessed = Boolean(support.state) && support.state !== "source_states_claim_only";

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-labelledby="analysis-method" className="rounded-[11px] border border-border/70 bg-surface/50">
        <CollapsibleTrigger asChild>
          <button
            id="analysis-method"
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-[11px] px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-[12.5px] font-medium">How this was analyzed</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/60 px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              This is the general workflow behind every development in this feed. Which model handled this individual
              development is not published, so this describes the pipeline rather than this record's own run.
            </p>

            <dl className="space-y-2.5">
              {STEPS.map((step) => (
                <div key={step.label}>
                  <dt className="text-[12.5px] font-medium">{step.label}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{step.body}</dd>
                </div>
              ))}
            </dl>

            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {assessed
                ? "A model assessment of this development's excerpt is recorded, and the evidence block above states it."
                : "No model assessment of the evidence is recorded for this development, and the evidence block above says so."}
            </p>

            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Support is a model's judgement about a stored excerpt. Source-excerpt support is never independent
              verification.
            </p>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}