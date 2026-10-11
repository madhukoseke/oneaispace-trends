// Blog/news provider: RSS and Atom feeds from AI labs, platforms and publications.
// Feeds are independent - one failing feed never blocks the rest.
import { FEED_MAX_AGE_DAYS, FEED_MAX_ITEMS, RSS_FEEDS, USER_AGENT } from "../sources.ts";
import { decodeEntities, clip, stripHtml, safeUrl } from "../normalize.ts";

function pickTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : "";
}

function pickImage(block) {
  const enclosure = block.match(/<enclosure[^>]*>/i);
  if (enclosure && /image|jpe?g|png|webp|avif/i.test(enclosure[0])) {
    const url = enclosure[0].match(/url="([^"]+)"/i);
    if (url) return url[1];
  }
  const media = block.match(/<(?:media:content|media:thumbnail|itunes:image)[^>]*url="([^"]+)"/i);
  if (media) return media[1];
  const inline = block.match(/<img[^>]*src="([^"]+)"/i);
  return inline ? inline[1] : "";
}

// The feed's own descriptive fields, with no order assumed: where a feed publishes more than
// one, the longest is the richest description it actually published. Nothing is composed here -
// an empty description stays empty.
function pickRichestBody(block) {
  const candidates = ["content:encoded", "description", "summary", "content"]
    .map((tag) => stripHtml(pickTag(block, tag)))
    .filter((text) => text);
  if (!candidates.length) return "";
  return candidates.reduce((best, text) => (text.length > best.length ? text : best));
}

export function parseFeed(xml, feed) {
  const blocks = /<item[\s>]/i.test(xml)
    ? xml.split(/<item[\s>]/i).slice(1)
    : xml.split(/<entry[\s>]/i).slice(1);

  const cutoff = Date.now() - FEED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const items = [];

  for (const block of blocks) {
    const title = decodeEntities(pickTag(block, "title")).replace(/\s+/g, " ").trim();
    if (!title) continue;

    let link = decodeEntities(pickTag(block, "link")).trim();
    if (!link || !link.startsWith("http")) {
      const atom = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) ||
        block.match(/<link[^>]*href="([^"]+)"/i);
      link = atom ? atom[1] : link;
    }

    const published =
      pickTag(block, "pubDate") || pickTag(block, "published") ||
      pickTag(block, "updated") || pickTag(block, "dc:date");
    const timestamp = Date.parse(decodeEntities(published).trim());
    if (Number.isFinite(timestamp) && timestamp < cutoff) continue;

    const body = pickRichestBody(block);
    const author = decodeEntities(
      pickTag(block, "dc:creator") || pickTag(block, "author") || pickTag(block, "name")
    ).replace(/\s+/g, " ").trim();

    items.push({
      title,
      excerpt: clip(body, 260),
      canonical_url: link,
      source: feed.label,
      source_key: feed.key,
      format: "article",
      creator: clip(author, 80),
      published_at: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
      thumbnail_url: safeUrl(decodeEntities(pickImage(block)).trim()),
      media_kind: "landscape",
      metric_label: "",
      metric_value: 0,
      metrics: { feed_kind: feed.kind },
      provenance_url: link,
      provenance_label: `${feed.label} article`,
    });
    if (items.length >= FEED_MAX_ITEMS) break;
  }
  return items;
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, text/xml" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${feed.key} responded ${response.status}`);
  const xml = await response.text();
  return parseFeed(xml, feed).filter((item) => item.canonical_url);
}

export const rssProvider = {
  key: "rss",
  label: "AI blogs & news",
  defaultTrend: "industry",
  async fetchItems() {
    const collected = [];
    const failures = [];
    for (let index = 0; index < RSS_FEEDS.length; index += 4) {
      const batch = RSS_FEEDS.slice(index, index + 4);
      const results = await Promise.allSettled(batch.map((feed) => fetchFeed(feed)));
      for (const result of results) {
        if (result.status === "fulfilled") collected.push(...result.value);
        else failures.push(String((result.reason && result.reason.message) || result.reason));
      }
    }
    if (!collected.length && failures.length) {
      throw new Error(`no feed returned items (${failures.slice(0, 3).join("; ")})`);
    }
    return collected;
  },
};