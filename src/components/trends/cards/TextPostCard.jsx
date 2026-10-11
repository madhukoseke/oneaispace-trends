import CardShell from "./CardShell";
import CardKicker from "./CardKicker";
import CardTitle from "./CardTitle";
import CardFooter from "./CardFooter";
import VerificationLabel from "./VerificationLabel";
import { metricText, relativeTime } from "@/lib/trends";

// Discussions and text posts: compact, with no empty media area. The title is
// the item's own content, so no parent summary is repeated here.
export default function TextPostCard({ item, context }) {
  return (
    <CardShell>
      <div className="px-3.5 pt-3.5">
        <CardKicker item={item} context={context} />
        <CardTitle item={item} className="mt-1.5 line-clamp-3" />
        <VerificationLabel item={item} className="mt-2" />
        {item.excerpt ? (
          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : null}
      </div>

      <CardFooter
        item={item}
        meta={[metricText(item), item.metrics && item.metrics.comments ? `${item.metrics.comments} comments` : "", relativeTime(item.published_at)]}
      />
    </CardShell>
  );
}