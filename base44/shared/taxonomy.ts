// Trend/topic taxonomy for Trends. Trends are groupings derived from ingested
// content by explicit, auditable keyword rules - never authored as content fixtures.
// Trend and topic records are upserted from these definitions on every ingest run.

export const TREND_DEFS = [
  {
    slug: "frontier-models",
    name: "Frontier Models",
    description: "Model launches, capability reports and open questions from the largest AI labs.",
    keywords: ["openai", "anthropic", "google deepmind", "gemini", "claude", "chatgpt", "gpt-5", "gpt-4", "frontier model", "flagship model", "copilot", "grok", "o3", "o4"],
    topics: [
      { slug: "releases", name: "Releases", description: "New models, versions and availability.", keywords: ["release", "launch", "introduc", "now available", "general availability", "preview", "api access", "rollout"] },
      { slug: "capabilities", name: "Capabilities", description: "What the models can do, measured or demonstrated.", keywords: ["capab", "context window", "long context", "multimodal", "tool use", "coding ability", "math", "agentic"] },
      { slug: "claims", name: "Claims", description: "Reported and unconfirmed model news.", keywords: ["rumo", "leak", "reportedly", "unconfirmed", "expected", "spotted", "teaser", "insider"] },
    ],
  },
  {
    slug: "open-models",
    name: "Open Models",
    description: "Openly released weights, the fine-tunes built on them and the tooling that runs them.",
    keywords: ["open weights", "open-weights", "open source model", "open-source model", "open model", "llama", "mistral", "qwen", "deepseek", "gemma", "phi-", "olmo", "gguf", "quantiz", "lora", "mixtral", "kimi", "glm", "falcon"],
    topics: [
      { slug: "open-releases", name: "Releases", description: "New checkpoints and weight drops.", keywords: ["release", "weights", "checkpoint", "announc", "available"] },
      { slug: "fine-tuning", name: "Fine-tuning", description: "Adapters, training runs and distillation.", keywords: ["fine-tun", "lora", "qlora", "distill", "training", "dataset", "rlhf"] },
      { slug: "local-inference", name: "Local inference", description: "Running models on your own hardware.", keywords: ["llama.cpp", "gguf", "quantiz", "ollama", "vllm", "on-device", "edge", "local model"] },
    ],
  },
  {
    slug: "agents",
    name: "Agents & Tooling",
    description: "Systems that plan and act: agent frameworks, coding agents and tool protocols.",
    keywords: ["agent", "agentic", "tool calling", "tool use", "function calling", "mcp", "model context protocol", "computer use", "multi-agent", "langgraph", "crewai", "autonomous", "workflow automation"],
    topics: [
      { slug: "agent-frameworks", name: "Frameworks", description: "Libraries and runtimes for building agents.", keywords: ["framework", "sdk", "library", "langgraph", "crewai", "autogen", "runtime"] },
      { slug: "coding-agents", name: "Coding agents", description: "Agents that write, review or refactor code.", keywords: ["coding", "code", "developer", "ide", "copilot", "swe-bench", "refactor", "pull request"] },
      { slug: "protocols", name: "Protocols", description: "How agents connect to tools and data.", keywords: ["mcp", "model context protocol", "protocol", "integration", "tool calling", "function calling"] },
    ],
  },
  {
    slug: "reasoning",
    name: "Reasoning & Evaluation",
    description: "Deliberate reasoning, test-time compute and the benchmarks used to measure both.",
    keywords: ["reasoning", "chain of thought", "chain-of-thought", "test-time", "inference-time", "benchmark", "evaluation", "mmlu", "swe-bench", "gpqa", "aime", "verifier", "self-consistency", "leaderboard"],
    topics: [
      { slug: "benchmarks", name: "Benchmarks", description: "Scores, leaderboards and measured results.", keywords: ["benchmark", "mmlu", "gpqa", "aime", "swe-bench", "leaderboard", "score", "state of the art"] },
      { slug: "evaluation", name: "Evaluation", description: "How model quality is judged and audited.", keywords: ["eval", "rubric", "judge", "measure", "harness", "audit", "human preference"] },
      { slug: "training-methods", name: "Methods", description: "Training and inference techniques.", keywords: ["reinforcement", "post-training", "distill", "chain of thought", "test-time", "reasoning model"] },
    ],
  },
  {
    slug: "generative-media",
    name: "Generative Media",
    description: "Generated images, video, audio and 3D: models, tools and releases.",
    keywords: ["image generation", "video generation", "text-to-image", "text-to-video", "diffusion", "flux", "stable diffusion", "midjourney", "sora", "veo", "runway", "tts", "speech synthesis", "music generation", "gaussian splat", "upscal", "voice clone", "avatar"],
    topics: [
      { slug: "media-image", name: "Image", description: "Image models and visual experiments.", keywords: ["image", "photo", "diffusion", "flux", "midjourney", "stable diffusion", "upscal"] },
      { slug: "media-video", name: "Video", description: "Generated video and animation.", keywords: ["video", "sora", "veo", "runway", "animation", "film", "clip"] },
      { slug: "media-audio", name: "Audio & speech", description: "Speech, voice and music models.", keywords: ["audio", "speech", "voice", "tts", "music", "podcast", "transcri"] },
    ],
  },
  {
    slug: "research",
    name: "Research",
    description: "Preprints and papers catalogued straight from their original abstracts.",
    keywords: ["arxiv", "preprint", "paper", "researchers", "we propose", "novel method", "state of the art", "empirical study", "ablation"],
    topics: [
      { slug: "papers", name: "Papers", description: "New preprints and published papers.", keywords: ["arxiv", "preprint", "paper", "abstract", "study"] },
      { slug: "methods", name: "Methods", description: "New architectures, algorithms and techniques.", keywords: ["method", "architecture", "algorithm", "framework", "approach", "objective"] },
      { slug: "datasets", name: "Datasets", description: "Corpora, benchmarks and evaluation data.", keywords: ["dataset", "corpus", "benchmark suite", "data set", "annotation"] },
    ],
  },
  {
    slug: "developer-tools",
    name: "Developer Tools",
    description: "Open-source projects, serving stacks and infrastructure for building with AI.",
    keywords: ["inference", "serving", "vllm", "tensorrt", "ollama", "sdk", "cli", "framework", "library", "kernel", "cuda", "pytorch", "tensorflow", "transformers", "langchain", "vector database", "observability", "compiler", "runtime", "toolkit", "deploy"],
    topics: [
      { slug: "inference-serving", name: "Inference", description: "Serving, optimisation and throughput.", keywords: ["inference", "serving", "vllm", "tensorrt", "ollama", "latency", "throughput", "quantiz"] },
      { slug: "dev-frameworks", name: "Frameworks", description: "Libraries and SDKs for building.", keywords: ["framework", "library", "sdk", "langchain", "pytorch", "transformers", "toolkit", "cli"] },
      { slug: "infrastructure", name: "Infrastructure", description: "Compute, kernels and deployment.", keywords: ["gpu", "cuda", "kernel", "cluster", "runtime", "compiler", "vector database", "deploy", "container"] },
    ],
  },
  {
    slug: "safety-policy",
    name: "Safety & Policy",
    description: "Alignment research, security findings and the rules being written around AI.",
    keywords: ["safety", "alignment", "regulation", "policy", "governance", "misuse", "jailbreak", "red team", "interpretability", "copyright", "privacy", "audit", "compliance", "eu ai act", "guardrail"],
    topics: [
      { slug: "alignment", name: "Alignment", description: "Making models behave as intended.", keywords: ["alignment", "interpretability", "red team", "jailbreak", "constitution", "value"] },
      { slug: "policy", name: "Policy", description: "Rules, law and governance.", keywords: ["regulation", "policy", "law", "governance", "compliance", "act", "court", "standard"] },
      { slug: "security", name: "Security", description: "Attacks, defences and misuse.", keywords: ["security", "attack", "prompt injection", "vulnerab", "misuse", "guardrail", "exfiltrat"] },
    ],
  },
  {
    slug: "industry",
    name: "Industry",
    description: "Business and infrastructure moves across the AI industry.",
    keywords: ["funding", "raises", "valuation", "acquisition", "acquir", "partnership", "ipo", "revenue", "hiring", "layoff", "data center", "datacenter", "deal", "investment", "market"],
    topics: [
      { slug: "funding", name: "Funding", description: "Rounds, valuations and investors.", keywords: ["funding", "raise", "valuation", "investment", "series", "backed"] },
      { slug: "partnerships", name: "Partnerships", description: "Deals, integrations and acquisitions.", keywords: ["partnership", "collaborat", "deal", "acquisition", "acquir", "join forces"] },
      { slug: "compute", name: "Compute", description: "Chips, data centres and capacity.", keywords: ["data center", "datacenter", "gpu", "chip", "compute", "capex", "supply", "cluster"] },
    ],
  },
];

