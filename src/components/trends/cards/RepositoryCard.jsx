import { Github, Star } from "lucide-react";
import CardShell from "./CardShell";
import CardKicker from "./CardKicker";
import CardFooter from "./CardFooter";
import VerificationLabel from "./VerificationLabel";
import { formatCount, relativeTime } from "@/lib/trends";

// Compact repository card: one name, one owner, one description of at most three
// lines, and at most three source-reported facts. The repository's own preview
// image is not used, because it repeats the name and description and carries an
// unexplained language bar. Stars are a cumulative snapshot, so no growth is
// implied by them.
export default function RepositoryCard({ item, context }) {
  const owner = String(item.creator || "").trim();
  const shortName =
    owner && item.title.startsWith(`${owner}/`) ? item.title.slice(owner.length + 1) : item.title;
  const metrics = item.metrics || {};
  const language = metrics.language || "";
  const stars = Number(metrics.stars || item.metric_value || 0);
  const updated = relativeTime(item.published_at);

  return (
    <CardShell>
      <div className="flex flex-col px-3.5 pt-3.5">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <CardKicker item={item} context={context} />
        </div>

        <h3 className="mt-2 text-[16px] font-medium leading-snug tracking-[-0.01em]">
          <a
            href={item.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          >
            {shortName}
          </a>
        </h3>

        {owner ? <p className="mt-1 truncate text-[12.5px] text-muted-foreground">{owner}</p> : null}

        {item.excerpt ? (
          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}

        <VerificationLabel item={item} className="mt-2" />

        {stars || language || updated ? (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            {stars ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                {formatCount(stars)} stars
              </span>
            ) : null}
            {language ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{language}</span>
              </>
            ) : null}
            {updated ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Updated {updated}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <CardFooter item={item} hideAttribution showSource />
    </CardShell>
  );
}