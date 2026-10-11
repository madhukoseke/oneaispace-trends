import { ExternalLink } from "lucide-react";
import ItemAttribution from "./ItemAttribution";
import SaveButton from "../SaveButton";

// The footer follows the card's own content instead of being pushed to a fixed
// bottom, so a short card stays short. Repository cards drop the creator line,
// which the card already shows, and add an explicit link to the original page.
export default function CardFooter({ item, meta = [], hideAttribution = false, showSource = false }) {
  const details = meta.filter(Boolean);

  return (
    <div className="flex items-end justify-between gap-2 border-t border-border/60 px-3.5 pb-2 pt-2.5">
      <div className="min-w-0">
        {hideAttribution ? null : <ItemAttribution item={item} />}
        {details.length ? (
          <p className="mt-0.5 truncate text-[12px] leading-tight text-muted-foreground">{details.join(" · ")}</p>
        ) : null}
        {showSource ? (
          <a
            href={item.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[4px] text-[12px] leading-tight text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.source || "Original"}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <SaveButton item={item} className="-mb-1" />
    </div>
  );
}