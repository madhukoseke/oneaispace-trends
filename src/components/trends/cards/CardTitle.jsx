import { cn } from "@/lib/utils";
import { isHttpUrl } from "@/lib/trends";

export default function CardTitle({ item, className, children }) {
  const content = children || item.title;
  const href = isHttpUrl(item.canonical_url) ? item.canonical_url : "";

  if (!href) {
    return (
      <h3 className={cn("line-clamp-2 text-[16px] font-medium leading-snug tracking-[-0.01em]", className)}>
        {content}
      </h3>
    );
  }

  return (
    <h3 className={cn("text-[16px] font-medium leading-snug tracking-[-0.01em]", className)}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="line-clamp-2 rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </a>
    </h3>
  );
}