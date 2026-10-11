import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TagFilterPopover from "./TagFilterPopover";
import ActiveFilters from "./ActiveFilters";
import { SORT_OPTIONS } from "@/lib/trends";

const TRIGGER = "h-8 w-auto gap-1 rounded-[7px] border-border/60 bg-card px-2.5 text-[13px] shadow-none";

// The catalogue's control row: source, topic and sort are visible controls rather than a
// hidden panel, because on a working surface the filters are the point. Tags keep their own
// popover, the result count sits at the end of the row, and whatever is active appears as a
// chip underneath and can be cleared.
export default function ExploreToolbar({ state, facets, total, topics = [], onParam, onReset, tagQuery }) {
  const sources = (facets.sources || []).map((row) => row.source).filter(Boolean);
  const topicOptions = (topics || []).filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
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

        <p className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
          {total} {total === 1 ? "item" : "items"}
        </p>
      </div>

      <ActiveFilters state={state} onParam={onParam} onReset={onReset} />
    </div>
  );
}