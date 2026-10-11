import { cn } from "@/lib/utils";

export default function ItemAttribution({ item, className }) {
  const creator = String(item.creator || "").trim();
  const source = String(item.source || "").trim();
  const parts = [];
  if (creator && creator.toLowerCase() !== source.toLowerCase()) parts.push(creator);
  if (source) parts.push(source);
  if (!parts.length) return null;

  return (
    <span className={cn("block truncate text-[12.5px] leading-tight text-foreground/80", className)}>
      {parts.join(" · ")}
    </span>
  );
}