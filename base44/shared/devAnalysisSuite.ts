// The mocked-provider test suite for the development-analysis pipeline.
//
// Every case runs against a scripted transport, so no provider is called and nothing is spent.
// The grouping, content-state, evidence, classification, criteria, cost and idempotency cases
// call the same modules the live batch calls; the persistence, budget and coverage cases use
// the real analysis entities, because that is the behaviour under test; and the feed cases use
// the feed module the public function uses, with a database stub that throws on any write.

import { DEV_ANALYSIS_CONFIG, DEV_LIMITATIONS } from './devAnalysisConfig.ts';
import { callModel } from './modelAdapters.ts';
import { estimateCostFromCalls } from './modelProofCriteria.ts';
import { scanForSecrets } from './modelProofTrace.ts';
import {
  contentState, fingerprintSourceSet, groupCandidates, itemFingerprint, planBatch, researchEvidenceOf,
  validateBatchRequest,
} from './devAnalysisGrouping.ts';
import {
  buildDryRunReport, buildSourceView, estimateBatchWorstCase, selectAnalysable,
} from './devAnalysisCriteria.ts';
import {
  buildCallDetails, buildDevRunRecord, buildRejectionReport, findRunById, listClaims, listDevelopments,
  persistCacheEntry, persistClaims, persistDevelopments, persistRun, readCacheEntries, reserveCallSlot, updateRun,
} from './devAnalysisTrace.ts';
import { createCaseRecorder } from './pipelineSupport.ts';
import { FEED_LIMIT_MAX, loadFeedInputs, resolveDevelopment, resolveFeed } from './devFeed.ts';
import { runPipeline } from './devAnalysisPipeline.ts';

function fixtureItems() {
  return [
    {
      id: 'itm_gpt6_a', source: 'Example News', source_key: 'example',
      title: 'GPT-6 Luna benchmark results published',
      excerpt: 'OpenAI said GPT-6 Luna is available today with a 2M-token context window and native tool use.',
      canonical_url: 'https://example.com/gpt6-luna', published_at: '2026-10-10T12:00:00.000Z',
    },
    {
      id: 'itm_gpt6_b', source: 'Other Example', source_key: 'other',
      title: 'Independent GPT-6 Luna benchmark results released',
      excerpt: 'Independent benchmarks for GPT-6 Luna report a 2M-token context window and native tool use.',
      canonical_url: 'https://other.example.org/gpt6-luna-benchmarks', published_at: '2026-10-10T15:00:00.000Z',
    },
    // One identifier, three different variants: these three must never be joined into one
    // development, however much wording they share.
    {
      id: 'itm_gemini_flash', source: 'Example News', source_key: 'example',
      title: 'Introducing Gemini 3.8 Flash',
      excerpt: 'A low-latency variant for high-volume inference, available today.',
      canonical_url: 'https://example.com/gemini-38-flash', published_at: '2026-10-07T12:00:00.000Z',
    },
    {
      id: 'itm_gemini_live', source: 'Another Outlet', source_key: 'another',
      title: 'Introducing Gemini 3.8 Live',
      excerpt: 'A real-time multimodal variant for interactive sessions, available today.',
      canonical_url: 'https://example.net/gemini-38-live', published_at: '2026-10-06T09:00:00.000Z',
    },
    {
      id: 'itm_gemini_live_avatar', source: 'Another Outlet', source_key: 'another',
      title: 'Introducing Gemini 3.8 Live with Live Avatar',
      excerpt: 'A variant that adds an animated avatar to interactive sessions.',
      canonical_url: 'https://example.net/gemini-38-live-avatar', published_at: '2026-10-05T09:00:00.000Z',
    },
    {
      id: 'itm_agent_x', source: 'Example News', source_key: 'example',
      title: 'New agent framework for local inference',
      excerpt: 'A new open-source agent framework for local inference and workflow automation.',
      canonical_url: 'https://example.com/agent-framework', published_at: '2026-10-09T09:00:00.000Z',
    },
    {
      id: 'itm_agent_y', source: 'Example News', source_key: 'example',
      title: 'Another agent tool for cloud workflows',
      excerpt: 'This agent platform targets cloud workflows, tool use and automation.',
      canonical_url: 'https://example.com/agent-tool', published_at: '2026-10-09T10:00:00.000Z',
    },
    {
      id: 'itm_dup_1', source: 'Example News', source_key: 'example',
      title: 'Qwen-3.5 released for local inference',
      excerpt: 'The Qwen-3.5 release targets local inference on consumer hardware.',
      canonical_url: 'https://example.com/qwen35', published_at: '2026-10-08T08:00:00.000Z',
    },
    {
      id: 'itm_dup_2', source: 'Example News', source_key: 'example',
      title: 'Qwen-3.5 released for local inference',
      excerpt: 'The Qwen-3.5 release targets local inference on consumer hardware.',
      canonical_url: 'https://example.com/qwen35?utm_campaign=newsletter', published_at: '2026-10-08T08:30:00.000Z',
    },
  ];
}

function multiSourceDevelopments() {
  return [{
    title: 'GPT-6 Luna released with a 2M-token context window',
    summary: 'The stored records state that GPT-6 Luna is available with a 2M-token context window and native tool use.',
    why_it_matters: 'A 2M-token context window with native tool use changes what a single call can process.',
    kind: 'model_release',
    model_identifiers: ['GPT-6 Luna'],
    model_versions: ['2M-token'],
    group_key: 'gpt6-luna',
    claims: [
      {
        item_id: 'itm_gpt6_a',
        claim: 'GPT-6 Luna is available with a 2M-token context window',
        evidence_quote: 'GPT-6 Luna is available today with a 2M-token context window',
        source_url: 'https://example.com/gpt6-luna',
        published_at: '2026-10-10T12:00:00.000Z',
      },
      {
        item_id: 'itm_gpt6_b',
        claim: 'GPT-6 Luna has native tool use',
        evidence_quote: 'a 2M-token context window and native tool use',
        source_url: 'https://other.example.org/gpt6-luna-benchmarks',
        published_at: '2026-10-10T15:00:00.000Z',
      },
    ],
  }];
}

function scriptedTransport({ developments, answers, failA, failB, usageA, usageB }) {
  return async (request) => {
    if (request.provider === 'base44-core') {
      if (failA) throw new Error(failA);
      return {
        output: { developments },
        usage: usageA === undefined ? { input_tokens: 1200, output_tokens: 260 } : usageA,
        resolved_model: null,
      };
    }
    if (failB) throw new Error(failB);
    return {
      output: { answers: answers || {}, confidence: {} },
      usage: usageB === undefined ? { input_tokens: 640, output_tokens: 0 } : usageB,
      resolved_model: null,
    };
  };
}

function callBDispatched(pipeline) {
  return Boolean(pipeline.callB && pipeline.callB.dispatches > 0);
}

// Records the stored texts a research case works from. None of them carries a versioned model
// identifier, which is the point: the artefact and the publication language are all there is.
function researchItems() {
  return [
    {
      id: 'itm_quine', source: 'arXiv', source_key: 'arxiv',
      title: 'Quine: A Self-Compiling Language for Agentic Systems',
      excerpt: 'We propose Quine, a self-compiling language for agentic systems, and evaluate it on three benchmarks.',
      canonical_url: 'https://arxiv.org/abs/2510.00001', published_at: '2026-10-04T09:00:00.000Z',
    },
    {
      id: 'itm_merit', source: 'arXiv', source_key: 'arxiv',
      title: 'MERIT: A Benchmark for Multi-Step Reasoning',
      excerpt: 'We introduce MERIT, a benchmark for multi-step reasoning, and report results for GPT-6 Luna.',
      canonical_url: 'https://arxiv.org/abs/2510.00002', published_at: '2026-10-03T09:00:00.000Z',
    },
    {
      id: 'itm_ecology', source: 'arXiv', source_key: 'arxiv',
      title: 'The Ecology of AI Agents',
      excerpt: 'This paper surveys the ecology of AI agents and the incentives that shape them.',
      canonical_url: 'https://arxiv.org/abs/2510.00003', published_at: '2026-10-02T09:00:00.000Z',
    },
  ];
}

