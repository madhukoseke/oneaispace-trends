import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TagFilterPopover from "./TagFilterPopover";
import ActiveFilters from "./ActiveFilters";
import { SORT_OPTIONS } from "@/lib/trends";
import { hasActiveFilters } from "@/lib/discovery";
import { cn } from "@/lib/utils";

const TRIGGER = "h-8 w-auto min-w-0 gap-1.5 rounded-[7px] border-border/70 px-2.5 text-[13px] shadow-none";

// One compact row: source, sort, the extra Filters surface, and the result count.
export default function DiscoveryToolbar({ state, facets, total, onParam, onReset, tagQuery }) {
  const sources = (facets.sources || []).map((row) => row.source).filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={state.source} onValueChange={(value) => onParam({ source: value })}>
          <SelectTrigger className={TRIGGER} aria-label="Filter by source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[320px] rounded-[10px]">
            <SelectItem value="all">Source: All</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={state.sort} onValueChange={(value) => onParam({ sort: value })}>
          <SelectTrigger className={TRIGGER} aria-label="Sort results">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[10px]">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                Sort: {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TagFilterPopover
          query={tagQuery}
          selected={state.tags}
          onChange={(tags) => onParam({ tags })}
        />

        <p className="ml-auto flex items-center gap-3 text-[12.5px] text-muted-foreground">
          <span className="tabular-nums">
            {total} {total === 1 ? "item" : "items"}
          </span>
          {hasActiveFilters(state) ? (
            <button
              type="button"
              onClick={onReset}
              className={cn(
                "rounded-[6px] px-1 text-[12.5px] text-foreground/75 outline-none transition-colors duration-150",
                "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              Reset
            </button>
          ) : null}
        </p>
      </div>

      <ActiveFilters state={state} onParam={onParam} onReset={onReset} />
    </div>
  );
}