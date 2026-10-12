import { useState } from "react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { isHttpUrl } from "@/lib/trends";

// Renders the source's own preview image. When there is none, or it fails to
// load, the card simply stays media-free rather than showing stand-in artwork.
export default function SourceMedia({ item, className, children }) {
  const [failed, setFailed] = useState(false);
  const src = isHttpUrl(item.thumbnail_url) ? item.thumbnail_url : "";
  if (!src || failed) return null;

  // One ratio for every preview, so cards in a grid line up: a portrait source is cropped to the
  // same 16:9 frame rather than given a column of its own.
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-ed-surface",
        "aspect-video",
        className
      )}
    >
      <Image
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      {children}
    </div>
  );
}