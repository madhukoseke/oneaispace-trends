import EvidenceStatus from "../EvidenceStatus";
import OriginalLinks from "./OriginalLinks";
import TrendSources from "./TrendSources";
import { relativeTime } from "@/lib/trends";

function Row({ label, children }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-t border-border/60 py-3 first:border-t-0 first:pt-0 sm:grid-cols-[150px_1fr]">
      <dt className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-relaxed text-foreground/85">{children}</dd>
    </div>
  );
}

// What this trend holds, stated only as far as the stored records support it.
// Claim extraction and evidence evaluation arrive with the intelligence layer, so
// those rows say exactly that instead of guessing.
export default function TrendNotes({ trend, topics, signals, sources }) {
  const newest = (signals || [])[0] || null;
  const lead = (topics || []).slice().sort((a, b) => (b.item_count || 0) - (a.item_count || 0))[0] || null;

  return (
    <dl className="mt-4 border-y border-border/60 py-3.5">
      <Row label="What happened?">
        {newest ? (
          <>
            The most recent signal is “{newest.title}”, published by {newest.source} {relativeTime(newest.published_at)}.{" "}
            {trend.item_count} items from {sources.length} sources are catalogued in this trend.
          </>
        ) : (
          <>No items are catalogued in this trend yet.</>
        )}
      </Row>

      <Row label="Why it matters">
        Grouped from {sources.length} sources
        {lead ? <> and most active in {lead.name} ({lead.item_count} items)</> : null}. No interpretation is added in
        this phase.
      </Row>

      <Row label="Evidence and claims">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <EvidenceStatus prefix="" />
          <span>
            Claims are not extracted or evaluated yet, so nothing in this trend is marked supported, mixed or
            disputed, and agreement between models is never treated as proof.
          </span>
        </span>
      </Row>

      <Row label="Related sources">
        <TrendSources slug={trend.slug} sources={sources} />
      </Row>

      <Row label="Original links">
        <OriginalLinks items={signals} />
      </Row>
    </dl>
  );
}