// Phase 2A configuration: the development-analysis kill switch, the batch caps and
// the retention window.
//
// execution_enabled is the master kill switch for every provider call in this
// pipeline. It is off by default and no code in this app can turn it on: the only
// way to arm it is a deliberate edit of this file by a human. Because it is a
// source-level constant rather than a stored flag, it cannot be left armed by a
// previous run - a run never turns it on, so it is off before and after every batch.
//
// There is deliberately no schedule, no trigger and no background processing in
// Phase 2A: every batch is a manual, administrator-authorized request. Nothing here
// processes the whole catalogue; a batch is capped at max_records.
//
// The price table and the token assumptions are the ones the Stage 1 proof already
// uses, imported rather than copied so the two cannot drift apart. They are
// published third-party list prices, used only to size a conservative pre-call
// estimate, and are never presented as billed cost.

import { PRICE_ESTIMATES_USD_PER_MTOK, ESTIMATE_TOKENS } from './modelProofConfig.ts';

export const DEV_ANALYSIS_CONFIG = {
  // Off by default and untouched by the pipeline itself. Armed by a deliberate human edit
  // for one authorized batch (2026-10-12, operator-requested pass over the newest sources),
  // and disarmed again as soon as that batch ends.
  execution_enabled: true,
  stage: 'phase2a-development-analysis',
  trigger: 'manual',

  // A batch is at most 10 existing source records, and 0.25 USD is the ceiling the
  // worst-case pre-call estimate must stay under.
  max_records: 10,
  spend_ceiling_usd: 0.25,

  // One call per provider and two calls in total: the run record carries exactly two
  // call slots (call_slot_a, call_slot_b), one per provider, and each slot is consumed
  // by an atomic guarded update before its dispatch. There are no retries.
  max_calls_per_provider: 1,
  max_calls_total: 2,
  allow_retries: false,

  // Output caps: what one batch may store, and what one source record may contribute.
  max_developments: 6,
  max_claims: 8,
  max_claims_per_item: 2,

  // Evidence and text limits.
  max_source_text_chars: 700,
  max_evidence_quote_chars: 240,
  min_evidence_quote_chars: 25,
  max_stored_output_items: 8,

  timeout_ms: 60000,
  require_authorization: true,
  retention_days: 30,

  // A stored record with no excerpt is not sent to a model by default: its only stored
  // text is its title, so nothing can be quoted from an excerpt that does not exist. The
  // one override is an explicit administrator flag on the request. Even then the record
  // is analysed with its stored title alone - no excerpt is fetched, generated, expanded
  // or inferred, in the prompt or in the stored rows.
  analyse_title_only_by_default: false,

  // The two genuinely distinct models, on two distinct providers, with two distinct
  // tasks. Model A extracts developments from the stored source text; Model B is the
  // structured evaluation model that judges whether the supplied excerpts support the
  // extracted claims.
  model_a: { provider: 'base44-core', model: 'gpt_6_luna', task_kind: 'development_extraction' },
  model_b: { provider: 'typesafe', model: 'jev', task_kind: 'claim_support_evaluation' },

  price_table: PRICE_ESTIMATES_USD_PER_MTOK,
  estimate_tokens: ESTIMATE_TOKENS,
};

// The development kinds this pipeline is allowed to record. A kind outside this list
// is never invented into one: it is recorded as "unspecified" and reported.
export const DEVELOPMENT_KINDS = [
  'model_release',
  'model_version',
  'product_release',
  'research',
  'capability',
  'project_announcement',
];

// Words that carry no identifying power for grouping. Two records that share only
// these are NOT the same development: they are reported as a refused merge instead of
// being joined, which is what keeps "everything mentioning AI agents" from collapsing
// into one candidate.
export const GENERIC_GROUPING_TOKENS = new Set([
  'ai', 'ml', 'agent', 'agents', 'agentic', 'model', 'models', 'llm', 'llms', 'genai',
  'open', 'opensource', 'source', 'new', 'tool', 'tools', 'platform', 'api', 'apis',
  'data', 'code', 'coding', 'research', 'developer', 'developers', 'github', 'news',
  'update', 'updates', 'release', 'releases', 'launch', 'launches', 'beta', 'preview',
  'app', 'apps', 'system', 'systems', 'framework', 'frameworks', 'sdk', 'library',
  'python', 'javascript', 'typescript', 'rust', 'go', 'web', 'cloud', 'local', 'gpu',
  'cpu', 'benchmark', 'benchmarks', 'dataset', 'datasets', 'paper', 'papers', 'study',
  'report', 'company', 'startup', 'startups', 'funding', 'users', 'free', 'inference',
  'training', 'finetuning', 'prompt', 'prompts', 'rag', 'chat', 'chatbot', 'assistant',
  'assistants', 'multimodal', 'vision', 'text', 'image', 'video', 'audio', 'speech',
  'robotics', 'safety', 'alignment', 'quantization', 'distillation', 'performance',
  'efficient', 'efficiency', 'scaling', 'context', 'token', 'tokens', 'memory',
  'reasoning', 'search', 'enterprise', 'privacy', 'security', 'alpha', 'stable',
  'experimental', 'version', 'support', 'feature', 'features', 'workflow', 'workflows',
]);

