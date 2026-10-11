// Trusted first-party publisher registry.
//
// A record may be labelled Official only when BOTH hold:
//   1. its canonical URL sits on a host this registry approves for that publisher
//      (the exact host, or an approved subdomain, optionally restricted to
//      approved paths), and
//   2. the record's own source identity is that publisher.
//
// Hosts are compared exactly - never by substring - so an article *about* an AI
// company on a third-party site can never match. When two entries match, or the
// identity does not match the host, the result is null and no badge is shown.
//
// Official means first-party publication only. It is never a claim that the
// contents have been independently verified.
//
// To extend: add an entry with its hosts and source keys. Nothing in the UI
// needs to change.

export const PUBLISHERS = [
  {
    id: "openai",
    name: "OpenAI",
    sourceKeys: ["openai"],
    sourceNames: ["openai", "openai news"],
    hosts: [
      { host: "openai.com", subdomains: ["platform", "developers", "cookbook", "cdn", "help"] },
      { host: "chatgpt.com" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    sourceKeys: ["anthropic"],
    sourceNames: ["anthropic"],
    hosts: [
      { host: "anthropic.com", subdomains: ["docs", "support", "news"] },
      { host: "claude.com" },
    ],
  },
  {
    id: "deepmind",
    name: "Google DeepMind",
    sourceKeys: ["deepmind", "google-deepmind"],
    sourceNames: ["google deepmind", "deepmind"],
    hosts: [{ host: "deepmind.google" }, { host: "deepmind.com" }],
  },
  {
    id: "google",
    name: "Google",
    sourceKeys: ["google", "google-research", "google-ai"],
    sourceNames: ["google", "google research", "google ai"],
    hosts: [
      { host: "research.google" },
      { host: "blog.google" },
      { host: "ai.google.dev" },
      { host: "developers.googleblog.com" },
    ],
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    sourceKeys: ["nvidia"],
    sourceNames: ["nvidia"],
    hosts: [{ host: "nvidia.com" }, { host: "blogs.nvidia.com" }],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    sourceKeys: ["huggingface"],
    sourceNames: ["hugging face"],
    // Hugging Face's own posts live directly under /blog/<slug>; guest posts from
    // other organisations sit at /blog/<org>/<slug> and are deliberately not
    // approved, because Hugging Face is not their publisher.
    hosts: [{ host: "huggingface.co", paths: [/^\/blog\/[^/]+\/?$/, /^\/papers(\/|$)/] }],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    sourceKeys: ["microsoft", "microsoft-research"],
    sourceNames: ["microsoft", "microsoft research"],
    hosts: [{ host: "microsoft.com", subdomains: ["blogs", "news", "research", "azure"] }],
  },
  {
    id: "meta",
    name: "Meta AI",
    sourceKeys: ["meta", "meta-ai"],
    sourceNames: ["meta", "meta ai"],
    hosts: [{ host: "ai.meta.com" }],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    sourceKeys: ["mistral"],
    sourceNames: ["mistral", "mistral ai"],
    hosts: [{ host: "mistral.ai" }],
  },
  {
    id: "xai",
    name: "xAI",
    sourceKeys: ["xai"],
    sourceNames: ["xai"],
    hosts: [{ host: "x.ai" }],
  },
  {
    id: "allenai",
    name: "Allen Institute for AI",
    sourceKeys: ["allenai"],
    sourceNames: ["allen institute for ai", "allenai"],
    hosts: [{ host: "allenai.org" }],
  },
  {
    id: "mit-news",
    name: "MIT News",
    sourceKeys: ["mit-news-ai", "mit-news"],
    sourceNames: ["mit news"],
    hosts: [{ host: "news.mit.edu" }],
  },
  {
    id: "bair",
    name: "BAIR",
    sourceKeys: ["bair"],
    sourceNames: ["bair", "berkeley ai research"],
    hosts: [{ host: "bair.berkeley.edu" }],
  },
];

// The exact host and path of a canonical URL, with "www." normalised away.
function locate(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { host: url.hostname.toLowerCase().replace(/^www\./, ""), path: url.pathname };
  } catch {
    return null;
  }
}

function hostApproved(entry, host, path) {
  for (const rule of entry.hosts || []) {
    const exact = host === rule.host;
    const subdomain = (rule.subdomains || []).some((label) => host === `${label}.${rule.host}`);
    if (!exact && !subdomain) continue;
    if (rule.paths && !rule.paths.some((pattern) => pattern.test(path))) continue;
    return true;
  }
  return false;
}

function identityMatches(entry, item) {
  const key = String(item.source_key || "").toLowerCase();
  if (key && (entry.sourceKeys || []).includes(key)) return true;
  const name = String(item.source || "").trim().toLowerCase();
  return Boolean(name) && (entry.sourceNames || []).includes(name);
}

// The publisher that both owns this record's canonical host and is the record's
// own source. Null whenever the answer is anything but unambiguous.
export function firstPartyPublisher(item) {
  if (!item) return null;
  const place = locate(item.canonical_url);
  if (!place) return null;

  const matched = PUBLISHERS.filter((entry) => hostApproved(entry, place.host, place.path));
  if (matched.length !== 1) return null;

  return identityMatches(matched[0], item) ? matched[0] : null;
}