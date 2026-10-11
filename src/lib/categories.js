// Homepage category navigation.
//
// Every label maps to existing trend identifiers from the stored taxonomy: no new
// category is created, no stored classification is changed, and the trend slugs here
// are the same ones ingestion already writes. "More" holds whatever the taxonomy has
// left, read from the live Trend records rather than hardcoded here.

export const PRIMARY_CATEGORIES = [
  { id: "all", label: "All", slugs: [] },
  { id: "models", label: "Models", slugs: ["frontier-models", "open-models"] },
  { id: "agents", label: "Agents", slugs: ["agents"] },
  { id: "research", label: "Research", slugs: ["research"] },
  { id: "tools", label: "Tools", slugs: ["developer-tools"] },
];

const PRIMARY_SLUGS = PRIMARY_CATEGORIES.flatMap((category) => category.slugs);

// The trend slugs a category selection narrows the catalogue to. The value is either a
// primary category id or a single trend slug chosen from More; anything unknown narrows
// nothing, so a stale link shows the whole catalogue rather than an empty page.
export function categorySlugs(value) {
  const id = String(value || "").trim();
  if (!id || id === "all") return [];
  const primary = PRIMARY_CATEGORIES.find((category) => category.id === id);
  return primary ? primary.slugs : [id];
}

// The categories left over after the primary ones, in taxonomy order.
export function moreTrends(trends) {
  return (trends || []).filter(
    (trend) => trend && trend.slug && !PRIMARY_SLUGS.includes(trend.slug)
  );
}