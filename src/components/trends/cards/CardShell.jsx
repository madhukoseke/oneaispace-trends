import { cn } from "@/lib/utils";

export default function CardShell({ children, className }) {
  return (
    <article
      className={cn(
        "group/card relative flex flex-col overflow-hidden rounded-[11px] border border-border/70 bg-card",
        "transition-colors duration-150 hover:border-border",
        className
      )}
    >
      {children}
    </article>
  );
}