// A parent run that would qualify for the feed, and the development and claims it produced.
function liveRunFixture(overrides = {}) {
  return {
    run_id: 'run_live_1', stage: DEV_ANALYSIS_CONFIG.stage, action: 'analyze', dry_run: false,
    status: 'success', execution_flag: true, kill_switch_state: 'on', claim_state: 'consumed',
    claim_token: 'token-abcdefgh', authorization_id: 'auth-abcdefgh', operator_role: 'admin',
    source_fingerprint: 'fp_live', ...overrides,
  };
}

function liveDevelopmentFixture(overrides = {}) {
  return {
    development_id: 'dev_live_1', run_id: 'run_live_1', stage: DEV_ANALYSIS_CONFIG.stage, status: 'accepted',
    source_fingerprint: 'fp_live', source_urls: ['https://arxiv.org/abs/2510.00001'],
    primary_published_at: '2026-10-04T09:00:00.000Z',
    title: 'Quine: A Self-Compiling Language for Agentic Systems', kind: 'research',
    kind_basis: 'research contribution from the stored text', summary: 'The paper proposes Quine.',
    why_it_matters: 'A self-compiling language for agentic systems.', claim_ids: ['claim_1'],
    supporting_item_ids: ['itm_quine'], support_state: 'evidence_supported_by_model',
    source_states_claim: true, evidence_supported_by_model: true, ...overrides,
  };
}

function liveClaimsFixture() {
  return [{
    claim_id: 'claim_1', run_id: 'run_live_1', item_id: 'itm_quine', source: 'arXiv',
    canonical_url: 'https://arxiv.org/abs/2510.00001', published_at: '2026-10-04T09:00:00.000Z',
    evidence_quote: 'We propose Quine, a self-compiling language for agentic systems', quote_in_record: true,
  }];
}

