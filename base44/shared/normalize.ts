// Shared normalisation helpers for the Trends ingestion pipeline.
// Source content is untrusted: everything textual is stripped and clipped before storage.

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "mc_cid", "mc_eid", "ref", "ref_src", "source", "igshid",
]);

const MIN_EXCERPT_LENGTH = 40;

export function decodeEntities(input) {
  if (!input) return "";
  return String(input)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(#39|apos|rsquo|lsquo);/g, "'")
    .replace(/&(mdash|#8212);/g, "-")
    .replace(/&(ndash|#8211);/g, "-")
    .replace(/&(hellip|#8230);/g, "...")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function stripHtml(input) {
  if (!input) return "";
  const withoutBlocks = String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  return decodeEntities(withoutBlocks.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function clip(text, max = 240) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.5 ? lastSpace : max).trim()}...`;
}

export function safeUrl(raw) {
  if (!raw) return "";
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function canonicalKey(raw) {
  const safe = safeUrl(raw);
  if (!safe) return "";
  const url = new URL(safe);
  url.hash = "";
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const param of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.has(param.toLowerCase())) url.searchParams.delete(param);
  }
  const query = url.searchParams.toString();
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.hostname}${path}${query ? `?${query}` : ""}`;
}

export function titleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 12)
    .join(" ");
}

export function hostLabel(raw) {
  const safe = safeUrl(raw);
  if (!safe) return "";
  try {
    return new URL(safe).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Keeps an excerpt only when it carries information beyond the title.
export function cleanExcerpt(title, rawExcerpt) {
  const text = clip(stripHtml(rawExcerpt || ""), 260);
  if (!text || text.length < MIN_EXCERPT_LENGTH) return "";
  const titleWords = titleKey(title);
  const excerptWords = titleKey(text);
  if (!titleWords || !excerptWords) return text;
  if (excerptWords === titleWords) return "";
  if (excerptWords.startsWith(titleWords)) return "";
  return text;
}

export function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

// Ranking weight, computed at ingest. Recency first, then a single source-reported metric.
export function computeScore(publishedAt, metricValue) {
  const timestamp = Date.parse(String(publishedAt || ""));
  const ageHours = Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3600000) : 24 * 14;
  const recency = Math.exp(-ageHours / 96);
  const metric = metricValue > 0 ? Math.min(1, Math.log10(1 + metricValue) / 4) : 0;
  return Number((recency * 0.65 + metric * 0.35).toFixed(4));
}

const CLAIM_PATTERNS = [
  /\brumou?r/i, /\bleak(ed|s)?\b/i, /\breportedly\b/i, /\ballegedly\b/i,
  /\bunconfirmed\b/i, /\bunverified\b/i, /\bnot confirmed\b/i,
  /\b(may|could|might) (be|launch|release|ship|arrive)\b/i,
  /\bexpected to (launch|release|ship|arrive)\b/i, /\bsoon to\b/i,
  /\bhas been spotted\b/i, /\bspotted (in|on)\b/i, /\bappears to (be|have)\b/i,
  /\bteaser\b/i, /\bclaims?\b/i, /\binsider\b/i,
];

export function detectUncertain(text) {
  const value = String(text || "");
  return CLAIM_PATTERNS.some((pattern) => pattern.test(value));
}