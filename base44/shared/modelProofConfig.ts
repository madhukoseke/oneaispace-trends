// Stage 1 proof configuration: the kill switch, the caps and the retention window.
//
// execution_enabled is the master kill switch for every provider call. It is off
// by default; Stage 1 turns it on only for the single capped manual proof and
// turns it back off afterwards, so no recurring path can call a provider.
//
// These values are the whole configuration surface - there is no dashboard and no
// public trigger. Each call additionally requires an explicit execute flag in the
// payload, an admin caller, and a fresh run id.

export const PROOF_CONFIG = {
  execution_enabled: true, // Stage 1: enabled only for the single capped manual proof
  stage: 'stage1-provider-proof',
  max_records: 5,
  max_calls_per_provider: 2,
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

  // The two genuinely distinct models, on two distinct providers, with two
  // distinct tasks. Model A extracts what the stored records state; Model B is a
  // structured evaluation model that judges support from the same text.
  model_a: { provider: 'base44-core', model: 'gpt_6_luna', task_kind: 'extraction' },
  model_b: { provider: 'typesafe', model: 'jev', task_kind: 'support_evaluation' },
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