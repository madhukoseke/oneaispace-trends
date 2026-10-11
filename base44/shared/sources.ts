// Registry of the free public sources Phase 0 ingests from.
// Every entry is a real endpoint with attribution labels used in the UI.

export const USER_AGENT = "OneAISpaceTrendsBot/0.1 (+https://ai-trend-space.base44.app)";

export const RSS_FEEDS = [
  { key: "openai", label: "OpenAI", url: "https://openai.com/news/rss.xml", homepage: "https://openai.com/news/", kind: "Lab blog" },
  { key: "deepmind", label: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", homepage: "https://deepmind.google/discover/blog/", kind: "Lab blog" },
  { key: "google-research", label: "Google Research", url: "https://research.google/blog/rss/", homepage: "https://research.google/blog/", kind: "Lab blog" },
  { key: "google-ai", label: "Google AI", url: "https://blog.google/technology/ai/rss/", homepage: "https://blog.google/technology/ai/", kind: "Lab blog" },
  { key: "huggingface", label: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", homepage: "https://huggingface.co/blog", kind: "Platform blog" },
  { key: "microsoft-research", label: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/feed/", homepage: "https://www.microsoft.com/en-us/research/blog/", kind: "Lab blog" },
  { key: "nvidia", label: "NVIDIA", url: "https://blogs.nvidia.com/feed/", homepage: "https://blogs.nvidia.com/", kind: "Vendor blog" },
  { key: "mit-news-ai", label: "MIT News", url: "https://news.mit.edu/rss/topic/artificial-intelligence2", homepage: "https://news.mit.edu/topic/artificial-intelligence2", kind: "Institution news" },
  { key: "bair", label: "Berkeley AI Research", url: "https://bair.berkeley.edu/blog/feed.xml", homepage: "https://bair.berkeley.edu/blog/", kind: "Lab blog" },
  { key: "techcrunch-ai", label: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/", homepage: "https://techcrunch.com/category/artificial-intelligence/", kind: "Publication" },
];

export const FEED_MAX_ITEMS = 12;
export const FEED_MAX_AGE_DAYS = 60;

export const HACKER_NEWS = {
  topStories: "https://hacker-news.firebaseio.com/v0/topstories.json",
  item: "https://hacker-news.firebaseio.com/v0/item/",
  maxStories: 28,
};

// Titles are matched against these terms so only AI-relevant discussions are catalogued.
export const AI_KEYWORDS = [
  /\bai\b/i, /\bllms?\b/i, /\bgpt\b/i, /\bml\b/i, /\bagi\b/i, /\brlhf\b/i, /\brag\b/i,
  "machine learning", "deep learning", "neural", "transformer", "openai", "anthropic",
  "claude", "gemini", "llama", "mistral", "deepseek", "qwen", "hugging face", "diffusion",
  "agent", "inference", "fine-tune", "generative", "embedding", "vector database",
  "nvidia", "cuda", "pytorch", "model weights", "context window",
];

export const GITHUB_SEARCHES = [
  { key: "active", label: "Actively developed AI projects", query: "topic:llm stars:>900 pushed:>2026-09-15", sort: "updated", perPage: 9 },
  { key: "agents", label: "Agent frameworks", query: "topic:ai-agents stars:>200", sort: "stars", perPage: 8 },
  { key: "new", label: "New AI repositories", query: "topic:artificial-intelligence created:>2026-09-01 stars:>60", sort: "stars", perPage: 8 },
];

export const ARXIV = {
  query: "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:cs.CV&sortBy=submittedDate&sortOrder=descending&start=0&max_results=36",
  maxAuthors: 3,
};