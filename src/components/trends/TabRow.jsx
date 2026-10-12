import { cn } from "@/lib/utils";

// Shared tab strip behind the format navigation: labelled pills, the chosen one carrying the
// inverted surface so the selection is legible at a glance.
export default function TabRow({ label, tabs, value, onChange, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {label ? (
        <span className="mr-1.5 text-[11px] uppercase tracking-[0.09em] text-ed-label">{label}</span>
      ) : null}

      <div
        role="tablist"
        aria-label={label}
        className="flex items-center gap-2.5 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value || "all"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] outline-none",
                "transition-[background-color,color,border-color] duration-200",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text",
                active
                  ? "border-ed-text bg-ed-text text-ed-bg"
                  : "border-ed-line text-ed-muted hover:border-ed-line-soft hover:text-ed-text"
              )}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span className={cn("text-[12px]", active ? "text-ed-count" : "text-ed-label")}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}