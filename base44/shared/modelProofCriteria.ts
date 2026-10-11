// Evidence, success-criteria and cost accounting for the Stage 1 proof.
//
// These are pure functions of what an attempt actually produced, so they live
// outside the function body: the mocked contract suite calls them directly and the
// live path calls the same code, so a passing test can never describe logic the
// live run does not use.
//
// Three separate ideas are kept apart here, and none of them is verification:
//   1. the evidence check   - does the quote exist in the stored record (code)
//   2. the model assessment - does the evaluation model judge the quote as supporting
//   3. independent factual verification - not performed by this proof at all
//
// Cost is only ever an estimate, per provider, from that provider's own price
// estimate and that same call's returned usage. Missing usage, or a missing price,
// leaves that part unavailable rather than guessed. Nothing here is billed cost.

export const MIN_QUOTE_SEGMENT_CHARS = 12;

export const EVIDENCE_CONCEPTS = {
  excerpt_present_in_stored_record:
    'checked here, in code: every segment of the evidence quote is matched against the stored record text, in order',
  model_support_assessment:
    "the evaluation model's own judgement about whether the quote supports the claim: a model opinion, not a fact",
  independent_factual_verification:
    'not_performed: no source outside the stored records is consulted, so no claim is verified against the world',
};

// Typographic differences are tolerated; wording is not.
export function normalizeForMatch(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// The evidence quote must exist in the stored record. An elided quote is accepted
// only when every one of its segments is present verbatim AND in its original
// order: each segment must start at or after the end of the previous match, so a
// quote whose fragments appear scattered through the record does not count.
export function quoteMatchInRecord(quote, recordText) {
  const segments = normalizeForMatch(quote)
    .split('...')
    .map((part) => part.trim())
    .filter((part) => part.length >= MIN_QUOTE_SEGMENT_CHARS);

  if (!segments.length) {
    return {
      found: false,
      segments: 0,
      reason: `no quote segment of at least ${MIN_QUOTE_SEGMENT_CHARS} characters to check`,
    };
  }

  let cursor = 0;
  for (const segment of segments) {
    const at = String(recordText || '').indexOf(segment, cursor);
    if (at === -1) {
      return {
        found: false,
        segments: segments.length,
        reason: 'a quote segment is missing from the stored record, or the segments are not in their original order',
      };
    }
    cursor = at + segment.length;
  }
  return { found: true, segments: segments.length, reason: '' };
}

// Success is a conjunction of explicit criteria. Every one must hold: a run whose
// second model was skipped, failed, or returned no usable assessment is not a
// success, however clean the first call looked.
export function evaluateProofCriteria({ callA, callB, claims, evaluations, sources }) {
  const claimList = Array.isArray(claims) ? claims : [];
  const evaluationList = Array.isArray(evaluations) ? evaluations : [];
  const sourceList = Array.isArray(sources) ? sources : [];

  const sourcesComplete = sourceList.length > 0
    && sourceList.every((source) => Boolean(source && source.item_id)
      && Boolean(source && source.canonical_url)
      && String((source && source.text) || '').length > 0);
  const claimsPointAtSources = claimList.length > 0
    && claimList.every((claim) => sourceList.some((source) => source.item_id === claim.item_id));
  const assessmentsCoverClaims = claimList.length > 0
    && evaluationList.length === claimList.length
    && claimList.every((claim) => evaluationList.some((row) => row.claim_id === claim.claim_id && row.model_state !== 'not_evaluated'));

  const criteria = {
    model_a_dispatched: Boolean(callA && callA.dispatches === 1),
    model_a_valid_extraction: Boolean(callA && callA.ok === true && callA.output
      && Array.isArray(callA.output.claims) && claimList.length > 0),
    model_b_dispatched: Boolean(callB && callB.dispatches === 1),
    model_b_valid_assessments: Boolean(callB && callB.ok === true && assessmentsCoverClaims),
    both_provider_calls_completed: Boolean(callA && callA.ok === true && callB && callB.ok === true),
    stored_source_references_valid: sourcesComplete && claimsPointAtSources,
  };

  const failed = Object.keys(criteria).filter((key) => !criteria[key]);
  const total = Object.keys(criteria).length;
  const anyUsable = Boolean((callA && callA.ok === true) || (callB && callB.ok === true));

  return {
    criteria,
    failed_criteria: failed,
    passed: total - failed.length,
    total,
    status: failed.length === 0 ? 'success' : anyUsable ? 'partial' : 'failed',
  };
}

// One call, its own provider price estimate, its own returned usage.
export function perCallCost(entry, priceTable = {}) {
  const call = (entry && entry.call) || {};
  const role = (entry && entry.role) || '';
  const provider = call.provider || '';
  const model = call.requested_model || '';
  const priceKey = `${provider}:${model}`;
  const price = priceTable[priceKey] || null;
  const usage = call.usage_available && call.usage ? call.usage : null;

  const base = {
    role,
    provider,
    requested_model: model,
    price_key: priceKey,
    usage_available: Boolean(usage),
    price_available: Boolean(price),
    estimate_usd: null,
    unavailable_reason: null,
  };

  if (!call.dispatches) {
    return { ...base, unavailable_reason: 'the call was not dispatched, so it has no usage and no estimate' };
  }
  if (!usage) {
    return { ...base, unavailable_reason: 'the provider did not return a usage figure for this call, so no token-based estimate is possible' };
  }
  if (!price) {
    return { ...base, unavailable_reason: `no price estimate is configured for "${priceKey}", so this call is left unestimated` };
  }

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const usd = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;

  return {
    ...base,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    estimate_usd: Number(usd.toFixed(6)),
    unavailable_reason: null,
  };
}

// Per-provider estimate, never one provider's price applied to another's tokens,
// and never a whole-run figure that hides an unestimated call.
export function estimateCostFromCalls(entries, priceTable = {}) {
  const parts = (entries || [])
    .filter((entry) => entry && entry.call)
    .map((entry) => perCallCost(entry, priceTable));
  const priced = parts.filter((part) => part.estimate_usd !== null);
  const available = parts.length > 0 && priced.length === parts.length;
  const sum = priced.reduce((total, part) => total + part.estimate_usd, 0);

  return {
    available,
    estimate_usd: available ? Number(sum.toFixed(6)) : null,
    priced_parts_estimate_usd: Number(sum.toFixed(6)),
    parts_priced: priced.length,
    parts_total: parts.length,
    parts,
    is_billed_cost: false,
    basis: 'each call is priced from its own provider price estimate and the token usage that same call returned; a missing usage figure or a missing price leaves that call unestimated',
    billed_cost_note: 'no billed cost is available: the platform returns no billed amount and no credit figure, so nothing here is presented as billed cost',
  };
}