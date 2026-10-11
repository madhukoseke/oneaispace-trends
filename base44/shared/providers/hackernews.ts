// Hacker News provider: current top stories filtered to AI-relevant titles.
// Points and comment counts are the values the API reports, stored unchanged.
import { AI_KEYWORDS, HACKER_NEWS, USER_AGENT } from "../sources.ts";
import { decodeEntities, safeUrl } from "../normalize.ts";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

function isAiRelated(title) {
  const value = String(title || "").toLowerCase();
  return AI_KEYWORDS.some((keyword) =>
    keyword instanceof RegExp ? keyword.test(value) : value.includes(keyword)
  );
}

export const hackerNewsProvider = {
  key: "hacker-news",
  label: "Hacker News",
  defaultTrend: "industry",
  async fetchItems() {
    const ids = await fetchJson(HACKER_NEWS.topStories);
    const pool = (Array.isArray(ids) ? ids : []).slice(0, 96);
    const stories = [];

    for (let index = 0; index < pool.length; index += 6) {
      if (stories.length >= HACKER_NEWS.maxStories) break;
      const batch = pool.slice(index, index + 6);
      const results = await Promise.allSettled(
        batch.map((id) => fetchJson(`${HACKER_NEWS.item}${id}.json`))
      );
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const story = result.value;
        if (!story.title || story.deleted || story.dead) continue;
        if (!isAiRelated(story.title)) continue;
        stories.push(story);
        if (stories.length >= HACKER_NEWS.maxStories) break;
      }
    }

    return stories.map((story) => {
      const thread = `https://news.ycombinator.com/item?id=${story.id}`;
      const external = safeUrl(story.url);
      return {
        title: decodeEntities(story.title),
        excerpt: story.text ? decodeEntities(String(story.text).replace(/<[^>]+>/g, " ")) : "",
        canonical_url: external || thread,
        source: "Hacker News",
        source_key: "hacker-news",
        format: "post",
        creator: story.by || "",
        published_at: story.time ? new Date(story.time * 1000).toISOString() : "",
        thumbnail_url: "",
        media_kind: "none",
        metric_label: "points",
        metric_value: Number(story.score) || 0,
        metrics: {
          points: Number(story.score) || 0,
          comments: Number(story.descendants) || 0,
          external_url: external || "",
        },
        provenance_url: thread,
        provenance_label: "Hacker News thread",
      };
    });
  },
};