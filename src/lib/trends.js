// Presentation helpers for the Trends surfaces.

export const FORMAT_ORDER = ["video", "project", "post", "article", "research"];

export const FORMAT_LABELS = {
  video: "Videos",
  project: "Projects",
  post: "Posts",
  article: "Articles",
  research: "Research",
};

export const FORMAT_NOUN = {
  video: "Video",
  project: "Repository",
  post: "Post",
  article: "Article",
  research: "Paper",
};

// One restrained hue per format, used only on a dot and on the format micro-label, so a
// reader can tell the kinds apart at a glance without the list turning into decoration.
export const FORMAT_TONE = {
  video: "text-format-video",
  project: "text-format-project",
  post: "text-format-post",
  article: "text-format-article",
  research: "text-format-research",
};

export const FORMAT_DOT = {
  video: "bg-format-video",
  project: "bg-format-project",
  post: "bg-format-post",
  article: "bg-format-article",
  research: "bg-format-research",
};

export const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
];

export const PAGE_SIZE = 24;

export function relativeTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(Math.max(0, diff) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Absolute publication date, for records whose exact day matters.
export function shortDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Full publication date, with the year: a card states when the source published it.
export function calendarDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCount(value) {
  const number = Number(value) || 0;
  if (number < 1000) return String(number);
  if (number < 1000000) return `${(number / 1000).toFixed(number < 10000 ? 1 : 0)}k`;
  return `${(number / 1000000).toFixed(1)}m`;
}

// A single source-reported metric, shown only when the source actually reports one.
export function metricText(item) {
  if (!item.metric_label || !Number(item.metric_value)) return "";
  return `${formatCount(item.metric_value)} ${item.metric_label}`;
}

export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function momentumLabel(momentum) {
  return { surging: "Surging", rising: "Rising", steady: "Steady", cooling: "Cooling" }[momentum] || "";
}