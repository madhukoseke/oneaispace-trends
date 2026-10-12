import { useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTagFacets } from "@/hooks/useDiscovery";
import { cn } from "@/lib/utils";

// Tags are cross-trend descriptors, so they live in the one extra Filters
// surface rather than competing with format and source in the toolbar.
export default function TagFilterPopover({ query, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const tags = useTagFacets(query, open);

  const toggle = (tag) => {
    onChange(selected.includes(tag) ? selected.filter((entry) => entry !== tag) : [...selected, tag]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[7px] border border-ed-line bg-ed-surface px-3 text-[13px] outline-none",
            "transition-[border-color,background-color,color] duration-200",
            "hover:border-ed-line-soft hover:bg-ed-surface-hover",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text",
            selected.length ? "text-ed-text" : "text-ed-muted hover:text-ed-text"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Tags
          {selected.length ? <span className="tabular-nums">({selected.length})</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[280px] rounded-[10px] border-ed-line bg-ed-surface p-2 text-ed-text"
      >
        <p className="px-2 py-1 text-[11px] uppercase tracking-[0.09em] text-ed-label">Tags</p>
        {tags.length ? (
          <ul className="max-h-[300px] space-y-0.5 overflow-y-auto">
            {tags.map(([tag, count]) => {
              const active = selected.includes(tag);
              return (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => toggle(tag)}
                    aria-pressed={active}
                    className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left text-[13.5px] outline-none transition-[background-color] duration-200 hover:bg-ed-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text"
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border",
                        active ? "border-ed-text bg-ed-text text-ed-bg" : "border-ed-line"
                      )}
                    >
                      {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    </span>
                    <span className="truncate">{tag}</span>
                    <span className="ml-auto shrink-0 text-[12px] tabular-nums text-ed-label">
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 pb-2 text-[13px] text-ed-muted">No tags in this view.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}