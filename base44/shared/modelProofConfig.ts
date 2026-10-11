// Stage 1 proof configuration: the kill switch, the caps and the retention window.
//
// execution_enabled is the master kill switch for every provider call. It is off
// by default and no code in this app can turn it on: the only way to arm it is a
// deliberate edit of this file by a human. Because the switch is a source-level
// constant rather than a stored flag, it cannot be left on by a previous run that
// forgot to reset it - a run never turns it on, and it is therefore off before and
// after every attempt.
//
// These values are the whole configuration surface - there is no dashboard and no
// public trigger. Each call additionally requires an admin caller, an explicit
// execute flag, a fresh run id and an unconsumed one-time authorization id.

export const PROOF_CONFIG = {
  // Off by default and untouched by the proof itself.
  execution_enabled: false,
  stage: 'stage1-provider-proof',
  max_records: 3,
  // One call per provider and two calls in total: the run record carries exactly
  // two call slots (call_slot_a, call_slot_b), one per provider, and each slot is
  // consumed by an atomic guarded update before its dispatch. Because only two
  // slots exist, the total cap holds structurally as well as numerically.
  max_calls_per_provider: 1,
  max_calls_total: 2,
  max_claims: 8,
  max_claims_per_item: 2,
  max_excerpt_chars: 700,
  max_evidence_quote_chars: 240,
  min_evidence_quote_chars: 25,
  allow_retries: false,
  spend_ceiling_usd: 0.25,
  retention_days: 30,
  timeout_ms: 60000,
  max_stored_output_items: 8,
  require_authorization: true,

  // The two genuinely distinct models, on two distinct providers, with two
  // distinct tasks. Model A extracts what the stored records state; Model B is a
  // structured evaluation model that judges support from the same text.
  model_a: { provider: 'base44-core', model: 'gpt_6_luna', task_kind: 'extraction' },
  model_b: { provider: 'typesafe', model: 'jev', task_kind: 'support_evaluation' },
};

// Platform capabilities this proof cannot guarantee. These are recorded here, and
// returned with every run, so no report can imply a guarantee that does not exist.
export const PLATFORM_LIMITATIONS = {
  atomicity:
    'Entity compare-and-swap is an observed behaviour, not a documented guarantee: a guarded single-record update reports how many records it changed, and tests observed exactly one winner under concurrency. Every claim and every call slot therefore fails closed whenever that reported count is not exactly 1.',
  duplicate_anchors:
    'Two simultaneous first attempts for one authorization id can each create a claim record. Both then fail closed, so the attempt is refused rather than executed twice; a fresh authorization id is required to try again.',
  invoke_llm_cancellation:
    'Not supported: the Core InvokeLLM integration documents no abort signal, so a timed-out call cannot cancel the platform request. The app stops waiting and discards the late response.',
  invoke_llm_retry:
    'Not documented and not observable from the app: this app issues exactly one app-level dispatch per reserved call slot, but it cannot verify how many upstream requests the platform makes internally.',
  typesafe_cancellation:
    'Requested through the AI SDK abortSignal parameter; whether the transport honours it end to end has not been verified by a live call.',
  typesafe_retry: 'Disabled explicitly with maxRetries: 0, a documented option of the evaluation SDK.',
  resolved_model:
    'Neither provider is documented to return a resolved model identifier. It is recorded only when a call actually returns one, and is never inferred from the requested name.',
  retention: 'Retention is recorded as metadata only. No delete or purge operation exists anywhere in this path.',
  independent_verification:
    'Not performed. The proof checks whether an evidence quote exists in the stored record, and asks a model whether that quote supports the claim. Neither is independent factual verification: no source outside the stored records is consulted.',
  cost:
    'No billed cost is available from the platform. Costs are per-call estimates from published price estimates and provider-returned token usage, recorded separately per provider, and are never presented as billed amounts.',
  blocked_before_authorization:
    'A request refused before the one-time authorization is claimed is answered and logged, but no proof-run record is created for it, so repeated unauthorized attempts cannot grow the proof store without bound.',
};

// Published third-party list prices per million tokens, used only to size a
// conservative pre-call estimate so the spend ceiling can be enforced before any
// call. They are not billed rates, the alias-to-upstream-model mapping is not
// verified, and any cost the provider does not return is recorded as unknown.
export const PRICE_ESTIMATES_USD_PER_MTOK = {
  'base44-core:gpt_6_luna': { input: 0.2, output: 1.2 },
  'typesafe:jev': { input: 0.042, output: 0 },
};

// Worst-case output tokens assumed per unit of work when sizing the estimate.
export const ESTIMATE_TOKENS = {
  chars_per_token: 4,
  output_tokens_per_claim: 120,
  output_tokens_per_question: 40,
};