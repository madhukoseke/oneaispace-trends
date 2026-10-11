// Helpers shared by the Stage 1 provider proof (functions/modelProof) and the Phase 2A
// development analysis (functions/devAnalysis).
//
// These are the parts the two pipelines genuinely have in common: clipping stored text,
// summing provider-returned usage, recording a mocked-test case, reserving a call slot
// through the run's own budget, emitting the audit line for a request refused before its
// authorization is consumed, building the structured evaluation questions, and formatting
// the source block of a prompt. They live here rather than in either function so the two
// cannot drift apart.
//
// Nothing here reads or writes entity data, holds a credential, or decides what may be
// stored: each pipeline keeps its own caps, its own models and its own persistence.

import { sanitizeMessage } from './modelAdapters.ts';

// Stored text is untrusted and is clipped before it is used anywhere: in a prompt, in a
// stored record, or in an error summary.
export function clip(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

// Usage is summed only from the calls that actually returned a figure: a provider that
// reports nothing leaves the total unavailable rather than estimated.
export function usageTotals(calls) {
  const withUsage = (calls || []).filter((call) => call && call.usage_available && call.usage);
  if (!withUsage.length) return null;
  const input = withUsage.reduce((sum, call) => sum + (call.usage.input_tokens || 0), 0);
  const output = withUsage.reduce((sum, call) => sum + (call.usage.output_tokens || 0), 0);
  return { input_tokens: input, output_tokens: output, reported_by_calls: withUsage.length };
}

// One mocked-test case recorder. A case that throws is a failed case with its sanitized
// message, never a crash that hides the rest of the suite.
export function createCaseRecorder(cases) {
  return async function record(name, fn) {
    try {
      const detail = await fn();
      cases.push({ name, ok: detail.ok !== false, detail: detail.note !== undefined ? detail.note : detail });
    } catch (error) {
      cases.push({ name, ok: false, detail: sanitizeMessage(error) });
    }
  };
}

// The call-budget reservation, bound to one run record: a provider call is identified by
// its named slot, and the holder label records which provider and model took it.
export function makeReserve(reserveCallSlot, db, anchorId) {
  return (request) => reserveCallSlot(db, anchorId, String(request.slot || ''), `${request.provider}:${request.model}`);
}

// A request refused before its one-time authorization is consumed creates no record: it
// is answered here and left in the runtime log, so repeated unauthorized attempts cannot
// grow either store.
export function refusalBody({ auditKey, pipeline, category, action, runId, user, killSwitch, summary, extra = {} }) {
  console.log(JSON.stringify({
    [auditKey]: 'refused_before_authorization',
    pipeline,
    category,
    action,
    run_id: runId,
    operator_id: user.id,
    operator_role: user.role,
    kill_switch: killSwitch,
    at: new Date().toISOString(),
  }));
  return {
    ok: false,
    status: 'blocked',
    run_id: runId,
    error_category: category,
    reason: summary,
    model_calls: 0,
    provider_calls: 0,
    authorization_consumed: false,
    record_created: false,
    kill_switch: killSwitch,
    ...extra,
  };
}

// The support-assessment choices. "not_evaluated" is deliberately not offered to a model:
// it is the app-level state for a claim no evaluation was obtained for.
export const SUPPORT_CRITERIA = {
  supported: 'The quoted evidence states the claim directly, with nothing important left out or added.',
  mixed: 'The evidence supports part of the claim, but another part is unstated, weaker or broader.',
  insufficient_evidence: 'The evidence does not address the claim, or is too vague to judge.',
  contradicted: 'The evidence conflicts with the claim.',
};

export function buildSupportQuestions(claims) {
  const questions = {};
  for (const claim of claims || []) {
    questions[claim.claim_id] = {
      type: 'choice',
      instructions: 'Judge only from the supplied source text. Does the quoted evidence support the claim?',
      criteria: SUPPORT_CRITERIA,
    };
  }
  return questions;
}

// The SOURCES block of an extraction prompt. The url is included only where the pipeline
// needs to detect a citation that does not match the stored record.
export function formatSourceBlock(sources, options = {}) {
  const includeUrl = options.includeUrl === true;
  return (sources || []).map((source) => `[${source.item_id}] source=${source.source} published_at=${source.published_at || 'unknown'}${includeUrl ? ` url=${source.canonical_url}` : ''} :: ${source.text}`);
}