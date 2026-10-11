// arXiv provider: newest submissions in cs.AI / cs.LG / cs.CL / cs.CV.
import { ARXIV, USER_AGENT } from "../sources.ts";
import { decodeEntities, clip, stripHtml } from "../normalize.ts";

function pickTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
}

export const arxivProvider = {
  key: "arxiv",
  label: "arXiv",
  defaultTrend: "research",
  async fetchItems() {
    const response = await fetch(ARXIV.query, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`arXiv responded ${response.status}`);
    const xml = await response.text();
    const blocks = xml.split(/<entry[\s>]/i).slice(1);

    const items = [];
    for (const block of blocks) {
      const title = pickTag(block, "title");
      const id = pickTag(block, "id");
      if (!title || !id) continue;
      const authors = Array.from(block.matchAll(/<name>([\s\S]*?)<\/name>/gi))
        .map((match) => stripHtml(match[1]))
        .filter(Boolean)
        .slice(0, ARXIV.maxAuthors);
      const categories = Array.from(block.matchAll(/<category[^>]*term="([^"]+)"/gi)).map((match) => match[1]);
      const abstract = clip(stripHtml(pickTag(block, "summary")), 260);
      const canonical = id.split("?")[0].replace("http://", "https://");

      items.push({
        title,
        excerpt: abstract,
        canonical_url: canonical,
        source: "arXiv",
        source_key: "arxiv",
        format: "research",
        creator: authors.length ? authors.join(", ") : "",
        published_at: pickTag(block, "published"),
        thumbnail_url: "",
        media_kind: "none",
        metric_label: "",
        metric_value: 0,
        metrics: { primary_category: categories[0] || "", categories: categories.slice(0, 3) },
        provenance_url: canonical,
        provenance_label: "arXiv abstract",
      });
    }
    return items;
  },
};