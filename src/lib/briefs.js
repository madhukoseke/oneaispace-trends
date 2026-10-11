// The two homepage feature sections, derived from records that are already
// stored. Nothing is fetched here, and nothing is invented: a brief is an
// official or research record that exists, and a development is either a named
// model, tool or technique or a term that more than one record, from more than
// one source, actually mentions.

import { provenanceKind } from "./provenance";
import { entityNames } from "./entities";
import { subjectOf } from "./subjects";

const HOUR = 3600000;

const BRIEF_MAX = 4;
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

// Official organisation channels come first, then author-attributed research,
// newest first inside each group. A single source cannot fill the section.
export function selectBriefs(items, now = Date.now()) {
  const candidates = (items || [])
    .filter((item) => {
      const kind = provenanceKind(item.source_key);
      if (kind !== "official" && kind !== "researcher") return false;
      return ageHours(item, now) <= BRIEF_LONG_WINDOW_HOURS;
    })
    .sort((a, b) => {
      const rank = (item) => (provenanceKind(item.source_key) === "official" ? 0 : 1);
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

function gather(items, featured) {
  const groups = new Map();

  const add = (key, title, item) => {
    const group = groups.get(key) || { key, title, items: [] };
    if (!group.items.some((existing) => existing.id === item.id)) group.items.push(item);
    groups.set(key, group);
  };

  for (const item of items) {
    for (const name of entityNames(item)) add(`entity:${name.toLowerCase()}`, name, item);
    const subject = subjectOf(item.title);
    if (subject) add(`subject:${subject.key}`, subject.display, item);
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
// show anything, and never padded out with records that do not qualify. A
// development also has to include at least one record that is not already shown
// as a brief, so the two sections never restate each other.
export function buildDevelopments(items, { now = Date.now(), featured = [] } = {}) {
  const shown = new Set(featured);
  const pool = (items || []).filter((item) => ageHours(item, now) <= DEVELOPMENT_LONG_WINDOW_HOURS);

  const day = pool.filter((item) => ageHours(item, now) <= DEVELOPMENT_SHORT_WINDOW_HOURS);
  const short = gather(day, shown);
  if (short.length >= 3) return { clusters: short, window: "24 hours" };

  return { clusters: gather(pool, shown), window: "72 hours" };
}