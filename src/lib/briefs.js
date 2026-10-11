// The two homepage feature sections, derived from records that are already
// stored. Nothing is fetched here and nothing is invented.
//
// A brief is a record whose publisher the registry confirms (Official) or a
// paper (Research). A development is a versioned identifier that records from
// more than one source actually carry - never a shared term such as GPT, agents
// or research, and never a grouping inferred from vocabulary alone.

import { itemProvenance } from "./provenance";
import { specificEntities } from "./entities";

const HOUR = 3600000;

const BRIEF_MAX = 3;
const BRIEF_MIN = 2;
const BRIEF_PER_SOURCE = 2;
const BRIEF_SHORT_WINDOW_HOURS = 72;
const BRIEF_LONG_WINDOW_HOURS = 24 * 7;

const DEVELOPMENT_MAX = 5;
const DEVELOPMENT_MIN_ITEMS = 2;
const DEVELOPMENT_MIN_SOURCES = 2;
const DEVELOPMENT_SHORT_WINDOW_HOURS = 24;
const DEVELOPMENT_LONG_WINDOW_HOURS = 72;

function ageHours(item, now) {
  const timestamp = Date.parse(item.published_at || "");
  if (!Number.isFinite(timestamp)) return Infinity;
  return Math.max(0, (now - timestamp) / HOUR);
}

function newestFirst(a, b) {
  return Date.parse(b.published_at || "") - Date.parse(a.published_at || "");
}

function sourceNames(items) {
  return [...new Set(items.map((item) => item.source).filter(Boolean))];
}

function dominantTrend(items) {
  const tally = new Map();
  for (const item of items) {
    if (item.trend_slug) tally.set(item.trend_slug, (tally.get(item.trend_slug) || 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked.length ? ranked[0][0] : "";
}

// First-party publishers first, then papers, newest first inside each group. No
// source may fill the section, and no more than three records are shown.
export function selectBriefs(items, now = Date.now()) {
  const candidates = (items || [])
    .filter((item) => {
      const { kind } = itemProvenance(item);
      if (kind !== "official" && kind !== "researcher") return false;
      return ageHours(item, now) <= BRIEF_LONG_WINDOW_HOURS;
    })
    .sort((a, b) => {
      const rank = (item) => (itemProvenance(item).kind === "official" ? 0 : 1);
      return rank(a) - rank(b) || newestFirst(a, b);
    });

  const recent = candidates.filter((item) => ageHours(item, now) <= BRIEF_SHORT_WINDOW_HOURS);
  const wide = recent.length < BRIEF_MIN;
  const pool = wide ? candidates : recent;

  const picks = [];
  const perSource = new Map();
  for (const item of pool) {
    if (picks.length >= BRIEF_MAX) break;
    const key = item.source_key || item.source;
    const used = perSource.get(key) || 0;
    if (used >= BRIEF_PER_SOURCE) continue;
    perSource.set(key, used + 1);
    picks.push(item);
  }

  return { items: picks, window: wide ? "7 days" : "72 hours" };
}

// Only versioned identifiers group records. A record that carries none of them
// cannot contribute to a development, which is what keeps standing terms out.
function gather(items, featured) {
  const groups = new Map();

  const add = (key, title, item) => {
    const group = groups.get(key) || { key, title, items: [] };
    if (!group.items.some((existing) => existing.id === item.id)) group.items.push(item);
    groups.set(key, group);
  };

  for (const item of items) {
    for (const name of specificEntities(item)) add(`entity:${name.toLowerCase()}`, name, item);
  }

  const developments = [];
  for (const group of groups.values()) {
    if (group.items.length < DEVELOPMENT_MIN_ITEMS) continue;
    const sources = sourceNames(group.items);
    if (sources.length < DEVELOPMENT_MIN_SOURCES) continue;
    if (!group.items.some((item) => !featured.has(item.id))) continue;
    const trendSlug = dominantTrend(group.items);
    if (!trendSlug) continue;
    developments.push({
      key: group.key,
      title: group.title,
      items: group.items.slice().sort(newestFirst),
      sources,
      trendSlug,
    });
  }

  developments.sort(
    (a, b) =>
      b.sources.length - a.sources.length ||
      b.items.length - a.items.length ||
      newestFirst(a.items[0], b.items[0])
  );

  return developments.slice(0, DEVELOPMENT_MAX);
}

// A rolling 24 hour window, widened to 72 hours only when the day is too thin to
// show anything. Nothing is ever padded out with records that do not qualify: an
// empty result means the section is not shown at all.
export function buildDevelopments(items, { now = Date.now(), featured = [] } = {}) {
  const shown = new Set(featured);
  const pool = (items || []).filter((item) => ageHours(item, now) <= DEVELOPMENT_LONG_WINDOW_HOURS);

  const day = pool.filter((item) => ageHours(item, now) <= DEVELOPMENT_SHORT_WINDOW_HOURS);
  const short = gather(day, shown);
  if (short.length >= 3) return { clusters: short, window: "24 hours" };

  return { clusters: gather(pool, shown), window: "72 hours" };
}