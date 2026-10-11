import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRIMARY_CATEGORIES } from "@/lib/categories";

const ITEM =
  "relative inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-b-2 border-transparent px-0 py-2.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring";
const IDLE = "text-muted-foreground hover:text-foreground";
const ACTIVE = "border-brand font-medium text-foreground";

// Compact category row: a quiet text row with an underline for the active selection. Every
// label maps to existing trend identifiers (see lib/categories.js) and the categories the
// primary row does not carry sit in More rather than in a second navigation system.
export default function CategoryNav({ value, onChange, more = [] }) {
  const [open, setOpen] = useState(false);
  const active = String(value || "all");
  const selected = more.find((trend) => trend.slug === active);

  const handleSelect = (next) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <nav aria-label="Browse by category" className="flex items-center gap-6 overflow-x-auto">
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
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[250px] rounded-[10px] border-border/70 p-1.5">
            <ul className="max-h-[320px] space-y-0.5 overflow-y-auto">
              {more.map((trend) => (
                <li key={trend.slug}>
                  <button
                    type="button"
                    onClick={() => handleSelect(trend.slug)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-[7px] px-2 py-1.5 text-left text-[13px] outline-none transition-colors duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                      trend.slug === active && "bg-secondary/70 font-medium"
                    )}
                  >
                    <span className="truncate">{trend.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
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