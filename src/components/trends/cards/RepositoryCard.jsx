import CardShell from "./CardShell";
import CardKicker from "./CardKicker";
import CardTitle from "./CardTitle";
import CardFooter from "./CardFooter";
import SourceMedia from "./SourceMedia";
import VerificationLabel from "./VerificationLabel";
import { metricText, relativeTime } from "@/lib/trends";

// Repository items: owner/repository, its real description and metadata.
// Stars are a cumulative figure only - no growth is implied from one snapshot.
export default function RepositoryCard({ item, context }) {
  const owner = String(item.creator || "").trim();
  const shortName = owner && item.title.startsWith(`${owner}/`) ? item.title.slice(owner.length + 1) : item.title;
  const language = item.metrics ? item.metrics.language : "";
  const updated = relativeTime(item.published_at);

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
        <SourceMedia item={item} />
      </a>

      <div className="px-3.5 pt-3">
        <CardKicker item={item} context={context} />
        <CardTitle item={item} className="mt-1.5">
          {owner ? (
            <>
              <span className="text-muted-foreground">{owner}/</span>
              {shortName}
            </>
          ) : (
            item.title
          )}
        </CardTitle>
        <VerificationLabel item={item} className="mt-2" />
        {item.excerpt ? (
          <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}
      </div>

      <CardFooter
        item={item}
        meta={[metricText(item), language, updated ? `Updated ${updated}` : ""]}
      />
    </CardShell>
  );
}