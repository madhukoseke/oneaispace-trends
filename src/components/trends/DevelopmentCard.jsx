import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { calendarDate } from "@/lib/trends";

// One accepted development, drawn only from the fields the public feed projects: the
// stored event type when the record carries one, the title, the one stored
// source-grounded summary, the publisher and that source's publication date. Text first,
// no imagery. The evidence itself is on the detail page, which resolves through the same feed.
export default function DevelopmentCard({ item }) {
  const source = item.source || {};
  const date = calendarDate(item.published_at);
  const label = item.event_type_label || item.kind_label || "";
  const href = `/developments/${encodeURIComponent(item.development_id)}`;

  return (
    <article className="flex h-full flex-col rounded-[10px] border border-border/60 bg-card p-3.5 transition-colors duration-150 hover:border-brand/35">
      {label ? (
        <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-brand">{label}</p>
      ) : null}

      <h3 className="mt-1.5 text-[15px] font-medium leading-snug tracking-[-0.01em]">
        <Link
          to={href}
          className="rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.title}
        </Link>
      </h3>

      {item.summary ? (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{item.summary}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <p className="min-w-0 truncate text-[12px] text-muted-foreground">
          {source.name ? <span>{source.name}</span> : null}
          {source.name && date ? <span aria-hidden="true"> · </span> : null}
          {date ? <time dateTime={item.published_at}>{date}</time> : null}
        </p>
        <Link
          to={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-[4px] text-[12.5px] text-brand/90 outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}