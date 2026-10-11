import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { useSaves } from "@/hooks/useSaves";
import SaveButton from "@/components/trends/SaveButton";
import { FORMAT_NOUN, relativeTime } from "@/lib/trends";

// Saved items are private to the visitor who saved them. Rows render from the
// save record itself, so no extra catalogue reads happen here.
export default function Saved() {
  const { saves, signedIn } = useSaves();
  const entries = [...saves.values()].filter((entry) => entry.item_id);
  const loading = signedIn === null;

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-6 sm:px-6 lg:px-10">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">Saved</h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        Items you keep for later. Only you can see this list.
      </p>

      <div className="mt-6 border-t border-border/70">
        {loading ? (
          <p className="py-10 text-[13.5px] text-muted-foreground">Loading your saved items...</p>
        ) : signedIn === false ? (
          <div className="py-12 text-center">
            <Bookmark className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-[15px] font-medium">Sign in to keep a saved list</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Saving is per account, so this list appears once you are signed in.
            </p>
          </div>
        ) : entries.length ? (
          <ul>
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 border-b border-border/60 py-3.5">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/85">
                    {FORMAT_NOUN[entry.item_format] || "Item"}
                    {entry.item_source ? ` · ${entry.item_source}` : ""}
                  </p>
                  <h2 className="mt-1 text-[15px] font-medium leading-snug tracking-[-0.01em]">
                    <a
                      href={entry.item_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 rounded-[4px] outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {entry.item_title}
                    </a>
                  </h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">Saved {relativeTime(entry.created_date)}</p>
                </div>
                <SaveButton item={{ id: entry.item_id, title: entry.item_title }} className="-mr-1" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-12 text-center">
            <p className="text-[15px] font-medium">Nothing saved yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Use the bookmark control on any item to keep it here.
            </p>
            <Link
              to="/trends"
              className="mt-4 inline-block rounded-[7px] text-[13.5px] text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Browse Trends
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}