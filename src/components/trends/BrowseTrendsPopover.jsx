import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function BrowseTrendsPopover({ trends, activeSlug }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const filtered = trends.filter((trend) => trend.name.toLowerCase().includes(term.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[13px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-secondary/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Browse trends
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] rounded-[10px] p-2">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Find a trend"
          aria-label="Find a trend"
          className="mb-2 h-8 rounded-[6px] text-[13px]"
        />
        <ul className="max-h-[320px] space-y-0.5 overflow-y-auto">
          {filtered.map((trend) => (
            <li key={trend.slug}>
              <Link
                to={`/trends/${trend.slug}`}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-[7px] px-2 py-1.5 text-[13.5px] outline-none transition-colors duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                  trend.slug === activeSlug && "bg-secondary/70 font-medium"
                )}
              >
                <span className="truncate">{trend.name}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{trend.item_count}</span>
              </Link>
            </li>
          ))}
          {!filtered.length ? (
            <li className="px-2 py-3 text-[13px] text-muted-foreground">No trends match that.</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}