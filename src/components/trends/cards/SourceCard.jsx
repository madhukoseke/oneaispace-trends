import { Play } from "lucide-react";
import CardShell from "./CardShell";
import SourceMedia from "./SourceMedia";
import VerificationLabel from "./VerificationLabel";
import SaveButton from "../SaveButton";
import { FORMAT_NOUN, calendarDate, isHttpUrl } from "@/lib/trends";

// One hierarchy for every source item, whatever its format: an optional source-supplied
// preview, what it is, the source it came from, its title, its stored excerpt, its
// publication date and the save action. The card's own action opens the canonical original
// page. Source-reported metrics are deliberately not shown, so nothing on the card implies a
// judgement this product has not made.
export default function SourceCard({ item }) {
  const href = isHttpUrl(item.canonical_url) ? item.canonical_url : "";
  const date = calendarDate(item.published_at);
  const meta = [FORMAT_NOUN[item.format] || "", String(item.source || "").trim()].filter(Boolean);
  // A repository's own preview repeats its name and description, so it is not shown.
  const showMedia = item.format !== "project";

  return (
    <CardShell>
      {showMedia ? (
        <SourceMedia item={item}>
          {item.format === "video" ? (
            <span className="absolute bottom-2 left-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            </span>
          ) : null}
        </SourceMedia>
      ) : null}

      <div className="px-3.5 pt-3.5">
        {meta.length ? (
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/85">
            {meta.join(" · ")}
          </p>
        ) : null}

        <h3 className="mt-1.5 text-[16px] font-medium leading-snug tracking-[-0.01em]">
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
          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}

        <VerificationLabel item={item} className="mt-2" />
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 px-3.5 pb-2 pt-3">
        <p className="min-w-0 text-[12px] leading-tight text-muted-foreground">
          {date ? <time dateTime={item.published_at}>{date}</time> : null}
        </p>
        <SaveButton item={item} className="-mb-1" />
      </div>
    </CardShell>
  );
}