export async function runSuite({ db, base44, runId }) {
  const cases = [];
  const recordBase = createCaseRecorder(cases);
  // The cases are spaced out because this suite makes many entity calls in a few seconds and
  // the platform throttles a burst. Spacing them is what keeps a throttled reservation from
  // being needed at all; the retry above is the fallback, not the mechanism.
  const record = async (name, fn) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return recordBase(name, fn);
  };

  const items = fixtureItems();
  const sources = buildSourceView(items);
  const grouping = groupCandidates(items);

  // The suite's anchors are created in one batch and read back once, before any case reserves a
  // slot on one of them: the live path also works from a record the store has handed back
  // (it reads its anchor back after consuming its one-time authorization), and creating them
  // together keeps this suite's own entity-call burst small.
  const ANCHOR_KEYS = [
    'multi', 'unsupported', 'noquote', 'badid', 'hallucinated', 'partial', 'empty', 'extractfail',
    'idempotent', 'roundtrip', 'budget', 'callcap', 'states',
    'res-quine', 'res-merit', 'res-negative1', 'res-negative2',
  ];
  const anchors = {};
  {
    await db.DevAnalysisRun.bulkCreate(ANCHOR_KEYS.map((key) => buildDevRunRecord({
      run_id: `${runId}-${key}`, action: 'suite', status: 'running',
      authorization_id: `${runId}-${key}`, notes: `suite anchor ${key}`,
    })));
    const page = await db.DevAnalysisRun.filter(
      { run_id: { $in: ANCHOR_KEYS.map((key) => `${runId}-${key}`) } },
      { limit: ANCHOR_KEYS.length },
    );
    for (const row of page.items || []) anchors[row.run_id] = row;
  }

  const anchorFor = async (key) => {
    const found = anchors[`${runId}-${key}`];
    if (found) return found;
    const created = await persistRun(db, buildDevRunRecord({
      run_id: `${runId}-${key}`, action: 'suite', status: 'running',
      authorization_id: `${runId}-${key}`, notes: `suite anchor ${key}`,
    }));
    const resolved = (await findRunById(db, created.run_id)) || created;
    anchors[`${runId}-${key}`] = resolved;
    return resolved;
  };

  // A guarded slot update is refused when the platform throttles it under a burst of entity
  // calls. That refusal consumes nothing, so reserveCallSlot itself retries it a bounded number
  // of times and reports a slot that is genuinely taken without retrying - this suite therefore
  // calls it directly and does not add a second retry layer of its own.
  const pipelineDeps = (anchor, transport) => ({
    base44,
    getTypesafeConnection: async () => ({ baseURL: 'stub://typesafe', token: 'stub-value', headers: {} }),
    reserve: (request) => reserveCallSlot(db, anchor.id, String(request.slot || ''), `${request.provider}:${request.model}`),
    transport,
  });

  // --- grouping.
  await record('grouping.duplicate_source_records_deduplicated', async () => {
    const duplicate = grouping.duplicates.find((entry) => entry.duplicate_item_ids.includes('itm_dup_1'));
    const uniqueCanonical = new Set(items.map((item) => `${item.canonical_url}`.split('?')[0])).size;
    return {
      ok: Boolean(duplicate) && duplicate.kept_item_id === 'itm_dup_2'
        && grouping.records_analysed === items.length - 1
        && grouping.candidates.every((candidate) => !candidate.item_ids.includes('itm_dup_1')),
      note: { kept: duplicate && duplicate.kept_item_id, duplicates: grouping.duplicates.length, analysed: grouping.records_analysed, unique_canonical: uniqueCanonical },
    };
  });

  await record('grouping.unrelated_records_shared_keywords_not_merged', async () => {
    const refused = grouping.refused_merges.find((entry) => entry.item_ids.includes('itm_agent_x') && entry.item_ids.includes('itm_agent_y'));
    const xGroup = grouping.candidates.find((candidate) => candidate.item_ids.includes('itm_agent_x'));
    const yGroup = grouping.candidates.find((candidate) => candidate.item_ids.includes('itm_agent_y'));
    return {
      ok: Boolean(refused) && refused.shared_generic_tokens.length > 0
        && Boolean(xGroup) && Boolean(yGroup) && xGroup.group_key !== yGroup.group_key,
      note: {
        shared_generic_tokens: refused && refused.shared_generic_tokens.slice(0, 6),
        x_group: xGroup && xGroup.group_key, y_group: yGroup && yGroup.group_key,
        x_group_size: xGroup && xGroup.item_ids.length,
      },
    };
  });

  await record('grouping.same_model_and_variant_multiple_sources_grouped', async () => {
    const group = grouping.candidates.find((candidate) => candidate.item_ids.includes('itm_gpt6_a'));
    return {
      ok: Boolean(group) && group.item_ids.includes('itm_gpt6_b') && group.supporting_sources === 2
        && group.basis === 'same_model_and_variant' && group.shared_anchors.includes('gpt-6|luna-results'),
      note: {
        basis: group && group.basis, anchors: group && group.shared_anchors,
        tokens: group && group.shared_tokens, item_ids: group && group.item_ids,
      },
    };
  });

  // The correction this rule exists for: one identifier, several variants. A shared version
  // number is not evidence of one release, so each of these three stays its own candidate and
  // every pair is reported as a refusal with the variant each side named.
  await record('grouping.same_identifier_different_variant_not_merged', async () => {
    const ids = ['itm_gemini_flash', 'itm_gemini_live', 'itm_gemini_live_avatar'];
    const groups = ids.map((id) => grouping.candidates.find((candidate) => candidate.item_ids.includes(id)));
    const refused = grouping.refused_merges.filter((entry) => entry.item_ids.every((id) => ids.includes(id)));
    const distinct = new Set(groups.map((group) => group && group.group_key)).size === ids.length;
    return {
      ok: groups.every(Boolean) && distinct && refused.length === 3
        && refused.every((entry) => (entry.shared_version_tokens || []).includes('gemini-3.8'))
        && refused.some((entry) => entry.item_ids.includes('itm_gemini_live') && entry.item_ids.includes('itm_gemini_live_avatar')),
      note: {
        group_keys: groups.map((group) => group && group.group_key),
        refusals: refused.map((entry) => ({
          item_ids: entry.item_ids, shared_version_tokens: entry.shared_version_tokens,
          variants: [entry.variants_left, entry.variants_right],
        })),
      },
    };
  });

  // --- the full pipeline, with one development supported by two stored records.
  await record('pipeline.multi_source_development_grounded_in_stored_records', async () => {
    const anchor = await anchorFor('multi');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: multiSourceDevelopments(),
        answers: { claim_1: { choice: 'supported' }, claim_2: { choice: 'supported' } },
      })),
      sources, runId: `${runId}-multi`,
    });
    const development = pipeline.finalized.developments[0];
    const storedUrls = sources.map((source) => source.canonical_url);
    return {
      ok: pipeline.status === 'success' && pipeline.modelCalls === 2
        && Boolean(development) && development.supporting_item_ids.length === 2
        && development.source_urls.every((url) => storedUrls.includes(url))
        && development.primary_published_at === '2026-10-10T12:00:00.000Z'
        && development.source_states_claim === true && development.evidence_supported_by_model === true
        && development.independent_verification === 'not_performed'
        && development.support_state === 'evidence_supported_by_model',
      note: {
        status: pipeline.status, model_calls: pipeline.modelCalls,
        supporting_item_ids: development && development.supporting_item_ids,
        source_urls: development && development.source_urls,
        support_state: development && development.support_state,
        criteria: pipeline.criteria,
      },
    };
  });

  await record('pipeline.unsupported_claim_not_presented_as_verified', async () => {
    const anchor = await anchorFor('unsupported');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: multiSourceDevelopments(),
        answers: { claim_1: { choice: 'insufficient_evidence' }, claim_2: { choice: 'contradicted' } },
      })),
      sources, runId: `${runId}-unsupported`,
    });
    const development = pipeline.finalized.developments[0];
    return {
      ok: Boolean(development) && development.evidence_supported_by_model === false
        && development.source_states_claim === true
        && development.support_state === 'contradicted_by_evaluator'
        && pipeline.finalized.claims.every((claim) => claim.independent_verification === 'not_performed')
        && pipeline.finalized.claims.some((claim) => claim.assessment_state === 'contradicted'),
      note: {
        support_state: development && development.support_state,
        evidence_supported: development && development.evidence_supported_by_model,
        source_states_claim: development && development.source_states_claim,
        assessments: pipeline.finalized.claims.map((claim) => claim.assessment_state),
      },
    };
  });

  await record('pipeline.missing_evidence_quote_rejected', async () => {
    const anchor = await anchorFor('noquote');
    const broken = multiSourceDevelopments();
    broken[0].claims = [{ item_id: 'itm_gpt6_a', claim: 'GPT-6 Luna is available', evidence_quote: '', source_url: 'https://example.com/gpt6-luna', published_at: '2026-10-10T12:00:00.000Z' }];
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({ developments: broken })),
      sources, runId: `${runId}-noquote`,
    });
    const rejection = pipeline.collected.rejected_claims[0];
    return {
      ok: pipeline.collected.rejected_claims.length === 1 && rejection.reason_code === 'missing_evidence_quote'
        && pipeline.finalized.developments.length === 0 && pipeline.modelCalls === 1
        && pipeline.status === 'no_findings' && callBDispatched(pipeline) === false,
      note: { reason: rejection && rejection.reason_code, developments: pipeline.finalized.developments.length, status: pipeline.status, model_calls: pipeline.modelCalls },
    };
  });

  await record('pipeline.invalid_source_id_rejected', async () => {
    const anchor = await anchorFor('badid');
    const broken = multiSourceDevelopments();
    broken[0].claims = [{ item_id: 'itm_not_supplied', claim: 'GPT-6 Luna is available', evidence_quote: 'GPT-6 Luna is available today with a 2M-token context window' }];
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({ developments: broken })),
      sources, runId: `${runId}-badid`,
    });
    const rejection = pipeline.collected.rejected_claims[0];
    return {
      ok: pipeline.collected.rejected_claims.length === 1 && rejection.reason_code === 'unknown_item_id'
        && pipeline.finalized.claims.length === 0 && pipeline.finalized.developments.length === 0,
      note: { reason: rejection && rejection.reason_code, claims_stored: pipeline.finalized.claims.length },
    };
  });

  await record('pipeline.hallucinated_citation_rejected_and_not_stored', async () => {
    const anchor = await anchorFor('hallucinated');
    const broken = multiSourceDevelopments();
    broken[0].claims = [{
      item_id: 'itm_gpt6_a',
      claim: 'GPT-6 Luna is available with a 2M-token context window',
      evidence_quote: 'GPT-6 Luna is available today with a 2M-token context window',
      source_url: 'https://invented.example.net/gpt-6-luna-announcement',
      published_at: '2026-10-11T12:00:00.000Z',
    }];
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: broken,
        answers: { claim_1: { choice: 'supported' } },
      })),
      sources, runId: `${runId}-hallucinated`,
    });
    const development = pipeline.finalized.developments[0];
    const claim = pipeline.finalized.claims[0];
    return {
      ok: Boolean(development) && development.source_urls.length === 1
        && development.source_urls[0] === 'https://example.com/gpt6-luna'
        && !development.source_urls.includes('https://invented.example.net/gpt-6-luna-announcement')
        && claim.citation.url_matches_stored === false && claim.citation_accepted === false
        && claim.citation.reported_url === 'https://invented.example.net/gpt-6-luna-announcement'
        && claim.citation.used_as_source === false
        && pipeline.collected.counts.fabricated_citations === 1
        && pipeline.criteria.citations_allowlisted === true,
      note: {
        stored_urls: development && development.source_urls,
        citation: claim && claim.citation,
        fabricated_citations: pipeline.collected.counts.fabricated_citations,
      },
    };
  });

  await record('pipeline.partial_model_failure', async () => {
    const anchor = await anchorFor('partial');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({ developments: multiSourceDevelopments(), failB: '503 upstream unavailable' })),
      sources, runId: `${runId}-partial`,
    });
    const development = pipeline.finalized.developments[0];
    return {
      ok: pipeline.status === 'partial' && pipeline.modelCalls === 2
        && pipeline.callB.ok === false && pipeline.callB.error.category === 'provider_error'
        && pipeline.criteria.model_b_valid_assessments === false
        && Boolean(development) && development.source_states_claim === true
        && development.evidence_supported_by_model === false
        && pipeline.finalized.claims.every((claim) => claim.assessment_state === 'not_evaluated'),
      note: {
        status: pipeline.status, error: pipeline.callB.error, support_state: development && development.support_state,
        assessments: pipeline.finalized.claims.map((claim) => claim.assessment_state),
      },
    };
  });

  await record('pipeline.empty_extraction_is_no_findings_not_success', async () => {
    const anchor = await anchorFor('empty');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({ developments: [] })),
      sources, runId: `${runId}-empty`,
    });
    return {
      ok: pipeline.status === 'no_findings' && pipeline.modelCalls === 1
        && pipeline.criteria.model_a_valid_extraction === true && callBDispatched(pipeline) === false,
      note: { status: pipeline.status, model_calls: pipeline.modelCalls, criteria: pipeline.criteria },
    };
  });

  await record('pipeline.extraction_failure_is_not_success', async () => {
    const anchor = await anchorFor('extractfail');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({ developments: [], failA: '429 rate limit exceeded' })),
      sources, runId: `${runId}-extractfail`,
    });
    return {
      ok: pipeline.status === 'failed' && pipeline.callA.ok === false
        && pipeline.callA.error.category === 'rate_limited' && pipeline.callA.dispatches === 1
        && pipeline.finalized.developments.length === 0,
      note: { status: pipeline.status, error: pipeline.callA.error },
    };
  });

  // --- idempotency, against the real analysis cache entity.
  await record('persistence.idempotent_repeat_needs_no_model_call', async () => {
    const processed = items.filter((item) => item.id.startsWith('itm_gpt6_'));
    const processedSources = sources.filter((source) => processed.some((item) => item.id === source.item_id));
    let dispatches = 0;
    const countingTransport = scriptedTransport({
      developments: multiSourceDevelopments(),
      answers: { claim_1: { choice: 'supported' }, claim_2: { choice: 'supported' } },
    });
    const anchor = await anchorFor('idempotent');
    const first = await runPipeline({
      deps: pipelineDeps(anchor, async (request) => { dispatches += 1; return countingTransport(request); }),
      sources: processedSources, runId: `${runId}-idem-first`,
    });
    await persistCacheEntry(db, {
      fingerprint: fingerprintSourceSet(processed),
      item_fingerprints: processed.map(itemFingerprint),
      source_item_ids: processed.map((item) => item.id),
      run_id: `${runId}-idem-first`,
      development_ids: first.finalized.developments.map((row) => row.development_id),
      claims_accepted: first.finalized.claims.length,
      model_calls: first.modelCalls,
      cost_estimate_usd: first.cost.available ? first.cost.estimate_usd : null,
    });
    const dispatchesAfterFirst = dispatches;

    const cacheEntries = await readCacheEntries(db, 200);
    const plan = planBatch({ items: processed, cacheEntries });
    if (plan.uncovered.length) {
      dispatches += 1;
    }
    return {
      ok: dispatchesAfterFirst === 2 && plan.cache_state === 'cached' && plan.to_process.length === 0
        && plan.covered.length === processed.length && dispatches === dispatchesAfterFirst,
      note: {
        first_run_dispatches: dispatchesAfterFirst, cache_state: plan.cache_state,
        covered: plan.covered.length, to_process: plan.to_process.length,
        cached_development_ids: plan.covered.flatMap((row) => row.cached_development_ids),
        dispatches_after_second_request: dispatches,
      },
    };
  });

  await record('persistence.roundtrip_carries_identity_and_grounding', async () => {
    const caseId = `${runId}-roundtrip`;
    const anchor = await anchorFor('roundtrip');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: multiSourceDevelopments(),
        answers: { claim_1: { choice: 'supported' }, claim_2: { choice: 'supported' } },
      })),
      sources, runId: caseId,
    });
    const fingerprint = fingerprintSourceSet(items);
    const storedDevelopments = await persistDevelopments(db, pipeline.finalized.developments.map((row) => ({ ...row, source_fingerprint: fingerprint })));
    const storedClaims = await persistClaims(db, pipeline.finalized.claims);
    const readBackDevelopments = await listDevelopments(db, caseId);
    const readBackClaims = await listClaims(db, caseId);
    const runRecord = await updateRun(db, anchor.id, {
      status: pipeline.status, source_item_ids: items.map((item) => item.id), source_fingerprint: fingerprint,
      model_calls: pipeline.modelCalls, provider_calls: pipeline.modelCalls,
      developments_accepted: pipeline.finalized.developments.length, claims_accepted: pipeline.finalized.claims.length,
      success_criteria: pipeline.criteria, success_criteria_failed: pipeline.failed_criteria,
    });
    const findings = scanForSecrets({ readBackDevelopments, readBackClaims });
    return {
      ok: storedDevelopments.length === 1 && storedClaims.length === 2
        && readBackDevelopments[0].stage === DEV_ANALYSIS_CONFIG.stage
        && readBackClaims.every((claim) => claim.stage === DEV_ANALYSIS_CONFIG.stage && claim.independent_verification === 'not_performed')
        && readBackDevelopments[0].supporting_item_ids.length === 2
        && runRecord.stage === DEV_ANALYSIS_CONFIG.stage
        && runRecord.spend_ceiling_usd === DEV_ANALYSIS_CONFIG.spend_ceiling_usd
        && Boolean(runRecord.retention_note) && findings.length === 0,
      note: {
        developments: readBackDevelopments.length, claims: readBackClaims.length,
        support_state: readBackDevelopments[0] && readBackDevelopments[0].support_state,
        stage: runRecord.stage, secret_findings: findings,
      },
    };
  });

  // --- limits, budget and cost.
  await record('limits.batch_cap_and_duplicate_ids', async () => {
    const tooMany = validateBatchRequest({ itemIds: Array.from({ length: 11 }, (_, index) => `itm_${index}`), maxRecords: DEV_ANALYSIS_CONFIG.max_records });
    const withDuplicate = validateBatchRequest({ itemIds: ['itm_a', 'itm_a', 'itm_b'], maxRecords: DEV_ANALYSIS_CONFIG.max_records });
    const empty = validateBatchRequest({ itemIds: [], maxRecords: DEV_ANALYSIS_CONFIG.max_records });
    return {
      ok: tooMany.ok === false && tooMany.error_category === 'record_cap'
        && withDuplicate.ok === true && withDuplicate.item_ids.length === 2 && withDuplicate.duplicate_ids.length === 1
        && empty.ok === false && empty.error_category === 'no_records',
      note: { cap: DEV_ANALYSIS_CONFIG.max_records, over_cap: tooMany.error_category, duplicate_ids: withDuplicate.duplicate_ids, empty: empty.error_category },
    };
  });

  // The gate itself is one line in the handler: a batch whose estimate is not within the
  // ceiling is refused before any call. Under the configured caps and the stated price
  // estimates a full-size batch stays far below the ceiling, so the guard is exercised
  // here with higher prices rather than by pretending the inputs could grow: the excerpt
  // text a batch can see is itself capped, so a larger stored excerpt cannot raise the
  // estimate.
  await record('limits.spend_ceiling_enforced_before_any_call', async () => {
    const full = estimateBatchWorstCase({ sources, maxClaims: DEV_ANALYSIS_CONFIG.max_claims });
    const expensive = estimateBatchWorstCase({
      sources,
      maxClaims: DEV_ANALYSIS_CONFIG.max_claims,
      config: {
        ...DEV_ANALYSIS_CONFIG,
        price_table: {
          'base44-core:gpt_6_luna': { input: 200, output: 1200 },
          'typesafe:jev': { input: 42, output: 0 },
        },
      },
    });
    return {
      ok: full.within_ceiling === true && full.estimated_usd < DEV_ANALYSIS_CONFIG.spend_ceiling_usd
        && expensive.within_ceiling === false && expensive.estimated_usd > DEV_ANALYSIS_CONFIG.spend_ceiling_usd,
      note: {
        ceiling_usd: DEV_ANALYSIS_CONFIG.spend_ceiling_usd,
        full_batch_estimate_usd: full.estimated_usd,
        estimate_at_higher_prices_usd: expensive.estimated_usd,
        blocking_rule: 'the handler refuses the batch before any call whenever within_ceiling is false',
      },
    };
  });

  await record('limits.call_budget_single_use', async () => {
    const anchor = await anchorFor('budget');
    const first = await reserveCallSlot(db, anchor.id, 'a', 'base44-core:gpt_6_luna');
    const second = await reserveCallSlot(db, anchor.id, 'a', 'base44-core:gpt_6_luna');
    const other = await reserveCallSlot(db, anchor.id, 'b', 'typesafe:jev');
    const otherAgain = await reserveCallSlot(db, anchor.id, 'b', 'typesafe:jev');
    const invalid = await reserveCallSlot(db, anchor.id, 'c', 'x:y');
    return {
      ok: first.ok === true && second.ok === false && second.updated === 0
        && other.ok === true && otherAgain.ok === false && invalid.ok === false,
      note: { slot_a_first: first.updated, slot_a_second: second.updated, slot_b_first: other.updated, slot_b_second: otherAgain.updated, invalid_slot: invalid.summary },
    };
  });

  await record('limits.call_cap_reached_refuses_without_dispatch', async () => {
    let dispatches = 0;
    const anchor = await anchorFor('callcap');
    const call = await callModel({
      provider: 'base44-core', model: 'gpt_6_luna', prompt: 'x', timeout_ms: 200,
      call_cap: DEV_ANALYSIS_CONFIG.max_calls_per_provider, calls_already_made: 1, call_slot: 'a',
    }, pipelineDeps(anchor, async () => { dispatches += 1; return { output: { developments: [] }, usage: null, resolved_model: null }; }));
    return {
      ok: call.error && call.error.category === 'call_cap' && call.dispatches === 0 && dispatches === 0,
      note: { error: call.error, transport_dispatches: dispatches },
    };
  });

  await record('cost.per_provider_or_unavailable_never_billed', async () => {
    const bothPriced = estimateCostFromCalls([
      { call: { provider: 'base44-core', requested_model: 'gpt_6_luna', dispatches: 1, usage_available: true, usage: { input_tokens: 3000, output_tokens: 600 } }, role: 'A' },
      { call: { provider: 'typesafe', requested_model: 'jev', dispatches: 1, usage_available: true, usage: { input_tokens: 1200, output_tokens: 0 } }, role: 'B' },
    ], DEV_ANALYSIS_CONFIG.price_table);
    const missingUsage = estimateCostFromCalls([
      { call: { provider: 'base44-core', requested_model: 'gpt_6_luna', dispatches: 1, usage_available: true, usage: { input_tokens: 3000, output_tokens: 600 } }, role: 'A' },
      { call: { provider: 'typesafe', requested_model: 'jev', dispatches: 1, usage_available: false, usage: null }, role: 'B' },
    ], DEV_ANALYSIS_CONFIG.price_table);
    return {
      ok: bothPriced.available === true && bothPriced.parts[0].price_key === 'base44-core:gpt_6_luna'
        && bothPriced.parts[1].price_key === 'typesafe:jev' && bothPriced.is_billed_cost === false
        && missingUsage.available === false && missingUsage.parts[1].estimate_usd === null
        && Boolean(missingUsage.parts[1].unavailable_reason),
      note: { total_priced: bothPriced.estimate_usd, parts: bothPriced.parts.map((part) => ({ key: part.price_key, usd: part.estimate_usd })), missing_usage_reason: missingUsage.parts[1].unavailable_reason },
    };
  });

  await record('evidence.source_stated_and_model_assessment_kept_apart', async () => {
    const anchor = await anchorFor('states');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: multiSourceDevelopments(),
        answers: { claim_1: { choice: 'supported' }, claim_2: { choice: 'mixed' } },
      })),
      sources, runId: `${runId}-states`,
    });
    const claim = pipeline.finalized.claims[0];
    const development = pipeline.finalized.developments[0];
    return {
      ok: Boolean(claim) && Boolean(development)
        && claim.source_states_claim === true && claim.quote_in_record === true
        && claim.evidence_supports_claim === true && claim.model_state === 'supported'
        && claim.independent_verification === 'not_performed'
        && development.support_state === 'evidence_supported_by_model'
        && pipeline.finalized.developments.every((row) => row.independent_verification === 'not_performed'),
      note: {
        source_states_claim: claim && claim.source_states_claim, model_state: claim && claim.model_state,
        independent_verification: claim && claim.independent_verification, support_state: development && development.support_state,
        status: pipeline.status, criteria: pipeline.criteria,
        dispatches: [pipeline.callA.dispatches, pipeline.callB ? pipeline.callB.dispatches : null],
        call_a_error: pipeline.callA.error, call_b_error: pipeline.callB ? pipeline.callB.error : null,
        claims_stored: pipeline.finalized.claims.length, developments_stored: pipeline.finalized.developments.length,
        rejected_developments: pipeline.collected.rejected_developments,
        rejected_claims: pipeline.collected.rejected_claims.length,
      },
    };
  });

  await record('dryrun.report_has_zero_provider_calls', async () => {
    const cacheEntries = await readCacheEntries(db, 200);
    const plan = planBatch({ items, cacheEntries });
    const estimate = estimateBatchWorstCase({ sources, maxClaims: DEV_ANALYSIS_CONFIG.max_claims });
    const report = buildDryRunReport({
      selection: 'explicit_item_ids', requestedIds: items.map((item) => item.id), duplicateIds: [], missingIds: [],
      items, sources, grouping, plan, estimate, cacheEntriesRead: cacheEntries.length,
    });
    // The plan's call count follows the records that still need processing, so this case
    // holds whatever the cache already covers - including the coverage the idempotency
    // case above wrote for these same fixture records, since that cache entry is real.
    return {
      ok: report.provider_calls === 0 && report.dry_run === true
        && report.batch.resolved_records === items.length && report.batch.within_cap === true
        && report.grouping.candidate_count > 0 && report.sources.length === items.length
        && report.planned.model_a.calls === (report.planned.records_to_process.length ? 1 : 0)
        && report.planned.model_calls_planned === report.planned.model_a.calls + report.planned.model_b.calls
        && report.estimate.estimated_usd > 0,
      note: {
        provider_calls: report.provider_calls, cache_state: report.cache.state,
        covered: report.cache.covered_count, to_process: report.planned.records_to_process.length,
        candidates: report.grouping.candidate_count, refused_merges: report.grouping.refused_merge_count,
        planned_calls: report.planned.model_calls_planned, estimate_usd: report.estimate.estimated_usd,
      },
    };
  });

  await record('secrets.scanner_positive_control', async () => {
    const findings = scanForSecrets({
      api_key: 'sk-live-abc1234567890',
      note: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc',
      nested: { token: 'sk-live-xyz9876543210' },
    });
    return { ok: findings.length >= 3, note: { findings } };
  });

  await record('limitations.declared', async () => {
    const required = [
      'source_grounding', 'excerpt_only', 'independent_verification', 'model_opinion', 'cache_semantics',
      'grouping', 'cost', 'atomicity', 'duplicate_anchors', 'retention', 'no_schedule', 'production_isolation',
      'content_state', 'research_classification', 'calibration',
    ];
    const missing = required.filter((key) => !DEV_LIMITATIONS[key]);
    return { ok: missing.length === 0, note: { undocumented: missing, declared: required.length } };
  });

  // --- Phase 2C: content states, decided from the stored fields and never from a threshold.
  await record('content.state_is_deterministic_and_never_invented', async () => {
    const withExcerpt = { id: 'itm_c1', title: 'Qwen-3.5 released for local inference', excerpt: 'The Qwen-3.5 release targets local inference on consumer hardware.', canonical_url: 'https://example.com/c1', published_at: '2026-10-08T08:00:00.000Z' };
    const titleOnly = { id: 'itm_c2', title: 'Introducing Gemini 3.8 Flash', excerpt: '', canonical_url: 'https://example.com/c2', published_at: '2026-10-07T08:00:00.000Z' };
    const noText = { id: 'itm_c3', title: '', excerpt: '   ', canonical_url: 'https://example.com/c3', published_at: '2026-10-06T08:00:00.000Z' };
    const batch = [withExcerpt, titleOnly, noText];
    const states = batch.map(contentState);
    const selection = selectAnalysable(batch);
    const overridden = selectAnalysable(batch, { includeTitleOnly: true });
    const overrideSource = buildSourceView(overridden.items.filter((item) => item.id === 'itm_c2'))[0];
    return {
      ok: states[0] === 'has_excerpt' && states[1] === 'title_only' && states[2] === 'no_text'
        && selection.items.length === 1 && selection.excluded.length === 2
        && selection.excluded.every((row) => row.reason_code.startsWith('insufficient_stored_text_'))
        && selection.excluded.some((row) => row.content_state === 'title_only' && Boolean(row.reason))
        && selection.counts.title_only === 1 && selection.counts.no_text === 1
        && overridden.items.length === 2 && overridden.override_used === true && overridden.counts.no_text === 1
        && overrideSource.content_state === 'title_only'
        && overrideSource.text === 'Introducing Gemini 3.8 Flash.',
      note: {
        states, excluded_by_default: selection.excluded.map((row) => row.reason_code),
        override_items: overridden.items.map((item) => item.id), override_text: overrideSource.text,
      },
    };
  });

  await record('content.excluded_records_never_enter_a_batch', async () => {
    const titleOnly = { id: 'itm_t1', title: 'GPT-6 Luna released', excerpt: '', canonical_url: 'https://example.com/t1', published_at: '2026-10-10T12:00:00.000Z' };
    const noText = { id: 'itm_t2', title: '', excerpt: '', canonical_url: 'https://example.com/t2', published_at: '2026-10-10T12:00:00.000Z' };
    const selection = selectAnalysable([titleOnly, noText]);
    const plan = planBatch({ items: selection.items, cacheEntries: [] });
    const sourcesForBatch = buildSourceView(selection.items);
    return {
      ok: selection.items.length === 0 && selection.excluded.length === 2
        && plan.to_process.length === 0 && sourcesForBatch.length === 0
        && selection.counts.title_only === 1 && selection.counts.no_text === 1,
      note: {
        analysable: selection.items.length, excluded: selection.excluded.map((row) => row.reason_code),
        planned_records: plan.to_process.length, sources: sourcesForBatch.length,
      },
    };
  });

  // --- Phase 2C: research classification, grounded in a named artefact and publication
  // language that the store text actually carries.
  await record('research.named_artifact_with_publication_language_is_research', async () => {
    const paper = researchItems().filter((item) => item.id === 'itm_quine');
    const anchor = await anchorFor('res-quine');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: [{
          title: 'Quine: A Self-Compiling Language for Agentic Systems',
          summary: 'The paper proposes Quine, a self-compiling language for agentic systems.',
          why_it_matters: 'A language that compiles itself for agentic workloads.',
          kind: 'model_release',
          group_key: 'quine',
          claims: [{
            item_id: 'itm_quine',
            claim: 'Quine is a self-compiling language for agentic systems',
            evidence_quote: 'We propose Quine, a self-compiling language for agentic systems',
            source_url: 'https://arxiv.org/abs/2510.00001',
            published_at: '2026-10-04T09:00:00.000Z',
          }],
        }],
        answers: { claim_1: { choice: 'supported' } },
      })),
      sources: buildSourceView(paper), runId: `${runId}-res-quine`,
    });
    const development = pipeline.finalized.developments[0];
    return {
      ok: Boolean(development) && development.kind === 'research'
        && development.reported_kind === 'model_release'
        && development.kind_basis.includes('research contribution')
        && Boolean(development.research_evidence) && development.research_evidence.eligible === true
        && development.research_evidence.quoted_artifact_tokens.includes('Quine')
        && development.independent_verification === 'not_performed'
        && pipeline.status === 'success',
      note: {
        kind: development && development.kind, reported_kind: development && development.reported_kind,
        research: development && development.research_evidence, status: pipeline.status,
        criteria: pipeline.criteria, dispatches: [pipeline.callA.dispatches, pipeline.callB ? pipeline.callB.dispatches : null],
        call_a_error: pipeline.callA.error, call_b_error: pipeline.callB ? pipeline.callB.error : null,
      },
    };
  });

  await record('research.versioned_model_mention_keeps_research_classification', async () => {
    const paper = researchItems().filter((item) => item.id === 'itm_merit');
    const anchor = await anchorFor('res-merit');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: [{
          title: 'MERIT: A Benchmark for Multi-Step Reasoning',
          summary: 'The paper introduces MERIT, a benchmark for multi-step reasoning.',
          why_it_matters: 'A benchmark for a failure mode that is rarely measured.',
          kind: 'product_release',
          model_identifiers: ['GPT-6 Luna'],
          group_key: 'merit',
          claims: [{
            item_id: 'itm_merit',
            claim: 'MERIT is a benchmark for multi-step reasoning',
            evidence_quote: 'We introduce MERIT, a benchmark for multi-step reasoning',
            source_url: 'https://arxiv.org/abs/2510.00002',
            published_at: '2026-10-03T09:00:00.000Z',
          }],
        }],
        answers: { claim_1: { choice: 'supported' } },
      })),
      sources: buildSourceView(paper), runId: `${runId}-res-merit`,
    });
    const development = pipeline.finalized.developments[0];
    return {
      ok: Boolean(development) && development.kind === 'research'
        && development.model_identifiers.includes('GPT-6 Luna')
        && development.research_evidence.quoted_artifact_tokens.includes('MERIT')
        && development.independent_verification === 'not_performed',
      note: {
        kind: development && development.kind, identifiers: development && development.model_identifiers,
        artifacts: development && development.research_evidence && development.research_evidence.quoted_artifact_tokens,
        status: pipeline.status, criteria: pipeline.criteria,
        dispatches: [pipeline.callA.dispatches, pipeline.callB ? pipeline.callB.dispatches : null],
        call_a_error: pipeline.callA.error, call_b_error: pipeline.callB ? pipeline.callB.error : null,
      },
    };
  });

  await record('research.negative_artifact_without_publication_language_rejected', async () => {
    const plain = {
      id: 'itm_quine_plain', source: 'Example News', source_key: 'example',
      title: 'Quine: A Self-Compiling Language for Agentic Systems',
      excerpt: 'A self-compiling language for agentic systems and the workloads it targets.',
      canonical_url: 'https://example.com/quine-plain', published_at: '2026-10-04T09:00:00.000Z',
    };
    const anchor = await anchorFor('res-negative1');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: [{
          title: 'Quine: A Self-Compiling Language for Agentic Systems',
          summary: 'A self-compiling language.', why_it_matters: '',
          kind: 'research', group_key: 'quine-plain',
          claims: [{
            item_id: 'itm_quine_plain',
            claim: 'Quine is a self-compiling language for agentic systems',
            evidence_quote: 'A self-compiling language for agentic systems',
            source_url: 'https://example.com/quine-plain',
            published_at: '2026-10-04T09:00:00.000Z',
          }],
        }],
      })),
      sources: buildSourceView([plain]), runId: `${runId}-res-negative1`,
    });
    const rejection = pipeline.collected.rejected_developments[0];
    const research = researchEvidenceOf(plain.title, ['A self-compiling language for agentic systems']);
    return {
      ok: pipeline.finalized.developments.length === 0 && pipeline.finalized.claims.length === 0
        && Boolean(rejection) && rejection.reasons.some((reason) => reason.includes('no identifiable event'))
        && research.eligible === false && research.reason_code === 'no_publication_language',
      note: {
        reasons: rejection && rejection.reasons, research_reason: research.reason_code,
        stored: pipeline.finalized.developments.length, status: pipeline.status,
        dispatches: pipeline.callA.dispatches, call_a_error: pipeline.callA.error,
      },
    };
  });

  // The stored text carries a publication format word ("this paper") and no contribution, so the
  // record is refused for the reason that now applies. It was previously reported as an artefact
  // missing from the evidence; the record is rejected either way, before and after calibration.
  await record('research.negative_publication_words_without_contribution_rejected', async () => {
    const weak = {
      id: 'itm_merit_weak', source: 'Example News', source_key: 'example',
      title: 'MERIT: A Benchmark for Multi-Step Reasoning',
      excerpt: 'Reasoning benchmarks rarely measure how a model recovers from a wrong step. This paper studies that failure mode.',
      canonical_url: 'https://example.com/merit-weak', published_at: '2026-10-03T09:00:00.000Z',
    };
    const anchor = await anchorFor('res-negative2');
    const pipeline = await runPipeline({
      deps: pipelineDeps(anchor, scriptedTransport({
        developments: [{
          title: 'MERIT: A Benchmark for Multi-Step Reasoning',
          summary: 'A study of a failure mode.', why_it_matters: '',
          kind: 'research', group_key: 'merit-weak',
          claims: [{
            item_id: 'itm_merit_weak',
            claim: 'Reasoning benchmarks rarely measure recovery from a wrong step',
            evidence_quote: 'This paper studies that failure mode',
            source_url: 'https://example.com/merit-weak',
            published_at: '2026-10-03T09:00:00.000Z',
          }],
        }],
      })),
      sources: buildSourceView([weak]), runId: `${runId}-res-negative2`,
    });
    const rejection = pipeline.collected.rejected_developments[0];
    const research = researchEvidenceOf(weak.title, ['This paper studies that failure mode']);
    return {
      ok: pipeline.finalized.developments.length === 0
        && Boolean(rejection) && rejection.reasons.some((reason) => reason.includes('no identifiable event'))
        && research.eligible === false && research.reason_code === 'no_contribution_language',
      note: {
        reasons: rejection && rejection.reasons, research_reason: research.reason_code,
        stored: pipeline.finalized.developments.length, status: pipeline.status,
        dispatches: pipeline.callA.dispatches, call_a_error: pipeline.callA.error,
      },
    };
  });

  await record('research.different_artifacts_are_never_merged', async () => {
    const researchGrouping = groupCandidates(researchItems());
    const quine = researchGrouping.candidates.find((candidate) => candidate.item_ids.includes('itm_quine'));
    const merit = researchGrouping.candidates.find((candidate) => candidate.item_ids.includes('itm_merit'));
    const ecology = researchGrouping.candidates.find((candidate) => candidate.item_ids.includes('itm_ecology'));
    // A named research artefact links nothing by itself: three separate papers stay three
    // single-source candidates even though one of them names a versioned model. No pair of them
    // shares a variant anchor or a normalised title, and none shares a generic token that would
    // be reported as a refused merge ("benchmark" and "benchmarks" are distinct tokens), so the
    // guarantee under test here is that a paper's own name never joins records together.
    const trioIds = ['itm_quine', 'itm_merit', 'itm_ecology'];
    const linksWithinTrio = researchGrouping.links
      .filter((entry) => entry.item_ids.filter((id) => trioIds.includes(id)).length > 1);
    const refusalsWithinTrio = researchGrouping.refused_merges
      .filter((entry) => entry.item_ids.filter((id) => trioIds.includes(id)).length > 1);
    const anchorLists = [quine, merit, ecology].map((group) => (group ? group.shared_anchors : []));
    const anchors = anchorLists.flat();
    // Each single-source candidate carries its own title key, so the assertion is that the
    // three keys differ - the title rule linked nothing - rather than that they are absent.
    const titleKeys = [quine, merit, ecology].map((group) => (group ? group.shared_title_key : ''));
    return {
      ok: Boolean(quine) && Boolean(merit) && Boolean(ecology)
        && quine.item_ids.length === 1 && merit.item_ids.length === 1 && ecology.item_ids.length === 1
        && new Set([quine.group_key, merit.group_key, ecology.group_key]).size === 3
        && new Set(anchors).size === anchors.length
        && new Set(titleKeys).size === 3 && titleKeys.every(Boolean)
        && linksWithinTrio.length === 0 && refusalsWithinTrio.length === 0
        && [quine, merit, ecology].every((group) => group.basis === 'single_source'),
      note: {
        group_keys: [quine, merit, ecology].map((group) => group && group.group_key),
        bases: [quine, merit, ecology].map((group) => group && group.basis),
        anchors_by_candidate: anchorLists,
        links_within_trio: linksWithinTrio.length,
        refusals_within_trio: refusalsWithinTrio.length,
      },
    };
  });

  // --- Phase 2C: the audit record. Every value is what the call produced, and an unknown stays
  // unknown rather than being filled from another call.
  await record('audit.call_details_preserve_measured_and_unknown_values', async () => {
    const details = buildCallDetails([
      {
        role: 'A', slot: 'a', task_kind: 'development_extraction', timeout_ms: 60000,
        call: { provider: 'base44-core', requested_model: 'gpt_6_luna', resolved_model: null, ok: true, dispatches: 1, latency_ms: 4123, usage_available: false, usage: null, error: null },
      },
      {
        role: 'B', slot: 'b', task_kind: 'claim_support_evaluation', timeout_ms: 60000,
        call: { provider: 'typesafe', requested_model: 'jev', resolved_model: 'jev-2', ok: true, dispatches: 1, latency_ms: 980, usage_available: true, usage: { input_tokens: 1500, output_tokens: 0 }, error: null },
      },
      {
        role: 'A', slot: 'a', task_kind: 'development_extraction', timeout_ms: 60000,
        call: { provider: 'base44-core', requested_model: 'gpt_6_luna', resolved_model: null, ok: false, dispatches: 0, latency_ms: 0, usage_available: false, usage: null, error: { category: 'call_budget_exhausted', summary: 'the server-side call budget for slot "a" was already consumed' } },
      },
    ]);
    const [unknownUsage, priced, notDispatched] = details;
    return {
      ok: details.length === 3
        && unknownUsage.latency_ms === 4123 && unknownUsage.usage === null && unknownUsage.usage_available === false
        && unknownUsage.estimate_available === false && Boolean(unknownUsage.estimate_unavailable_reason)
        && unknownUsage.resolved_model === null && unknownUsage.status === 'success'
        && priced.latency_ms === 980 && priced.usage_available === true && priced.resolved_model === 'jev-2'
        && priced.estimate_available === true && typeof priced.cost_estimate_usd === 'number'
        && notDispatched.status === 'not_dispatched' && notDispatched.latency_ms === null
        && notDispatched.estimate_available === false && notDispatched.error_category === 'call_budget_exhausted',
      note: {
        unknown_usage: { latency_ms: unknownUsage.latency_ms, usage: unknownUsage.usage, estimate: unknownUsage.cost_estimate_usd, reason: unknownUsage.estimate_unavailable_reason },
        priced: { latency_ms: priced.latency_ms, usd: priced.cost_estimate_usd },
        not_dispatched: { status: notDispatched.status, latency_ms: notDispatched.latency_ms, error: notDispatched.error_category },
      },
    };
  });

  await record('audit.rejection_report_is_structured_and_capped', async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      development_title: `Development ${index}`,
      item_id: `itm_${index}`,
      claim: 'a claim',
      evidence_quote: 'a quote',
      reason_code: 'quote_not_in_stored_record',
      reason: 'the evidence quote was not found verbatim in the stored source record',
    }));
    const report = buildRejectionReport({
      rejected_claims: many,
      rejected_developments: [{
        title: 'Unnamed thing', kind: 'unspecified', reported_kind: '', claim_candidates: 0,
        reasons: ['no named model, version, artefact or release language in the title or evidence'],
      }],
      counts: { raw_developments: 2, raw_claims: 25, accepted_claims: 0, fabricated_citations: 3, dropped_model_identifiers: 1 },
    });
    return {
      ok: report.rejected_claims.length === 20 && report.rejected_claims_truncated === true
        && report.rejected_claims.every((row) => row.reason_code === 'quote_not_in_stored_record' && Boolean(row.reason))
        && report.counts.rejected_claims === 25 && report.counts.fabricated_citations === 3
        && report.rejected_developments.length === 1 && report.rejected_developments_truncated === false
        && report.rejected_developments[0].reasons.length === 1,
      note: {
        listed: report.rejected_claims.length, truncated: report.rejected_claims_truncated,
        counts: report.counts, developments: report.rejected_developments,
      },
    };
  });

  // --- Phase 2C: the public feed. Provenance comes from the parent run, and every case that
  // cannot be proven is excluded.
  await record('feed.excludes_fixtures_dry_runs_and_missing_provenance', async () => {
    const scenarios = [
      { name: 'suite fixture', development: liveDevelopmentFixture({ development_id: 'dev_suite', run_id: 'run_suite' }), run: liveRunFixture({ run_id: 'run_suite', action: 'suite' }) },
      { name: 'missing parent run', development: liveDevelopmentFixture({ development_id: 'dev_missing', run_id: 'run_absent' }), run: null },
      { name: 'dry run', development: liveDevelopmentFixture({ development_id: 'dev_dry', run_id: 'run_dry' }), run: liveRunFixture({ run_id: 'run_dry', action: 'dry_run', dry_run: true }) },
      { name: 'partial run', development: liveDevelopmentFixture({ development_id: 'dev_partial', run_id: 'run_partial' }), run: liveRunFixture({ run_id: 'run_partial', status: 'partial' }) },
      { name: 'authorization not consumed', development: liveDevelopmentFixture({ development_id: 'dev_noauth', run_id: 'run_noauth' }), run: liveRunFixture({ run_id: 'run_noauth', claim_state: 'open', claim_token: '' }) },
      { name: 'non-administrator operator', development: liveDevelopmentFixture({ development_id: 'dev_operator', run_id: 'run_operator' }), run: liveRunFixture({ run_id: 'run_operator', operator_role: 'user' }) },
      { name: 'fingerprint mismatch', development: liveDevelopmentFixture({ development_id: 'dev_fp', run_id: 'run_fp', source_fingerprint: 'fp_other' }), run: liveRunFixture({ run_id: 'run_fp' }) },
      { name: 'development not accepted', development: liveDevelopmentFixture({ development_id: 'dev_status', run_id: 'run_status', status: 'partial' }), run: liveRunFixture({ run_id: 'run_status' }) },
    ];
    const runsById = {};
    const claimsByRun = {};
    const developments = scenarios.map((entry) => {
      if (entry.run) {
        runsById[entry.run.run_id] = entry.run;
        claimsByRun[entry.run.run_id] = liveClaimsFixture();
      }
      return entry.development;
    });
    const feed = resolveFeed({ developments, runsById, claimsByRun, limit: 6 });
    const codes = feed.excluded.map((row) => row.reason_code);
    return {
      ok: feed.items.length === 0 && feed.excluded.length === scenarios.length
        && codes.includes('parent_run_is_suite_fixture') && codes.includes('parent_run_missing')
        && codes.includes('parent_run_was_a_dry_run') && codes.includes('parent_run_not_successful')
        && codes.includes('authorization_not_consumed') && codes.includes('operator_not_administrator')
        && codes.includes('source_fingerprint_mismatch') && codes.includes('development_not_accepted'),
      note: { excluded: feed.counts.excluded, codes },
    };
  });

  await record('feed.projection_is_whitelisted_and_leaks_no_run_internals', async () => {
    const feed = resolveFeed({
      developments: [liveDevelopmentFixture()],
      runsById: { run_live_1: liveRunFixture() },
      claimsByRun: { run_live_1: liveClaimsFixture() },
      limit: 6,
    });
    const item = feed.items[0];
    const allowed = [
      'development_id', 'title', 'kind', 'kind_label', 'kind_basis', 'event_type', 'event_type_label',
      'summary', 'why_it_matters', 'published_at',
      'source', 'evidence', 'support', 'independent_verification', 'disclosure', 'supporting_source_count',
    ];
    const forbidden = [
      'authorization_id', 'claim_token', 'claim_state', 'run_id', 'source_fingerprint', 'usage', 'cost',
      'cost_estimate_usd', 'error_category', 'error_summary', 'notes', 'tests', 'validation', 'claim_ids',
      'supporting_item_ids', 'model_identifiers', 'stage', 'retention_days',
    ];
    const serialized = JSON.stringify(item || {});
    return {
      ok: Boolean(item) && feed.items.length === 1
        && Object.keys(item).length === allowed.length
        && Object.keys(item).every((key) => allowed.includes(key))
        && forbidden.every((key) => !serialized.includes(key))
        && item.independent_verification === 'not_performed'
        && item.evidence.quote === 'We propose Quine, a self-compiling language for agentic systems'
        && item.source.url === 'https://arxiv.org/abs/2510.00001'
        && item.support.evidence_supported_by_model === true
        && typeof item.disclosure === 'string' && item.disclosure.length > 0,
      note: {
        keys: item ? Object.keys(item) : [], source: item && item.source,
        support: item && item.support, independent_verification: item && item.independent_verification,
      },
    };
  });

  // Phase 4B: the detail lookup. One development, resolved through exactly the same checks the
  // list applies, and every unknown, ambiguous or unproven identifier answered as unavailable
  // rather than as a partial record - so a detail page can never become a side door to an
  // analysis entity.
  await record('feed.detail_lookup_is_proven_and_fails_closed', async () => {
    const live = liveDevelopmentFixture();
    const runsById = { run_live_1: liveRunFixture() };
    const claimsByRun = { run_live_1: liveClaimsFixture() };

    const found = resolveDevelopment({ developments: [live], runsById, claimsByRun, developmentId: live.development_id });
    const unknown = resolveDevelopment({ developments: [live], runsById, claimsByRun, developmentId: 'dev_absent' });
    const blank = resolveDevelopment({ developments: [live], runsById, claimsByRun, developmentId: '   ' });
    const duplicate = resolveDevelopment({ developments: [live, { ...live }], runsById, claimsByRun, developmentId: live.development_id });
    const fixture = resolveDevelopment({
      developments: [liveDevelopmentFixture({ development_id: 'dev_detail_suite', run_id: 'run_detail_suite' })],
      runsById: { run_detail_suite: liveRunFixture({ run_id: 'run_detail_suite', action: 'suite' }) },
      claimsByRun: { run_detail_suite: liveClaimsFixture() },
      developmentId: 'dev_detail_suite',
    });
    const dryRun = resolveDevelopment({
      developments: [liveDevelopmentFixture({ development_id: 'dev_detail_dry', run_id: 'run_detail_dry' })],
      runsById: { run_detail_dry: liveRunFixture({ run_id: 'run_detail_dry', action: 'dry_run', dry_run: true }) },
      claimsByRun: { run_detail_dry: liveClaimsFixture() },
      developmentId: 'dev_detail_dry',
    });
    // A verified quote the development does not list is not its evidence, and a run holding no
    // verified quote at all leaves the development without one: both are refusals, each with its
    // own reason.
    const unlistedQuote = resolveDevelopment({
      developments: [liveDevelopmentFixture({ development_id: 'dev_detail_unlisted', run_id: 'run_detail_unlisted', claim_ids: [] })],
      runsById: { run_detail_unlisted: liveRunFixture({ run_id: 'run_detail_unlisted' }) },
      claimsByRun: { run_detail_unlisted: liveClaimsFixture() },
      developmentId: 'dev_detail_unlisted',
    });
    const noQuote = resolveDevelopment({
      developments: [liveDevelopmentFixture({ development_id: 'dev_detail_noquote', run_id: 'run_detail_noquote' })],
      runsById: { run_detail_noquote: liveRunFixture({ run_id: 'run_detail_noquote' }) },
      claimsByRun: { run_detail_noquote: [] },
      developmentId: 'dev_detail_noquote',
    });
    return {
      ok: found.ok === true && found.item.development_id === live.development_id
        && found.item.evidence.quote === 'We propose Quine, a self-compiling language for agentic systems'
        && typeof found.item.event_type_label === 'string'
        && unknown.ok === false && unknown.reason_code === 'development_not_found'
        && blank.ok === false && blank.reason_code === 'missing_development_id'
        && duplicate.ok === false && duplicate.reason_code === 'duplicate_development_id'
        && fixture.ok === false && fixture.reason_code === 'parent_run_is_suite_fixture'
        && dryRun.ok === false && dryRun.reason_code === 'parent_run_was_a_dry_run'
        && unlistedQuote.ok === false && unlistedQuote.reason_code === 'evidence_source_not_in_development'
        && noQuote.ok === false && noQuote.reason_code === 'missing_evidence_quote',
      note: {
        found: found.ok, unknown: unknown.reason_code, blank: blank.reason_code,
        duplicate: duplicate.reason_code, suite_fixture: fixture.reason_code,
        dry_run: dryRun.reason_code, unlisted_quote: unlistedQuote.reason_code,
        no_quote: noQuote.reason_code,
      },
    };
  });

  await record('feed.orders_bounds_and_writes_nothing', async () => {
    const older = liveDevelopmentFixture({ development_id: 'dev_b', primary_published_at: '2026-10-01T00:00:00.000Z' });
    const newer = liveDevelopmentFixture({ development_id: 'dev_a', primary_published_at: '2026-10-05T00:00:00.000Z' });
    const tie = liveDevelopmentFixture({ development_id: 'dev_c', primary_published_at: '2026-10-05T00:00:00.000Z' });
    const feed = resolveFeed({
      developments: [older, newer, tie],
      runsById: { run_live_1: liveRunFixture() },
      claimsByRun: { run_live_1: liveClaimsFixture() },
      limit: 99,
    });
    const ordered = feed.items.map((item) => item.development_id);

    const calls = [];
    const writeAttempt = (name) => async () => { throw new Error(`the feed must never ${name}`); };
    const fakeDb = {
      DevDevelopment: { filter: async () => { calls.push('read:DevDevelopment'); return { items: [liveDevelopmentFixture()] }; } },
      DevAnalysisRun: { filter: async () => { calls.push('read:DevAnalysisRun'); return { items: [liveRunFixture()] }; } },
      DevClaim: { filter: async () => { calls.push('read:DevClaim'); return { items: liveClaimsFixture() }; } },
      create: writeAttempt('write'),
      update: writeAttempt('write'),
      updateMany: writeAttempt('write'),
      delete: writeAttempt('delete'),
      deleteMany: writeAttempt('delete'),
    };
    const inputs = await loadFeedInputs(fakeDb, { limit: 99 });
    const resolved = resolveFeed({ ...inputs, limit: 99 });

    return {
      ok: feed.limit === FEED_LIMIT_MAX && ordered.length === 3
        && ordered[0] === 'dev_a' && ordered[1] === 'dev_c' && ordered[2] === 'dev_b'
        && calls.length === 3 && calls.every((entry) => entry.startsWith('read:'))
        && resolved.items.length === 1 && resolved.limit === FEED_LIMIT_MAX,
      note: {
        limit: feed.limit, ordered, db_calls: calls,
        read_back_items: resolved.items.length, read_back_limit: resolved.limit,
      },
    };
  });

  const passed = cases.filter((entry) => entry.ok).length;
  return { suite: 'phase2a-development-analysis-suite', cases_run: cases.length, passed, failed: cases.length - passed, cases };
}