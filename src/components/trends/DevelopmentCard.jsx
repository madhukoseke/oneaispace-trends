import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { calendarDate } from "@/lib/trends";

// One accepted development, drawn only from the fields the public feed projects: the
// stored event type when the record carries one, the title, the one stored
// source-grounded summary, the publisher and that source's publication date. The evidence
// itself is on the detail page, which resolves through the same feed.
export default function DevelopmentCard({ item }) {
  const source = item.source || {};
  const date = calendarDate(item.published_at);
  const label = item.event_type_label || item.kind_label || "";
  const href = `/developments/${encodeURIComponent(item.development_id)}`;

  return (
    <article className="flex h-full flex-col rounded-[11px] border border-border/70 bg-card p-4 transition-colors duration-150 hover:border-border">
      {label ? (
        <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/85">{label}</p>
      ) : null}

      <h3 className="mt-1.5 text-[16px] font-medium leading-snug tracking-[-0.01em]">
        <Link
          to={href}
          className="rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.title}
        </Link>
      </h3>

      {item.summary ? (
        <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{item.summary}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <p className="min-w-0 text-[12.5px] text-muted-foreground">
          {source.name ? <span className="truncate">{source.name}</span> : null}
          {source.name && date ? <span aria-hidden="true"> · </span> : null}
          {date ? <time dateTime={item.published_at}>{date}</time> : null}
        </p>
        <Link
          to={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-[4px] text-[12.5px] font-medium text-foreground/85 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}