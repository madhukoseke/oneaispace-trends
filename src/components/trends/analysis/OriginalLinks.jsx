import { ExternalLink } from "lucide-react";
import { relativeTime } from "@/lib/trends";

// Straight to the source: the newest records in this trend, each linking to the
// page it was catalogued from.
export default function OriginalLinks({ items }) {
  if (!items || !items.length) {
    return <span className="text-muted-foreground">No items are catalogued in this trend yet.</span>;
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-1.5">
          <ExternalLink className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <a
              href={item.canonical_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.title}
            </a>
            <span className="text-muted-foreground">
              {" "}
              · {item.source} · {relativeTime(item.published_at)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}