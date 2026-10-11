import { cn } from "@/lib/utils";
import { FORMAT_NOUN } from "@/lib/trends";

// Gives each card an honest format identity, plus the trend it sits in when the
// visitor is browsing across trends.
export default function CardKicker({ item, context, className }) {
  const parts = [FORMAT_NOUN[item.format] || "Item"];
  if (context) parts.push(context);

  return (
    <p className={cn("text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/85", className)}>
      {parts.join(" · ")}
    </p>
  );
}