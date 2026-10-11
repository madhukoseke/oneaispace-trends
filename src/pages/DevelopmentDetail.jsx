import { Link, useParams } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DevelopmentEvidence from "@/components/trends/DevelopmentEvidence";
import AnalysisMethod from "@/components/trends/AnalysisMethod";
import useDevelopment from "@/hooks/useDevelopment";
import { calendarDate } from "@/lib/trends";

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <Link
        to="/trends"
        className="rounded-[4px] outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Trends
      </Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="text-foreground/80">Latest Developments</span>
    </nav>
  );
}

function Unavailable({ title, body, children }) {
  return (
    <div className="mt-4 rounded-[11px] border border-dashed border-border/70 px-6 py-14 text-center">
      <h1 className="text-[18px] font-medium">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

// One accepted development, in full: what the source said, the one-line summary stored for
// it, and the evidence behind it. Everything on this page comes from the public feed, which
// resolves the identifier through the same provenance checks the list applies; a development
// the feed will not project is reported as unavailable rather than read from an
// administrator-only entity. An explanation of why it matters is shown only when one is
// already stored - it is never generated or inferred here.
export default function DevelopmentDetail() {
  const { developmentId } = useParams();
  const { item, loading, unavailable, error, reload } = useDevelopment(developmentId);

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-14 pt-6 sm:px-6">
      <Breadcrumb />

      {loading ? (
        <div className="mt-5 space-y-3" aria-hidden="true">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-28 w-full rounded-[11px]" />
        </div>
      ) : unavailable ? (
        <Unavailable
          title="That development is not available"
          body="It is not in the published developments feed: the link may be outdated, or the development did not meet the feed's provenance and evidence requirements."
        >
          <Button asChild variant="outline" className="mt-5 h-9 rounded-[7px] border-border/70 text-[13.5px]">
            <Link to="/trends">Back to Trends</Link>
          </Button>
        </Unavailable>
      ) : error ? (
        <Unavailable
          title="That development could not be loaded"
          body="Something went wrong while loading this development. Try again."
        >
          <Button
            type="button"
            variant="outline"
            onClick={reload}
            className="mt-5 h-9 rounded-[7px] border-border/70 text-[13.5px]"
          >
            Retry
          </Button>
        </Unavailable>
      ) : (
        <article className="mt-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {item.event_type_label || item.kind_label ? (
              <span className="rounded-[4px] border border-border/70 px-1.5 py-[1px] font-medium text-foreground/70">
                {item.event_type_label || item.kind_label}
              </span>
            ) : null}
            {item.source && item.source.name ? <span>{item.source.name}</span> : null}
            {calendarDate(item.published_at) ? (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={item.published_at}>{calendarDate(item.published_at)}</time>
              </>
            ) : null}
          </div>

          <h1 className="mt-2.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">
            {item.title}
          </h1>

          {item.summary ? (
            <section aria-labelledby="development-summary" className="mt-5">
              <h2 id="development-summary" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Summary
              </h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-foreground/90">{item.summary}</p>
            </section>
          ) : null}

          {item.why_it_matters ? (
            <section aria-labelledby="development-why" className="mt-5">
              <h2 id="development-why" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Why it matters
              </h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-foreground/90">{item.why_it_matters}</p>
            </section>
          ) : null}

          <div className="mt-5">
            <DevelopmentEvidence item={item} />
          </div>

          <div className="mt-4">
            <AnalysisMethod support={item.support} />
          </div>

          {item.source && item.source.url ? (
            <p className="mt-5">
              <Button asChild className="h-9 rounded-[7px] text-[13.5px]">
                <a href={item.source.url} target="_blank" rel="noopener noreferrer">
                  Open original source
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Button>
            </p>
          ) : null}
        </article>
      )}
    </div>
  );
}