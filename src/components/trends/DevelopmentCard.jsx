import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { calendarDate, isHttpUrl } from "@/lib/trends";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";

// One accepted development, drawn only from the fields the public feed projects: the stored
// event type when the record carries one, the title, the one stored source-grounded summary, the
// publisher and that source's publication date. The feed projects no preview for a development,
// so the card stays text-led rather than showing stand-in artwork; a source-supplied preview is
// used only if such a record ever carries one. The evidence itself is on the detail page, which
// resolves through the same feed.
export default function DevelopmentCard({ item }) {
  const source = item.source || {};
  const date = calendarDate(item.published_at);
  const label = item.event_type_label || item.kind_label || "";
  const href = `/developments/${encodeURIComponent(item.development_id)}`;
  const preview = isHttpUrl(item.thumbnail_url) ? item.thumbnail_url : "";

  return (
    <article
      className={cn(
        "grid h-full gap-5 rounded-[12px] border border-ed-line bg-ed-surface p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)]",
        preview ? "sm:grid-cols-[200px_1fr]" : "grid-cols-1"
      )}
    >
      {preview ? (
        <Image
          src={preview}
          alt=""
          className="h-full max-h-[150px] w-full rounded-[8px] object-cover sm:w-[200px]"
        />
      ) : null}

      <div className="min-w-0">
        {label ? (
          <p className="text-[11px] uppercase tracking-[0.09em] text-ed-label">{label}</p>
        ) : null}

        <h3 className="mb-1.5 mt-2 text-[20px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[22px]">
          <Link
            to={href}
            className={cn("rounded-[4px] transition-[color] duration-200 hover:text-ed-muted", FOCUS)}
          >
            {item.title}
          </Link>
        </h3>

        {item.summary ? (
          <p className="text-[14px] font-light leading-[1.5] text-ed-muted">{item.summary}</p>
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ed-label">
          {source.name ? <span className="truncate">{source.name}</span> : null}
          {source.name && date ? <span aria-hidden="true">·</span> : null}
          {date ? <time dateTime={item.published_at}>{date}</time> : null}
          <Link
            to={href}
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-ed-text underline decoration-ed-line-strong underline-offset-[3px] transition-[text-decoration-color] duration-200 hover:decoration-ed-text",
              FOCUS
            )}
          >
            Explore
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}