// The three deterministic content states of a stored source record. They are read from
// the stored fields themselves, never from a character count: a record whose excerpt
// happens to be short is still a record with an excerpt, and a record with no excerpt is
// never given one.
export const CONTENT_STATES = {
  no_text: 'no_text',
  title_only: 'title_only',
  has_excerpt: 'has_excerpt',
};

// Publication language that can frame a named artefact as a research contribution. A
// product announcement that merely says "available" or "released" carries none of these,
// which is what keeps a product release from being filed as research. The phrase must
// appear in the stored text the evidence quote is taken from, so a headline alone cannot
// make a record research.
export const RESEARCH_PUBLICATION_PHRASES = [
  'we propose', 'we present', 'we introduce', 'we describe', 'we develop', 'we design',
  'we build', 'we construct', 'we train', 'we evaluate', 'we benchmark', 'we release',
  'we contribute', 'we demonstrate', 'we report',
  'our method', 'our framework', 'our system', 'our dataset', 'our approach', 'our analysis',
  'our model', 'our algorithm', 'our benchmark', 'our implementation',
  'a novel', 'novel method', 'novel framework', 'novel dataset', 'novel benchmark',
  'benchmark suite', 'empirical study', 'empirical evaluation', 'systematic review',
];

// Publication format words. These are context, never qualification: "paper", "study" or
// "research" say nothing about whether a record carries a contribution, so a generic article
// that merely calls itself a paper or a study is not made eligible by these words.
export const RESEARCH_VENUE_PHRASES = [
  'preprint', 'paper', 'journal', 'proceedings', 'arxiv', 'thesis', 'dissertation',
  'technical report', 'white paper', 'whitepaper', 'survey', 'research',
  'this paper', 'this study', 'this report', 'this work',
];

// A research title that names its own artefact and then says what it is - the
// "Name: <what it is>" convention research records use, as in
// "Dex-One2Many: Learning Dexterous Manipulation from a Single Human Demonstration".
// The artefact must sit before the first colon and must be a real name rather than the
// sentence's opening word, and the subtitle must carry one of these words.
export const RESEARCH_TITLE_ARTIFACT_STOPWORDS = [
  'introducing', 'announcing', 'launching', 'presenting', 'unveiling', 'building', 'towards',
  'toward', 'understanding', 'rethinking', 'scaling', 'learning', 'new', 'a', 'an', 'the',
  'how', 'why', 'what', 'meet', 'notes', 'report',
];

export const RESEARCH_TITLE_CONTRIBUTION_WORDS = [
  'method', 'methods', 'framework', 'frameworks', 'benchmark', 'benchmarks', 'dataset',
  'datasets', 'system', 'systems', 'model', 'models', 'algorithm', 'algorithms', 'approach',
  'architecture', 'suite', 'generator', 'evaluator', 'pipeline', 'toolkit', 'paradigm',
  'protocol', 'environment', 'language', 'compiler', 'library', 'engine', 'harness',
  'learning', 'understanding', 'generating', 'generation', 'reasoning', 'editing',
  'detection', 'classification', 'segmentation', 'retrieval', 'training', 'evaluation',
  'filtering', 'unifying', 'simplifying', 'addressing', 'rethinking', 'reconstructing',
  'encoding', 'decoding', 'planning', 'scheduling', 'alignment', 'distillation',
  'compression', 'prediction', 'summarization', 'grounding', 'synthesis', 'manipulation',
  'interaction', 'simulation', 'optimization', 'calibration', 'verification',
];

// Distinctive AI-family names. A family followed by a version number ("gpt-6",
// "qwen3", "llama 3.2") is specific enough to link two records as candidates for the
// same development; a bare family name alone is not, and is only used, together with a
// release verb, to decide whether a record even describes an identifiable event.
export const NAMED_AI_FAMILIES = [
  'gpt', 'chatgpt', 'claude', 'gemini', 'gemma', 'llama', 'qwen', 'deepseek', 'mistral',
  'mixtral', 'pixtral', 'grok', 'phi', 'kimi', 'minimax', 'glm', 'sora', 'veo', 'whisper',
  'dall-e', 'dalle', 'flux', 'stable diffusion', 'midjourney', 'runway', 'pika', 'luma',
  'ideogram', 'recraft', 'kling', 'hailuo', 'nova', 'titan', 'falcon', 'ernie',
  'command r', 'copilot', 'cursor', 'windsurf', 'devin', 'suno', 'olmo', 'smol', 'hermes',
  'codex', 'jules', 'notebooklm', 'perplexity',
];

