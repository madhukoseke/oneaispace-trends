// Anthropic (Claude) newsroom provider: the feed Anthropic does not publish.
//
// Anthropic publishes no RSS or Atom feed, so this app had no way to catalogue Claude at all.
// This provider reads the one surface that carries the same fields a feed would: the newsroom
// list at https://www.anthropic.com/news. Every value is read from that page - the entry's own
// link, the heading the page shows, the date the page states and the summary paragraph it
// publishes. Nothing is composed and no image is invented where the page shows none. An entry
// whose date the page does not state is dropped rather than dated by the clock: a publication
// timestamp this app invented would be a fabricated field.
//
// The newsroom is server-rendered. Each entry is one anchor carrying a <time> element, a title
// element, and on the featured entries a summary paragraph.
import { FEED_MAX_AGE_DAYS, FEED_MAX_ITEMS, USER_AGENT } from "../sources.ts";
import { decodeEntities, clip, stripHtml, safeUrl } from "../normalize.ts";

const NEWSROOM_URL = "https://www.anthropic.com/news";
const NEWSROOM_ORIGIN = "https://www.anthropic.com";
const TITLE_PATTERN = /<(?:h[1-6]|span)[^>]*__(?:featured)?title[^>]*>([\s\S]*?)<\/(?:h[1-6]|span)>/i;
const HEADING_PATTERN = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i;
const BODY_PATTERN = /<p[^>]*__body[^>]*>([\s\S]*?)<\/p>/i;

function readText(block, pattern) {
  const match = block.match(pattern);
  if (!match) return "";
  return decodeEntities(stripHtml(match[1])).replace(/\s+/g, " ").trim();
}

// Deterministic: the same page always yields the same entries, in the order the page lists them,
// each entry at most once.
export function parseNewsroom(html) {
  const cutoff = Date.now() - FEED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const entries = [];
  const seen = new Set();

  for (const anchor of html.match(/<a\s[^>]*href="[^"]+"[^>]*>[\s\S]*?<\/a>/gi) || []) {
    if (entries.length >= FEED_MAX_ITEMS) break;

    const inner = anchor.replace(/^<a\s[^>]*>/i, "").replace(/<\/a>$/i, "");
    const dateText = readText(inner, /<time[^>]*>([\s\S]*?)<\/time>/i);
    if (!dateText) continue;
    const timestamp = Date.parse(dateText);
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;

    const href = (anchor.match(/<a\s[^>]*href="([^"]+)"/i) || [])[1] || "";
    const link = safeUrl(/^https?:/i.test(href) ? href : `${NEWSROOM_ORIGIN}${href}`);
    if (!link || !link.startsWith(NEWSROOM_ORIGIN)) continue;

    const title = readText(inner, TITLE_PATTERN) || readText(inner, HEADING_PATTERN);
    if (title.length < 12) continue;

    const canonical = link.replace(/[?#].*$/, "");
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    entries.push({
      title: clip(title, 200),
      excerpt: clip(readText(inner, BODY_PATTERN), 260),
      canonical_url: canonical,
      source: "Anthropic",
      source_key: "anthropic",
      format: "article",
      creator: "",
      published_at: new Date(timestamp).toISOString(),
      thumbnail_url: "",
      media_kind: "none",
      metric_label: "",
      metric_value: 0,
      metrics: { feed_kind: "Lab blog" },
      provenance_url: canonical,
      provenance_label: "Anthropic announcement",
    });
  }

  return entries;
}

async function fetchNewsroom() {
  const response = await fetch(NEWSROOM_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`anthropic newsroom responded ${response.status}`);
  const html = await response.text();
  return parseNewsroom(html).filter((item) => item.canonical_url);
}

export const anthropicProvider = {
  key: "anthropic",
  label: "Anthropic",
  defaultTrend: "frontier-models",
  fetchItems: fetchNewsroom,
};