// The development-analysis pipeline itself: the extraction call, the claim validation against
// the stored records, the assessment call, and the rows that would be stored.
//
// It is used unchanged by the live authorized batch and by the mocked-provider suite, so a
// passing test can never describe logic the live path does not use. Persistence is the
// caller's step, which is what lets the suite inspect the artifacts before anything is
// written.
//
// Nothing here decides whether a batch may run: the kill switch, the one-time authorization
// and the call budget are checked by the caller and by the adapter, and the per-call
// reservation is passed in as a dependency.

import { DEV_ANALYSIS_CONFIG } from './devAnalysisConfig.ts';
import { callModel } from './modelAdapters.ts';
import { estimateCostFromCalls } from './modelProofCriteria.ts';
import { buildSupportQuestions, usageTotals } from './pipelineSupport.ts';
import {
  collectClaims, estimateBatchWorstCase, evaluateBatchCriteria, finalizeDevelopments, validModelState,
} from './devAnalysisCriteria.ts';
import { EXTRACTION_SCHEMA, buildDevelopmentExtractionPrompt } from './devAnalysisPrompt.ts';

export function normalizeAnswers(callB) {
  const verdicts = {};
  if (!callB || !callB.output || typeof callB.output !== 'object') return verdicts;
  const answers = callB.output.answers || {};
  const confidence = callB.output.confidence || {};
  for (const [claimId, answer] of Object.entries(answers)) {
    const choice = answer && typeof answer === 'object' ? answer.choice : answer;
    verdicts[claimId] = {
      model_state: validModelState(choice),
      probabilities: (answer && answer.probabilities) || null,
      confidence: typeof confidence[claimId] === 'number' ? confidence[claimId] : null,
    };
  }
  return verdicts;
}

export async function runPipeline({ deps, sources, runId, config = DEV_ANALYSIS_CONFIG }) {
  const estimate = estimateBatchWorstCase({ sources, maxClaims: config.max_claims, config });
  const callsPerProvider = {};

  const callA = await callModel({
    provider: config.model_a.provider,
    model: config.model_a.model,
    prompt: buildDevelopmentExtractionPrompt(sources),
    response_json_schema: EXTRACTION_SCHEMA,
    timeout_ms: config.timeout_ms,
    call_cap: config.max_calls_per_provider,
    calls_already_made: 0,
    call_slot: 'a',
    task_kind: config.model_a.task_kind,
  }, deps);
  callsPerProvider[config.model_a.provider] = (callsPerProvider[config.model_a.provider] || 0) + callA.dispatches;

  const collected = collectClaims({
    rawDevelopments: callA.output && callA.output.developments,
    sources,
    config,
    runId,
  });

  let callB = null;
  let verdicts = {};
  if (collected.candidates.length) {
    callB = await callModel({
      provider: config.model_b.provider,
      model: config.model_b.model,
      state: {
        sources: sources.map((source) => ({
          item_id: source.item_id, source: source.source, published_at: source.published_at, text: source.text,
        })),
        claims: collected.candidates.flatMap((candidate) => candidate.claims.map((claim) => ({
          id: claim.claim_id, item_id: claim.item_id, claim: claim.claim_text, evidence_quote: claim.evidence_quote,
        }))),
      },
      questions: buildSupportQuestions(collected.candidates.flatMap((candidate) => candidate.claims.map((claim) => ({
        claim_id: claim.claim_id, claim: claim.claim_text,
      })))),
      timeout_ms: config.timeout_ms,
      call_cap: config.max_calls_per_provider,
      calls_already_made: 0,
      call_slot: 'b',
      task_kind: config.model_b.task_kind,
    }, deps);
    callsPerProvider[config.model_b.provider] = (callsPerProvider[config.model_b.provider] || 0) + callB.dispatches;
    verdicts = normalizeAnswers(callB);
  }

  const finalized = finalizeDevelopments({
    claimCandidates: collected.candidates,
    evaluations: verdicts,
    sources,
    runId,
    config,
  });

  const calls = [callA, callB].filter(Boolean);
  const usage = usageTotals(calls);
  const cost = estimateCostFromCalls(calls.map((call, index) => ({ call, role: index === 0 ? 'A' : 'B' })), config.price_table);
  const verdict = evaluateBatchCriteria({
    callA,
    callB,
    developments: finalized.developments,
    claims: finalized.claims,
    sources,
    spendWithinCeiling: estimate.within_ceiling,
    config,
  });

  return {
    estimate,
    callA,
    callB,
    collected,
    verdicts,
    finalized,
    callsPerProvider,
    usage,
    cost,
    criteria: verdict.criteria,
    failed_criteria: verdict.failed_criteria,
    passed: verdict.passed,
    total: verdict.total,
    status: verdict.status,
    modelCalls: calls.reduce((sum, call) => sum + (call.dispatches || 0), 0),
  };
}