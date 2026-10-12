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
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-ed-line px-2 py-1 text-[12.5px] text-ed-text/85 outline-none transition-[background-color] duration-200 hover:bg-ed-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text"
        >
          {chip.label}
          <X className="h-3 w-3 text-ed-label" aria-hidden="true" />
          <span className="sr-only">Remove this filter</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="rounded-[6px] px-1.5 py-1 text-[12.5px] text-ed-label outline-none transition-[color] duration-200 hover:text-ed-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text"
      >
        Clear all
      </button>
    </div>
  );
}