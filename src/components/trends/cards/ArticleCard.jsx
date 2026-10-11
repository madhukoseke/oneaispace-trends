import CardShell from "./CardShell";
import CardKicker from "./CardKicker";
import CardTitle from "./CardTitle";
import CardFooter from "./CardFooter";
import SourceMedia from "./SourceMedia";
import VerificationLabel from "./VerificationLabel";
import { metricText, relativeTime } from "@/lib/trends";

// Articles and papers. A cover appears only when the source supplies one; the
// excerpt is item-specific and never repeats the parent trend description.
export default function ArticleCard({ item, context }) {
  return (
    <CardShell>
      <SourceMedia item={item}>
        <a
          href={item.canonical_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="sr-only">{item.title}</span>
        </a>
      </SourceMedia>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 pt-3">
        <CardKicker item={item} context={context} />
        <CardTitle item={item} className="mt-1.5" />
        <VerificationLabel item={item} className="mt-2" />
        {item.excerpt ? (
          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}
      </div>

      <CardFooter item={item} meta={[metricText(item), relativeTime(item.published_at)]} />
    </CardShell>
  );
}