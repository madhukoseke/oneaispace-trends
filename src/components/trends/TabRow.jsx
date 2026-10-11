import { cn } from "@/lib/utils";

// Shared compact tab strip behind the format navigation and the topic navigation.
export default function TabRow({ label, tabs, value, onChange, className }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-center gap-1 overflow-x-auto", className)}>
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
              "shrink-0 rounded-[7px] px-2.5 py-1 text-[13.5px] outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="ml-1.5 text-[11.5px] tabular-nums text-muted-foreground/80">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}