import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function originalDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// One accepted development, drawn only from the fields the public feed projects: its title,
// its one-line summary, the source it came from, that source's own publication date and a link
// back to the original page. The evidence panel opens on demand and shows the quote that was
// checked verbatim against the stored record, the evaluation model's assessment of that quote,
// and the standing disclosure that nothing here has been independently verified. No run id,
// prompt, authorization, usage figure or internal row reaches this component, because the feed
// never returns one.
export default function DevelopmentRow({ item }) {
  const [open, setOpen] = useState(false);
  const panelId = `development-evidence-${item.development_id}`;
  const source = item.source || {};
  const evidence = item.evidence || {};
  const support = item.support || {};
  const date = originalDate(item.published_at);
  const verification = item.independent_verification === "not_performed"
    ? "Not independently verified."
    : item.independent_verification;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {item.kind_label ? (
          <span className="rounded-[4px] border border-border/70 px-1.5 py-[1px] font-medium text-foreground/70">
            {item.kind_label}
          </span>
        ) : null}
        {source.name ? <span className="truncate">{source.name}</span> : null}
        {date ? (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={item.published_at}>{date}</time>
          </>
        ) : null}
      </div>

      <h3 className="mt-1.5 text-[14px] font-medium leading-snug tracking-[-0.01em]">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.title}
          </a>
        ) : item.title}
      </h3>

      {item.summary ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground sm:line-clamp-1">{item.summary}</p>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[4px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Original
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex items-center gap-1 rounded-[4px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Evidence
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {open ? (
        <div id={panelId} className="mt-2 rounded-[9px] border border-border/70 bg-surface/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Quote from the stored record</p>
          <blockquote className="mt-1 border-l-2 border-border pl-2.5 text-[12.5px] leading-relaxed text-foreground/85">
            {evidence.quote}
          </blockquote>

          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{support.label}</p>

          <p className="mt-2 text-[12px] leading-relaxed">
            {verification ? <span className="font-medium">{verification} </span> : null}
            <span className="text-muted-foreground">{item.disclosure}</span>
          </p>
        </div>
      ) : null}
    </li>
  );
}