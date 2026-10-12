import { Play } from "lucide-react";
import CardShell from "./CardShell";
import SourceMedia from "./SourceMedia";
import VerificationLabel from "./VerificationLabel";
import SaveButton from "../SaveButton";
import { FORMAT_NOUN, calendarDate, isHttpUrl } from "@/lib/trends";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";

// One hierarchy for every source item, whatever its format: an optional source-supplied
// preview, what it is, the source it came from, its title, its stored excerpt, its
// publication date and the save action. The card's own action opens the canonical original
// page. Source-reported metrics are deliberately not shown, so nothing on the card implies a
// judgement this product has not made.
export default function SourceCard({ item }) {
  const href = isHttpUrl(item.canonical_url) ? item.canonical_url : "";
  const date = calendarDate(item.published_at);
  const meta = [FORMAT_NOUN[item.format] || "", String(item.source || "").trim()].filter(Boolean);
  // The descriptors the record itself carries, and only the first two, so the foot of the card
  // stays a line rather than a wall of chips.
  const tags = (Array.isArray(item.tags) ? item.tags : []).filter(Boolean).slice(0, 2);

  return (
    <CardShell>
      {/* Every format shows the preview its own source supplies, a repository included. A record
          with no supplied preview stays media-free rather than showing stand-in artwork. */}
      <SourceMedia item={item}>
        {item.format === "video" ? (
          <span className="absolute bottom-2 left-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </span>
        ) : null}
      </SourceMedia>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-[18px]">
        {meta.length ? (
          <p className="text-[11px] uppercase tracking-[0.09em] text-ed-label">{meta.join(" · ")}</p>
        ) : null}

        <h3 className="mb-2 mt-2.5 text-[20px] font-semibold leading-[1.25] tracking-[-0.015em] lg:text-[22px]">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`line-clamp-2 rounded-[4px] transition-[color] duration-200 hover:text-ed-muted ${FOCUS}`}
            >
              {item.title}
            </a>
          ) : (
            <span className="line-clamp-2">{item.title}</span>
          )}
        </h3>

        {item.excerpt ? (
          <p className="mb-[18px] line-clamp-3 text-[14px] font-light leading-[1.55] text-ed-muted">
            {item.excerpt}
          </p>
        ) : null}

        <VerificationLabel item={item} className="mb-4" />

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {date ? (
              <time dateTime={item.published_at} className="shrink-0 text-[12px] leading-tight text-ed-label">
                {date}
              </time>
            ) : null}
            {tags.length ? (
              <div className="flex min-w-0 items-center gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="truncate rounded-[4px] border border-ed-line px-2 py-[3px] text-[11px] uppercase tracking-[0.07em] text-ed-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <SaveButton item={item} />
        </div>
      </div>
    </CardShell>
  );
}