const TAG_RULES = [
  { tag: "Benchmarks", keywords: ["benchmark", "leaderboard", "mmlu", "gpqa", "swe-bench", "eval", "score"] },
  { tag: "Open weights", keywords: ["open weights", "open-weights", "open source model", "open-source model", "llama", "qwen", "deepseek", "mistral", "gemma"] },
  { tag: "Agents", keywords: ["agent", "agentic", "tool use", "tool calling", "mcp"] },
  { tag: "Robotics", keywords: ["robot", "embodied", "manipulation", "humanoid", "autonomous driving"] },
  { tag: "Healthcare", keywords: ["health", "medical", "clinical", "protein", "biolog", "drug discovery"] },
  { tag: "Coding", keywords: ["coding", "code completion", "developer", "copilot", "refactor", "pull request"] },
  { tag: "Multimodal", keywords: ["multimodal", "vision-language", "image generation", "video generation", "speech", "audio model"] },
  { tag: "Training", keywords: ["pretrain", "fine-tun", "lora", "rlhf", "distillation", "training run"] },
  { tag: "Inference", keywords: ["inference", "serving", "vllm", "quantiz", "latency", "throughput"] },
  { tag: "Safety", keywords: ["safety", "alignment", "jailbreak", "red team", "misuse"] },
  { tag: "Policy", keywords: ["regulation", "policy", "governance", "compliance"] },
  { tag: "Funding", keywords: ["funding", "raise", "valuation", "investment", "acquisition"] },
  { tag: "Datasets", keywords: ["dataset", "corpus", "data set", "annotation"] },
  { tag: "Tooling", keywords: ["sdk", "cli", "library", "framework", "toolkit"] },
];

