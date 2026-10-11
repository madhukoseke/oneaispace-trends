import { Link } from "react-router-dom";

// Which sources this trend's records actually came from, linked into the same
// trend filtered by that source. The numbers are record counts, nothing more.
export default function TrendSources({ slug, sources }) {
  if (!sources || !sources.length) {
    return <span className="text-muted-foreground">No sources are catalogued in this trend yet.</span>;
  }

  return (
    <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {sources.map((row) => (
        <li key={row.source}>
          <Link
            to={`/trends/${slug}?source=${encodeURIComponent(row.source)}`}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/70 px-1.5 py-[3px] text-[12px] text-muted-foreground outline-none transition-colors duration-150 hover:border-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.source}
            <span className="tabular-nums text-muted-foreground/70">{row.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}