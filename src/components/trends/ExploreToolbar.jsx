import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TagFilterPopover from "./TagFilterPopover";
import ActiveFilters from "./ActiveFilters";
import { SORT_OPTIONS } from "@/lib/trends";
import { cn } from "@/lib/utils";

const TRIGGER = "h-9 w-full gap-1.5 rounded-[7px] border-border/70 px-2.5 text-[13px] shadow-none";

// The catalogue's one control row: the result count, a single Filters disclosure, and the
// chips for whatever is active. Source, topic, sort and tags live inside the panel so the
// section opens on content rather than on a wall of controls. Format stays above this row,
// because it is the content-type navigation rather than a refinement.
export default function ExploreToolbar({ state, facets, total, topics = [], onParam, onReset, tagQuery }) {
  const [open, setOpen] = useState(false);

  const sources = (facets.sources || []).map((row) => row.source).filter(Boolean);
  const topicOptions = (topics || []).filter(Boolean);
  const activeCount = [
    state.source !== "all",
    Boolean(state.topic),
    state.tags.length > 0,
    state.sort !== "trending",
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="explore-filters"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] border border-border/70 px-3 text-[13px] outline-none transition-colors duration-150",
            "hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring",
            activeCount ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Filters
          {activeCount ? <span className="tabular-nums">({activeCount})</span> : null}
        </button>

        <p className="text-[12.5px] tabular-nums text-muted-foreground">
          {total} {total === 1 ? "item" : "items"}
        </p>
      </div>

      {open ? (
        <div
          id="explore-filters"
          className="grid grid-cols-1 gap-2 rounded-[10px] border border-border/70 bg-surface/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {topicOptions.length > 1 ? (
            <Select value={state.topic || "all"} onValueChange={(value) => onParam({ topic: value })}>
              <SelectTrigger className={TRIGGER} aria-label="Filter by topic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px] rounded-[10px]">
                <SelectItem value="all">Topic: All</SelectItem>
                {topicOptions.map((topic) => (
                  <SelectItem key={topic.value} value={topic.value}>
                    {topic.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

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
        </div>
      ) : null}

      <ActiveFilters state={state} onParam={onParam} onReset={onReset} />
    </div>
  );
}