import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

// Compact, left-aligned page identity with the search field directly beneath it. The field
// matches item titles, which is what the backend supports, and the helper line says so.
export default function TrendsHeader({ title = "Trends", subtitle, query, onQueryChange }) {
  const [value, setValue] = useState(query);

  useEffect(() => { setValue(query); }, [query]);

  useEffect(() => {
    if (value === query) return undefined;
    const timer = setTimeout(() => onQueryChange(value), 300);
    return () => clearTimeout(timer);
  }, [value, query, onQueryChange]);

  return (
    <header>
      <h1 className="text-[21px] font-medium tracking-[-0.015em]">{title}</h1>
      {subtitle ? <p className="mt-1 text-[13.5px] text-muted-foreground">{subtitle}</p> : null}

      <div className="mt-5 max-w-[680px]">
        <label htmlFor="trends-search" className="sr-only">
          Search item titles
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="trends-search"
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search AI developments and sources..."
            className="h-10 rounded-[8px] border-border/70 bg-card pl-9 pr-9 text-[14px] shadow-none"
          />
          {value ? (
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-[6px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Matches item titles in the catalogue.</p>
      </div>
    </header>
  );
}