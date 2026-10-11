import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

// Compact heading with page-local title search beside it (below it on mobile).
export default function TrendsHeader({ title, description, query, onQueryChange, meta, children }) {
  const [value, setValue] = useState(query);

  useEffect(() => { setValue(query); }, [query]);

  useEffect(() => {
    if (value === query) return undefined;
    const timer = setTimeout(() => onQueryChange(value), 300);
    return () => clearTimeout(timer);
  }, [value, query, onQueryChange]);

  return (
    <header>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <div className="w-full shrink-0 lg:w-[280px]">
          <label htmlFor="trends-search" className="sr-only">
            Search item titles
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="trends-search"
              type="search"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Search titles"
              className="h-9 rounded-[7px] pl-8 pr-8 text-[14px]"
            />
            {value ? (
              <button
                type="button"
                onClick={() => setValue("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-[5px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {meta ? <div className="mt-2.5">{meta}</div> : null}
      {children}
    </header>
  );
}