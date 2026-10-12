import { cn } from "@/lib/utils";

export default function CardShell({ children, className }) {
  return (
    <article
      className={cn(
        "group/card relative flex flex-col overflow-hidden rounded-[12px] border border-ed-line bg-ed-surface",
        "shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-200",
        "hover:border-ed-line-card hover:shadow-[0_22px_44px_-22px_rgba(0,0,0,0.95)]",
        className
      )}
    >
      {children}
    </article>
  );
}