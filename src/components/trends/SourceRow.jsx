import SaveButton from "./SaveButton";
import VerificationLabel from "./cards/VerificationLabel";
import { cn } from "@/lib/utils";
import { FORMAT_DOT, FORMAT_NOUN, FORMAT_TONE, calendarDate, isHttpUrl } from "@/lib/trends";

// One source item as a stacked row: what it is and where it came from, its title (which opens
// the canonical original page), its stored excerpt, its publication date and the save action.
// Source-reported metrics are deliberately not shown, so nothing here implies a judgement this
// product has not made.
export default function SourceRow({ item }) {
  const href = isHttpUrl(item.canonical_url) ? item.canonical_url : "";
  const date = calendarDate(item.published_at);
  const noun = FORMAT_NOUN[item.format] || "";
  const source = String(item.source || "").trim();
  const tone = FORMAT_TONE[item.format] || "text-muted-foreground/85";
  const dot = FORMAT_DOT[item.format];
  const meta = [noun, source].filter(Boolean).join(" · ");

  return (
    <article className="rounded-[10px] border border-border/60 bg-card px-4 py-3.5 transition-colors duration-150 hover:border-border">
      {meta ? (
        <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/85">
          {dot ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" /> : null}
          {noun ? <span className={tone}>{noun}</span> : null}
          {noun && source ? <span aria-hidden="true">·</span> : null}
          {source ? <span className="truncate">{source}</span> : null}
        </p>
      ) : null}

      <h3 className="mt-1.5 text-[15px] font-medium leading-snug tracking-[-0.01em]">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.title}
          </a>
        ) : (
          <span className="line-clamp-2">{item.title}</span>
        )}
      </h3>

      {item.excerpt ? (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
      ) : null}

      <VerificationLabel item={item} className="mt-2" />

      <div className="mt-3 flex items-center justify-between gap-3">
        {date ? (
          <time dateTime={item.published_at} className="text-[12px] text-muted-foreground">
            {date}
          </time>
        ) : (
          <span aria-hidden="true" />
        )}
        <SaveButton item={item} />
      </div>
    </article>
  );
}