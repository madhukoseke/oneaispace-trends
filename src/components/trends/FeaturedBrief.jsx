import { ExternalLink } from "lucide-react";
import SaveButton from "./SaveButton";
import ProvenanceLabel from "./ProvenanceLabel";
import { shortDate } from "@/lib/trends";

// One recent official announcement or research record, reused exactly as stored.
// The date and the link back to the original page stay visible, and the
// provenance label never implies that the claim itself has been checked.
export default function FeaturedBrief({ item, context }) {
  return (
    <article className="flex flex-col rounded-[11px] border border-border/70 bg-card p-3.5 transition-colors duration-150 hover:border-border">
      <div className="flex items-center gap-2">
        <ProvenanceLabel sourceKey={item.source_key} />
        <span className="truncate text-[12px] text-muted-foreground">{item.source}</span>
      </div>

      <h3 className="mt-2 text-[15px] font-medium leading-snug tracking-[-0.01em]">
        <a
          href={item.canonical_url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.title}
        </a>
      </h3>

      {item.excerpt ? (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
      ) : null}

      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-border/60 pt-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
          <time dateTime={item.published_at}>{shortDate(item.published_at)}</time>
          {context ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{context}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <a
            href={item.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[4px] outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Original
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </p>
        <SaveButton item={item} className="-mb-1 -mr-1" />
      </div>
    </article>
  );
}