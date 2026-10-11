// Subject terms read straight out of item titles.
//
// A subject is only ever used when more than one stored record carries it, so a
// grouping can always be traced back to the titles themselves. Wording that is
// too broad to be a development (single words like "OpenAI", or filler such as
// "New" and "Update") is rejected here rather than clustered.

const GENERIC = new Set([
  "a", "an", "and", "or", "but", "if", "then", "than", "so", "as", "at", "by", "for", "from",
  "in", "into", "of", "on", "onto", "over", "to", "up", "with", "without", "vs", "via", "per",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "do", "does", "did",
  "can", "could", "may", "might", "must", "shall", "should", "will", "would", "not", "no", "yes",
  "it", "its", "this", "that", "these", "those", "there", "here", "we", "our", "you", "your",
  "they", "their", "he", "she", "his", "her", "i", "my", "me", "us", "them", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "only", "own", "same", "too",
  "very", "just", "now", "also", "new", "news", "latest", "next", "last", "first", "second",
  "third", "top", "best", "how", "why", "what", "when", "where", "which", "who", "whom", "whose",
  "show", "ask", "hn", "github", "arxiv", "paper", "papers", "preprint", "research",
  "researchers", "study", "studies", "report", "reports", "review", "analysis", "survey", "guide",
  "tutorial", "introduction", "overview", "list", "part", "week", "month", "day", "year", "today",
  "tomorrow", "yesterday", "update", "updates", "updated", "release", "releases", "released",
  "launch", "launches", "launched", "announce", "announces", "announced", "announcement",
  "announcing", "introducing", "general", "available", "open", "source", "ai", "ml", "llm",
  "llms", "model", "models", "machine", "learning", "neural", "network", "networks", "data",
  "dataset", "datasets", "training", "inference", "agent", "agents", "system", "systems",
  "approach", "approaches", "method", "methods", "framework", "frameworks", "using", "use",
  "used", "based", "toward", "towards", "benchmark", "benchmarks", "evaluation", "performance",
  "scaling", "large", "small", "high", "low", "fast", "real", "time", "multi", "cross", "self",
  "from", "into", "how", "why", "deep", "new",
]);

const CONNECTORS = new Set(["of", "the", "and", "for", "in", "on", "with", "to", "vs", "x", "plus"]);

// An organisation or vendor name on its own names a standing entity rather than a
// development, so a phrase built only from those words is not used as a subject.
const ORGANISATIONS = new Set([
  "openai", "anthropic", "google", "deepmind", "meta", "microsoft", "amazon", "nvidia", "apple",
  "tesla", "github", "hugging", "alibaba", "bytedance", "xai", "samsung", "intel", "aws", "ibm",
  "techcrunch", "disrupt", "research", "labs", "inc", "corp", "foundation", "university",
]);

function clean(token) {
  return token.replace(/^[^\w+#]+/, "").replace(/[^\w.+#-]+$/, "");
}

function isNamey(token) {
  if (token.length < 2) return false;
  if (!/[A-Za-z]/.test(token)) return /^\d+$/.test(token);
  if (GENERIC.has(token.toLowerCase())) return false;
  if (/^[A-Z][a-z'’]*$/.test(token)) return true;
  if (/^[A-Z0-9][A-Z0-9.+#-]+$/.test(token)) return true;
  return /^\d+$/.test(token);
}

// "Chain of Thought" and "GPT-5.1" are subjects; "OpenAI" or "New" on their own
// are not, because they name a standing entity rather than a development.
function isUsable(parts) {
  const names = parts.filter(isNamey);
  if (!names.length) return false;
  if (names.every((name) => ORGANISATIONS.has(name.toLowerCase()))) return false;
  const phrase = parts.join(" ");
  if (phrase.length < 4) return false;
  if (names.length >= 2) return true;
  return /\d|[-+#]/.test(phrase);
}

export function subjectOf(title) {
  const tokens = String(title || "")
    .split(/\s+/)
    .map(clean)
    .filter(Boolean);

  let best = "";
  let run = [];

  const commit = () => {
    if (run.length && isUsable(run)) {
      const phrase = run.join(" ");
      if (phrase.length > best.length) best = phrase;
    }
    run = [];
  };

  for (const token of tokens) {
    if (isNamey(token)) {
      run.push(token);
      if (run.length >= 3) commit();
    } else if (CONNECTORS.has(token.toLowerCase()) && run.length) {
      run.push(token);
    } else {
      commit();
    }
  }
  commit();

  if (!best) return null;

  const parts = best.split(" ").filter((part) => !CONNECTORS.has(part.toLowerCase()));
  const key = parts.join(" ").toLowerCase();
  return key ? { key, display: best } : null;
}