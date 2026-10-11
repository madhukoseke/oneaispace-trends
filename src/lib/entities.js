// Specific, identifiable things a record can be about.
//
// Only versioned identifiers qualify: a development is a concrete release or
// artefact ("GPT-5.1", "Claude Haiku 5.5", "Gemini 3.8 Flash", "o3"), never a
// standing term such as GPT, AI, LLM, agents, models or research. Two records
// that merely share vocabulary are not a development.
//
// The identifier itself asserts nothing. A grouping is only shown when two or
// more stored records, from two or more different sources, actually carry the
// same identifier.

// Words that never name a thing, even when a version number follows them.
const GENERIC = new Set([
  "a", "an", "and", "or", "but", "if", "then", "than", "so", "as", "at", "by", "for", "from",
  "in", "into", "of", "on", "onto", "over", "to", "up", "with", "without", "vs", "via", "per",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "do", "does", "did",
  "can", "could", "may", "might", "must", "should", "will", "would", "not", "no", "yes",
  "it", "its", "this", "that", "these", "those", "there", "here", "we", "our", "you", "your",
  "they", "their", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
  "only", "own", "same", "too", "very", "just", "now", "also", "new", "news", "latest", "next",
  "last", "first", "second", "third", "top", "best", "how", "why", "what", "when", "where",
  "which", "who", "part", "week", "weeks", "day", "days", "month", "year", "today", "tomorrow",
  "yesterday", "update", "updates", "release", "releases", "launch", "launches", "version", "v",
  "ai", "ml", "llm", "llms", "model", "models", "agent", "agents", "research", "study", "report",
  "review", "survey", "tokens", "token", "context", "system", "systems", "platform", "tool",
  "tools", "framework", "benchmark", "evaluation", "performance", "training", "inference", "data",
  "dataset", "datasets", "learning", "neural", "network", "machine", "scaling", "large", "small",
  "high", "low", "fast", "real", "time", "multi", "cross", "self", "deep", "using", "use", "used",
  "based", "toward", "towards", "open", "source", "general", "available", "every", "about",
  "after", "before", "during", "since", "while", "meet", "gets", "makes", "takes",
]);

// Organisations are standing entities, not developments.
const ORGANISATIONS = new Set([
  "openai", "anthropic", "google", "deepmind", "meta", "microsoft", "amazon", "nvidia", "apple",
  "tesla", "github", "hugging", "huggingface", "alibaba", "bytedance", "xai", "samsung", "intel",
  "aws", "ibm", "mit", "university", "labs", "inc", "corp", "foundation",
]);

const VERSION = /^\d[\d.]*[A-Za-z]{0,3}$/; // 5.1, 3.8, 4, 1.13.0, 500B
const SINGLE = /^([A-Za-z]{1,5})-?(\d[A-Za-z0-9.]*)$/; // GPT-5.1, Qwen3, o3

function clean(token) {
  return token.replace(/^[^\w.+#-]+/, "").replace(/[^\w.+#-]+$/, "");
}

// Trailing punctuation is kept in the token so versions such as "5.1" survive,
// so the word lists are checked against a punctuation-free form.
function word(token) {
  return token.toLowerCase().replace(/[.+#-]+$/, "");
}

function isWord(token) {
  const lower = word(token);
  return GENERIC.has(lower) || ORGANISATIONS.has(lower);
}

function isName(token) {
  if (token.length < 2) return false;
  if (!/^[A-Za-z]/.test(token)) return false;
  return !isWord(token);
}

function isVariant(token) {
  if (!/^[A-Z][a-z]+$/.test(token)) return false;
  return !isWord(token);
}

// Every versioned identifier a record carries, from its title and its own
// summary. Bare family names and standing terms are never returned.
export function specificEntities(item) {
  const text = `${(item && item.title) || ""} ${(item && item.excerpt) || ""}`;
  const tokens = text.split(/\s+/).map(clean).filter(Boolean);
  const found = new Map();

  tokens.forEach((token, index) => {
    let display = "";

    if (VERSION.test(token)) {
      const name = tokens[index - 1] || "";
      if (isName(name)) {
        const variant = isVariant(tokens[index + 1] || "") ? ` ${tokens[index + 1]}` : "";
        display = `${name} ${token}${variant}`;
      }
    } else {
      const match = SINGLE.exec(token);
      if (match && isName(match[1])) display = token;
    }

    if (display.length < 3) return;
    const key = display.toLowerCase().replace(/\s+/g, " ");
    if (!found.has(key)) found.set(key, display);
  });

  return [...found.values()];
}