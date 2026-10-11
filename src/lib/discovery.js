// Discovery state lives in the URL so filters, search, topic and pagination
// survive reload, sharing and browser Back/Forward.

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(value) {
  return String(value || "").replace(REGEX_SPECIALS, "\\$&");
}

export function readDiscovery(params) {
  return {
    q: (params.get("q") || "").trim(),
    category: params.get("category") || "all",
    format: params.get("format") || "all",
    source: params.get("source") || "all",
    sort: params.get("sort") || "trending",
    tags: (params.get("tags") || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    topic: params.get("topic") || "",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}

export function scopeQuery({ q } = {}) {
  const query = {};
  if (q) query.title = { $regex: escapeRegex(q), $options: "i" };
  return query;
}

// A trend surface narrows to one trend; a category narrows to the trends that category
// maps onto, which is the same stored field used either way.
export function trendFilter(scope) {
  if (scope.trendSlug) return { trend_slug: scope.trendSlug };
  if (Array.isArray(scope.trendSlugs) && scope.trendSlugs.length) return { trend_slug: { $in: scope.trendSlugs } };
  return {};
}

export function itemQuery(scope, state) {
  const query = scopeQuery({ q: state.q });
  Object.assign(query, trendFilter(scope));
  if (scope.topicSlug) query.topic_slug = scope.topicSlug;
  if (state.format !== "all") query.format = state.format;
  if (state.source !== "all") query.source = state.source;
  if (state.tags.length) query.tags = { $all: state.tags };
  return query;
}

export function nextParams(params, patch, { resetPage = true, replace = false } = {}) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    const empty = value === null || value === undefined || value === "" || value === "all" ||
      (Array.isArray(value) && value.length === 0);
    if (empty) next.delete(key);
    else next.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  if (resetPage) next.delete("page");
  return { next, replace };
}

export function hasActiveFilters(state) {
  return Boolean(state.q) || state.format !== "all" || state.source !== "all" || state.tags.length > 0;
}

export function activeFilterChips(state) {
  const chips = [];
  if (state.q) chips.push({ key: "q", label: `“${state.q}”` });
  state.tags.forEach((tag) => chips.push({ key: "tag", value: tag, label: tag }));
  return chips;
}