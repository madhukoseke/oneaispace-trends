import { Play } from "lucide-react";
import CardShell from "./CardShell";
import CardKicker from "./CardKicker";
import CardTitle from "./CardTitle";
import CardFooter from "./CardFooter";
import SourceMedia from "./SourceMedia";
import VerificationLabel from "./VerificationLabel";
import { metricText, relativeTime } from "@/lib/trends";

function durationLabel(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (!total) return "";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Video and visual-demo items. The source's own thumbnail carries the card, and
// the play affordance and duration appear only when the source provides them.
export default function MediaCard({ item, context }) {
  const length = durationLabel(item.duration_seconds);

  return (
    <CardShell>
      <a
        href={item.canonical_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden="true"
        tabIndex={-1}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <SourceMedia item={item}>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/45 to-transparent" />
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
              <Play className="h-3 w-3 fill-current" aria-hidden="true" />
            </span>
            {length ? (
              <span className="rounded-[5px] bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                {length}
              </span>
            ) : null}
          </span>
        </SourceMedia>
      </a>

      <div className="px-3.5 pt-3">
        <CardKicker item={item} context={context} />
        <CardTitle item={item} className="mt-1.5" />
        <VerificationLabel item={item} className="mt-2" />
      </div>

      <CardFooter item={item} meta={[metricText(item), relativeTime(item.published_at)]} />
    </CardShell>
  );
}