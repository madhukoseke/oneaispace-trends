import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

// The page's identity and its one search field. The field matches item titles, which is
// exactly what the backend supports, and the helper line says so: nothing here implies
// semantic or full-content search.
export default function DiscoverHero({ title, description, query, onQueryChange }) {
  const [value, setValue] = useState(query);

  useEffect(() => { setValue(query); }, [query]);

  useEffect(() => {
    if (value === query) return undefined;
    const timer = setTimeout(() => onQueryChange(value), 300);
    return () => clearTimeout(timer);
  }, [value, query, onQueryChange]);

  return (
    <header>
      <h1 className="text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">{title}</h1>
      {description ? (
        <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}

      <div className="mt-6 max-w-2xl">
        <label htmlFor="trends-search" className="sr-only">
          Search item titles
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="trends-search"
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search titles"
            className="h-11 rounded-[9px] pl-10 pr-10 text-[15px]"
          />
          {value ? (
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[6px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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