// Verbatim release language. A record that names a family and uses one of these is
// treated as describing an identifiable announcement rather than a passing mention.
export const RELEASE_VERBS = /(releas|launch|ship|announc|introduc|unveil|publish|debut|rolls? out|now available|open[- ]sourc|general availability|\bga\b|preview|upgrade|update)/i;

// Platform and method limits this pipeline cannot change. They are recorded here and
// returned with every run, so no report can imply a guarantee that does not exist.
export const DEV_LIMITATIONS = {
  source_grounding:
    'Every stored development is grounded in records already ingested into this app: its supporting item ids and canonical urls come from those records, never from the model. Nothing here consults the open web.',
  excerpt_only:
    'The models see the stored title and excerpt of each record (at most '
    + '700 characters), not the full source page. A development the source states only in its full text is therefore out of reach, and is reported as not extracted rather than guessed.',
  independent_verification:
    'Not performed. The pipeline checks that an evidence quote exists in the stored record and asks an evaluation model whether that quote supports the claim. Neither is independent factual verification, so no stored development is ever marked verified.',
  model_opinion:
    "The support assessment is a model's opinion about the supplied excerpt. It is stored beside the evidence check, never in place of it, and is never presented as a verified fact.",
  cache_semantics:
    'Idempotency is keyed on a fingerprint of each source record (id, canonical url, publication timestamp, title, excerpt). A record whose stored text is unchanged is covered by its earlier analysis and is not sent to a model again; a record whose text changes has a new fingerprint and is analysed afresh. Coverage means "this exact stored text was analysed before", not "this development is unchanged in the world".',
  grouping:
    'Candidate grouping is deterministic: records are linked by a shared named model or version identifier, or by an identical normalised title, and records that share only generic vocabulary are deliberately left apart. The grouping is a candidate list for the extraction step, not a claim about the world.',
  content_state:
    'A record whose stored excerpt is missing is reported as title_only and is not analysed unless an administrator explicitly includes it; a record with no stored text at all is never analysed. Nothing is fetched from the original page, and no excerpt is generated, expanded or inferred to replace a missing one, so such a record can only ever be quoted as its own stored title.',
  research_classification:
    'A research development is accepted only when the stored text names a paper, method, framework, system or dataset, carries publication language, and a verified evidence quote contains that artefact. The kind reflects that contribution even when a versioned model is also mentioned. This makes a record eligible for analysis; it never makes it verified, and independent_verification stays not_performed.',
  calibration:
    'analysis_eligible, event_type and evidence_status are computed deterministically from the stored text, beside the extraction model\'s own reported kind, which is kept unchanged and never overwritten. They classify what the stored text reads as, not what is true: no event type makes a development verified, and a missing excerpt stays a reported evidence limitation rather than being filled in.',
  extraction_recall:
    'A development that the models do not return is simply absent. The pipeline cannot prove that no further development exists in the supplied records.',
  cost:
    'No billed cost is available from the platform. Costs are per-call estimates from published price estimates and provider-returned token usage, recorded separately per provider, and are never presented as billed amounts. A call whose usage is not returned is recorded as unestimated. The pre-call spend ceiling is a guard against future price or cap changes rather than against today\'s batch: with the excerpt cap, the claim caps and these price estimates, a full-size batch estimates far below the ceiling.',
  atomicity:
    'Entity compare-and-swap is an observed behaviour, not a documented guarantee: a guarded single-record update reports how many records it changed, and every claim and call slot fails closed whenever that reported count is not exactly 1.',
  duplicate_anchors:
    'Two simultaneous first attempts for one authorization id can each create a claim record. Both then fail closed, so the attempt is refused rather than executed twice; a fresh authorization id is required to try again.',
  invoke_llm_cancellation:
    'Not supported: the Core InvokeLLM integration documents no abort signal, so a timed-out call cannot cancel the platform request. The pipeline stops waiting and discards the late response.',
  invoke_llm_retry:
    'Not documented and not observable from the app: this pipeline issues exactly one app-level dispatch per reserved call slot, but cannot verify how many upstream requests the platform makes internally.',
  typesafe_cancellation:
    'Requested through the AI SDK abortSignal parameter; whether the transport honours it end to end has not been verified by a live call.',
  typesafe_retry: 'Disabled explicitly with maxRetries: 0, a documented option of the evaluation SDK.',
  resolved_model:
    'Neither provider is documented to return a resolved model identifier. It is recorded only when a call actually returns one, and is never inferred from the requested name.',
  retention: 'Retention is recorded as metadata only. No delete or purge operation exists anywhere in this path.',
  no_schedule:
    'Phase 2A has no schedule, no trigger and no background job: analysis happens only when an administrator explicitly authorizes one batch while the kill switch is armed.',
  production_isolation:
    'Phase 2 writes only to its own analysis entities. Item, Trend, Topic, IngestionRun, User, Save and the Stage 1 proof records are never written by this pipeline.',
};