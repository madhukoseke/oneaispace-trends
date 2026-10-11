import { ExternalLink } from "lucide-react";

// The evidence block. Every value comes from the public feed: the quote was checked
// verbatim against the stored record before the feed would return the development at all,
// the support line is a model's assessment of that quote rather than verification, and the
// standing disclosure is shown with it so the two are never read apart.
export default function DevelopmentEvidence({ item }) {
  const evidence = item.evidence || {};
  const support = item.support || {};

  return (
    <section aria-labelledby="development-evidence" className="rounded-[11px] border border-border/70 bg-surface/50 p-4">
      <h2 id="development-evidence" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Supported by source excerpt
      </h2>

      {evidence.quote ? (
        <blockquote className="mt-2.5 border-l-2 border-border pl-3 text-[14px] leading-relaxed text-foreground/90">
          {evidence.quote}
        </blockquote>
      ) : null}

      {support.label ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{support.label}</p>
      ) : null}

      <p className="mt-3 text-[13px] leading-relaxed">
        <span className="font-medium">Not independently verified. </span>
        <span className="text-muted-foreground">{item.disclosure}</span>
      </p>

      {evidence.source_url ? (
        <p className="mt-3">
          <a
            href={evidence.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[4px] text-[13px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {evidence.source_name ? `Excerpt from ${evidence.source_name}` : "Original source"}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </p>
      ) : null}
    </section>
  );
}