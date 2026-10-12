import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

// The editorial masthead: the page identity set as a display line over its own backdrop, with
// the one search field beneath it. The field matches item titles, which is what the backend
// supports, and the helper line below says exactly that.
const HERO_BACKDROP =
  "https://media.base44.com/images/public/6acbde759fbac149634009ba/ce846fe4a_generated_f6e890ef.jpg";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-text";

export default function TrendsHeader({ title = "Trends", subtitle, query, onQueryChange }) {
  const [value, setValue] = useState(query);

  useEffect(() => { setValue(query); }, [query]);

  useEffect(() => {
    if (value === query) return undefined;
    const timer = setTimeout(() => onQueryChange(value), 300);
    return () => clearTimeout(timer);
  }, [value, query, onQueryChange]);

  return (
    <header className="relative overflow-hidden">
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <Image src={HERO_BACKDROP} alt="" className="h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-ed-bg/55 to-ed-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1160px] px-4 pb-16 pt-[72px] sm:px-6 lg:px-8">
        <h1 className="animate-fade-in text-[44px] font-semibold leading-none tracking-[-0.035em] opacity-0 [animation-delay:0.1s] sm:text-[58px] lg:text-[76px]">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-[18px] animate-fade-in text-[17px] font-light text-ed-muted opacity-0 [animation-delay:0.3s] lg:text-[19px]">
            {subtitle}
          </p>
        ) : null}

        <div className="mt-9 max-w-[640px] animate-fade-in opacity-0 [animation-delay:0.5s]">
          <label htmlFor="trends-search" className="sr-only">
            Search item titles
          </label>
          <div className="flex h-12 items-center gap-2.5 rounded-[8px] border border-ed-line bg-ed-surface px-3.5 transition-[border-color] duration-200 focus-within:border-ed-label">
            <Search className="h-4 w-4 shrink-0 text-ed-label" strokeWidth={2} aria-hidden="true" />
            <input
              id="trends-search"
              type="search"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Search AI developments and sources..."
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-ed-text outline-none placeholder:text-ed-label"
            />
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label="Clear search"
              className={cn(
                "grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[6px] text-ed-label transition-[color,background-color] duration-200 hover:bg-ed-line hover:text-ed-text",
                FOCUS
              )}
            >
              <X className="h-[14px] w-[14px]" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2.5 text-[12px] text-ed-label">Matches item titles in the catalogue.</p>
        </div>
      </div>
    </header>
  );
}