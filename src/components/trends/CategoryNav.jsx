import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRIMARY_CATEGORIES } from "@/lib/categories";

const ITEM =
  "relative inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-b-2 border-transparent py-3 text-[14px] outline-none transition-[color,border-color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";
const IDLE = "text-ed-label hover:text-ed-text";
const ACTIVE = "border-ed-text font-medium text-ed-text";

// Compact category row: a quiet text row with a rule under it and the active selection marked
// by the one bright underline. Every label maps to existing trend identifiers (see
// lib/categories.js) and the categories the primary row does not carry sit in More rather than
// in a second navigation system.
export default function CategoryNav({ value, onChange, more = [] }) {
  const [open, setOpen] = useState(false);
  const active = String(value || "all");
  const selected = more.find((trend) => trend.slug === active);

  const handleSelect = (next) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <nav
      aria-label="Browse by category"
      className="mb-8 flex items-center gap-7 overflow-x-auto border-b border-ed-line"
    >
      {PRIMARY_CATEGORIES.map((category) => {
        const isActive = category.id === active;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onChange(category.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(ITEM, isActive ? ACTIVE : IDLE)}
          >
            {category.label}
          </button>
        );
      })}

      {more.length ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              aria-current={selected ? "true" : undefined}
              className={cn(ITEM, selected ? ACTIVE : IDLE)}
            >
              {selected ? selected.name : "More"}
              <ChevronDown className="h-[13px] w-[13px]" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[250px] rounded-[10px] border-ed-line bg-ed-surface p-1.5 text-ed-text"
          >
            <ul className="max-h-[320px] space-y-0.5 overflow-y-auto">
              {more.map((trend) => (
                <li key={trend.slug}>
                  <button
                    type="button"
                    onClick={() => handleSelect(trend.slug)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-[7px] px-2 py-1.5 text-left text-[13.5px] outline-none transition-[background-color] duration-200 hover:bg-ed-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text",
                      trend.slug === active && "bg-ed-line font-medium"
                    )}
                  >
                    <span className="truncate">{trend.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-ed-label">
                      {trend.item_count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </nav>
  );
}