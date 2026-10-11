import { X } from "lucide-react";
import { activeFilterChips } from "@/lib/discovery";

// Chips appear only for the extra filters that are actually active.
export default function ActiveFilters({ state, onParam, onReset }) {
  const chips = activeFilterChips(state);
  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.value || chip.label}`}
          type="button"
          onClick={() =>
            chip.key === "q"
              ? onParam({ q: "" })
              : onParam({ tags: state.tags.filter((tag) => tag !== chip.value) })
          }
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/70 px-2 py-1 text-[12.5px] text-foreground/85 outline-none transition-colors duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chip.label}
          <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Remove this filter</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="rounded-[6px] px-1.5 py-1 text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear all
      </button>
    </div>
  );
}