const DEFAULT_TREND = "industry";
const MAX_TAGS = 3;

function generalTopic(trendSlug) {
  return {
    slug: `${trendSlug}-general`,
    name: "General",
    description: "Everything else catalogued in this trend.",
    sort_order: 900,
    keywords: [],
  };
}

function withGeneral(trend) {
  return [...trend.topics, generalTopic(trend.slug)];
}

export const TREND_SEEDS = TREND_DEFS.map((trend, index) => ({
  slug: trend.slug,
  name: trend.name,
  description: trend.description,
  sort_order: (index + 1) * 10,
}));

export const TOPIC_SEEDS = TREND_DEFS.flatMap((trend) =>
  withGeneral(trend).map((topic, index) => ({
    slug: topic.slug,
    name: topic.name,
    trend_slug: trend.slug,
    description: topic.description,
    sort_order: (index + 1) * 10,
  }))
);

function countHits(haystack, keywords) {
  let hits = 0;
  for (const keyword of keywords || []) {
    if (haystack.includes(keyword)) hits += 1;
  }
  return hits;
}

function matchTags(haystack) {
  const tags = [];
  for (const rule of TAG_RULES) {
    if (tags.length >= MAX_TAGS) break;
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) tags.push(rule.tag);
  }
  return tags;
}

// Rule-based classification: the trend with the most keyword evidence wins,
// otherwise the provider's default trend applies.
export function classify(text, defaultTrendSlug) {
  const haystack = ` ${String(text || "").toLowerCase()} `;
  let winner = null;
  for (const trend of TREND_DEFS) {
    const hits = countHits(haystack, trend.keywords);
    if (hits > 0 && (!winner || hits > winner.hits)) winner = { trend, hits };
  }
  const trend =
    (winner && winner.trend) ||
    TREND_DEFS.find((item) => item.slug === defaultTrendSlug) ||
    TREND_DEFS[TREND_DEFS.length - 1];

  let topicWinner = null;
  for (const topic of trend.topics) {
    const hits = countHits(haystack, topic.keywords);
    if (hits > 0 && (!topicWinner || hits > topicWinner.hits)) topicWinner = { topic, hits };
  }

  return {
    trend_slug: trend.slug,
    topic_slug: topicWinner ? topicWinner.topic.slug : `${trend.slug}-general`,
    tags: matchTags(haystack),
  };
}

export const FALLBACK_TREND_SLUG = DEFAULT_TREND;