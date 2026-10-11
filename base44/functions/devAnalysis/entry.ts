// Phase 2A: source-grounded development analysis.
//
// This is the only entry point. It is admin-only (enforced here, server-side), and it
// runs only when an administrator explicitly authorizes one batch: a fresh run id, a
// one-time authorization id and execute: true. The live action additionally requires the
// kill switch in shared/devAnalysisConfig.ts to be armed, which only a deliberate human
// edit of that file can do - a batch never arms it.
//
// Lifecycle of one batch, in order:
//   1. every refusal below happens before the authorization is consumed, so a refused
//      request leaves the authorization usable and creates no record at all.
//   2. the one-time authorization is consumed by a guarded update whose reported match
//      count must be exactly one. A second attempt with the same authorization is
//      refused rather than executed, and nothing dispatches on an ambiguous outcome.
//   3. the batch is capped at 10 stored source records, and the live action requires an
//      explicit list of them: it never walks the catalogue.
//   4. records whose stored text is unchanged since an earlier batch are covered by that
//      analysis and are not sent to a model again. If every requested record is covered,
//      the batch makes no call at all.
//   5. the worst-case spend is estimated before any call and the batch is refused if it
//      would exceed the ceiling.
//   6. before each provider call, its own call slot is consumed the same guarded way.
//      There are exactly two slots, one per provider, so the per-provider cap of one and
//      the total cap of two hold structurally as well as numerically.
//   7. there are no retries. A failed or timed-out call is recorded and the batch ends.
//
// What is stored is grounded in the app's own records: supporting item ids, canonical
// urls and publication timestamps are read from the stored records, never from a model.
// A model-reported citation is kept only as an audit of what it attempted; it is never
// used as a source. The evidence check (is the quote in the stored record?) is code; the
// support assessment (does the quote support the claim?) is a model's opinion recorded
// beside it; independent factual verification is not performed and never claimed.
//
// Actions: dry_run (the batch plan, grouping, cache coverage and worst-case estimate,
// with zero provider calls), analyze (one authorized batch), suite (the mocked-provider
// test suite, zero provider calls), review (read stored runs, developments and claims).
//
// No action deletes anything: there is no delete, deleteMany or purge operation anywhere
// in this function or in the modules it imports. Nothing here writes to Item, Trend,
// Topic, IngestionRun, User, Save or the Stage 1 proof entities.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { DEV_ANALYSIS_CONFIG, DEV_LIMITATIONS } from '../../shared/devAnalysisConfig.ts';
import { sanitizeMessage, categorizeError } from '../../shared/modelAdapters.ts';
import { scanForSecrets } from '../../shared/modelProofTrace.ts';
import {
  fingerprintSourceSet, groupCandidates, itemFingerprint, planBatch, validateBatchRequest,
} from '../../shared/devAnalysisGrouping.ts';
import {
  buildDryRunReport, buildSourceView, estimateBatchWorstCase, selectAnalysable,
} from '../../shared/devAnalysisCriteria.ts';
import { clip, makeReserve, refusalBody } from '../../shared/pipelineSupport.ts';
import { runPipeline } from '../../shared/devAnalysisPipeline.ts';
import { runSuite } from '../../shared/devAnalysisSuite.ts';
import {
  buildCallDetails, buildDevRunRecord, buildRejectionReport, consumeAuthorization, findRunById, listClaims,
  listDevelopments, listRuns, persistCacheEntry, persistClaims, persistDevelopments, persistRun, readCacheEntries,
  reserveCallSlot, updateRun,
} from '../../shared/devAnalysisTrace.ts';
// The extraction prompt, the pipeline itself and the mocked-provider suite live in their own
// shared modules: the live batch and the suite call exactly the same pipeline code, and neither
// is buried in this handler.

function summarizeRun(run) {
  return {
    run_id: run.run_id, action: run.action, status: run.status, stage: run.stage,
    dry_run: run.dry_run, recorded_at: run.created_date,
    batch_record_count: run.batch_record_count, source_item_ids: run.source_item_ids || [],
    cache_state: run.cache_state, cache_covered_item_ids: run.cache_covered_item_ids || [],
    model_calls: run.model_calls, provider_calls: run.provider_calls,
    developments_accepted: run.developments_accepted, claims_accepted: run.claims_accepted,
    claims_rejected: run.claims_rejected, requested_models: run.requested_models || [],
    resolved_models: run.resolved_models || [], estimated_spend_usd: run.estimated_spend_usd,
    cost: run.cost || null, success_criteria: run.success_criteria || null,
    success_criteria_failed: run.success_criteria_failed || [],
    grouping: run.grouping || null, report: run.report || null, tests: run.tests || null,
    notes: run.notes || '',
  };
}

function summarizeDevelopment(row) {
  return {
    development_id: row.development_id, run_id: row.run_id, kind: row.kind, title: row.title,
    summary: row.summary, why_it_matters: row.why_it_matters,
    model_identifiers: row.model_identifiers || [], model_versions: row.model_versions || [],
    supporting_item_ids: row.supporting_item_ids || [], source_urls: row.source_urls || [],
    primary_published_at: row.primary_published_at, status: row.status,
    source_states_claim: row.source_states_claim, evidence_supported_by_model: row.evidence_supported_by_model,
    support_state: row.support_state, independent_verification: row.independent_verification,
    validation: row.validation || null,
  };
}

function summarizeClaim(row) {
  return {
    claim_id: row.claim_id, development_id: row.development_id, item_id: row.item_id,
    source: row.source, canonical_url: row.canonical_url, published_at: row.published_at,
    claim_text: row.claim_text, evidence_quote: row.evidence_quote,
    quote_in_record: row.quote_in_record, source_states_claim: row.source_states_claim,
    model_state: row.model_state, assessment_state: row.assessment_state,
    evidence_supports_claim: row.evidence_supports_claim,
    citation_accepted: row.citation_accepted, citation: row.citation || null,
    independent_verification: row.independent_verification,
  };
}

export default async function (req) {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }

    const action = String(payload.action || '');
    const db = base44.entities;
    const config = DEV_ANALYSIS_CONFIG;
    const operator = { operator_id: user.id, operator_role: user.role };
    const killSwitch = config.execution_enabled ? 'on' : 'off';

    if (action === 'review') {
      const runId = clip(payload.run_id, 80);
      const runs = runId ? [await findRunById(db, runId)].filter(Boolean) : await listRuns(db, 10);
      const detailRunId = runId || (runs[0] ? runs[0].run_id : '');
      const developments = detailRunId ? await listDevelopments(db, detailRunId) : [];
      const claims = detailRunId ? await listClaims(db, detailRunId) : [];
      const cacheEntries = await readCacheEntries(db, 50);
      return Response.json({
        ok: true,
        action,
        stage: config.stage,
        kill_switch: killSwitch,
        execution_enabled: config.execution_enabled,
        caps: {
          max_records: config.max_records, spend_ceiling_usd: config.spend_ceiling_usd,
          max_calls_per_provider: config.max_calls_per_provider, max_calls_total: config.max_calls_total,
          allow_retries: config.allow_retries, retention_days: config.retention_days,
        },
        runs: runs.map(summarizeRun),
        run: runs[0] ? summarizeRun(runs[0]) : null,
        developments: developments.map(summarizeDevelopment),
        claims: claims.map(summarizeClaim),
        cache: {
          entries: cacheEntries.length,
          recent: cacheEntries.slice(0, 5).map((entry) => ({
            fingerprint: entry.fingerprint, run_id: entry.run_id,
            source_item_ids: entry.source_item_ids || [], development_count: entry.development_count,
            model_calls: entry.model_calls, cached_at: entry.cached_at,
          })),
        },
        limitations: DEV_LIMITATIONS,
      });
    }

    if (action !== 'dry_run' && action !== 'analyze' && action !== 'suite') {
      return Response.json({ ok: false, error: 'unknown action; expected dry_run, analyze, suite or review' }, { status: 400 });
    }

    const runId = clip(payload.run_id, 80);
    if (runId.length < 8) {
      return Response.json({ ok: false, status: 'blocked', error_category: 'run_id_required', error: 'a unique run_id of at least 8 characters is required', model_calls: 0, provider_calls: 0 }, { status: 400 });
    }

    const authorizationId = clip(payload.authorization_id, 80);
    // Every gate runs before the authorization is consumed, so a refused request leaves
    // the one-time authorization untouched and creates no record at all: repeated
    // unauthorized attempts cannot grow the analysis store.
    const refuseBefore = (category, summary) => Response.json(refusalBody({
      auditKey: 'dev_analysis_audit', pipeline: config.stage, category, action, runId, user, killSwitch, summary,
    }));

    if (authorizationId.length < 8) {
      return refuseBefore('authorization_required', 'blocked: a one-time authorization_id of at least 8 characters is required');
    }
    if (payload.execute !== true) {
      return refuseBefore('execution_flag_missing', 'blocked: payload did not carry execute: true');
    }
    if (action === 'analyze' && !config.execution_enabled) {
      return refuseBefore('kill_switch_off', 'blocked: the Phase 2A execution kill switch is off, so no batch was analysed; arm execution_enabled in base44/shared/devAnalysisConfig.ts to run exactly one authorized batch');
    }

    const claimToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${runId}-${Date.now()}`;
    const claim = await consumeAuthorization(db, {
      authorizationId,
      token: claimToken,
      seed: {
        run_id: runId, action, status: 'running', execution_flag: true, kill_switch_state: killSwitch,
        dry_run: action === 'dry_run', started_at: new Date(startedAt).toISOString(), ...operator,
      },
    });

    if (!claim.ok) {
      return Response.json({
        ok: false, status: 'duplicate', run_id: runId, authorization_id: authorizationId,
        error_category: claim.reason, model_calls: 0, provider_calls: 0,
        authorization_consumed: claim.reason === 'already_consumed', authorization_usable: false,
        kill_switch: killSwitch,
        existing_record_id: claim.anchor ? claim.anchor.id : null,
        existing_run_id: claim.anchor ? claim.anchor.run_id : null,
        note: 'the one-time authorization was not available for this attempt, so no model call was made and no record was overwritten',
      });
    }

    const anchor = claim.anchor;
    const reserve = makeReserve(reserveCallSlot, db, anchor.id);

    // --- mocked-provider suite: zero provider calls.
    if (action === 'suite') {
      const tests = await runSuite({ db, base44, runId });
      const findings = scanForSecrets(tests);
      const status = tests.failed === 0 ? 'success' : 'failed';
      const finalAnchor = await updateRun(db, anchor.id, {
        status, provider_calls: 0, model_calls: 0, providers: ['stub'],
        cost_estimate_basis: 'no provider call, no usage, no cost',
        tests: { ...tests, secret_findings: findings },
        finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
        notes: `mocked-provider suite: ${tests.passed}/${tests.cases_run} passed, 0 provider calls; authorization ${authorizationId} consumed by this run`,
      });
      return Response.json({
        ok: status === 'success', action, run_id: runId, status, stage: config.stage,
        authorization_id: authorizationId, authorization_consumed: true, kill_switch: killSwitch,
        provider_calls: 0, model_calls: 0,
        summary: {
          cases_run: tests.cases_run, passed: tests.passed, failed: tests.failed,
          failing: tests.cases.filter((entry) => !entry.ok).map((entry) => ({ name: entry.name, detail: entry.detail })),
        },
        tests, secret_findings: findings,
        slots_after: { a: finalAnchor.call_slot_a, b: finalAnchor.call_slot_b },
        limitations: DEV_LIMITATIONS, record_id: finalAnchor.id,
      });
    }

    // --- resolve the batch: explicit ids, capped, checked against stored records.
    const requestedIds = Array.isArray(payload.item_ids) ? payload.item_ids : [];
    const validation = validateBatchRequest({ itemIds: requestedIds, maxRecords: config.max_records });

    const blockedAfterClaim = async (category, summary, extra = {}) => {
      const updated = await updateRun(db, anchor.id, {
        status: 'blocked', error_category: category, error_summary: summary,
        source_item_ids: validation.item_ids || [], model_calls: 0, provider_calls: 0,
        finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
        notes: summary, ...extra,
      });
      return Response.json({
        ok: false, status: 'blocked', run_id: runId, error_category: category, reason: summary,
        model_calls: 0, provider_calls: 0, authorization_consumed: true, record_id: updated.id,
      });
    };

    if (!requestedIds.length && action === 'analyze') {
      return blockedAfterClaim('item_ids_required', 'blocked: an authorized batch must name the source records it analyses; the live action never walks the catalogue');
    }
    if (requestedIds.length && !validation.ok) {
      return blockedAfterClaim(validation.error_category, `blocked: ${validation.reason}`);
    }

    let items = [];
    if (requestedIds.length) {
      const page = await db.Item.filter({ id: { $in: validation.item_ids } }, { limit: config.max_records });
      items = page.items || [];
    } else {
      const page = await db.Item.filter({}, { limit: config.max_records, sort: '-published_at' });
      items = page.items || [];
    }
    const missingIds = requestedIds.length
      ? validation.item_ids.filter((id) => !items.some((item) => item.id === id))
      : [];

    if (!items.length) {
      return blockedAfterClaim('no_records', 'blocked: no stored source record matched the request');
    }

    // Deterministic content states decide what may be sent to a model at all. A record with a
    // title and no excerpt is not analysed unless this request carries the explicit
    // administrator override - and even then it is analysed with its stored title alone. A
    // record with no stored text is never analysed. Nothing is fetched from the original
    // page, and no excerpt is generated, expanded or inferred to replace a missing one.
    const content = selectAnalysable(items, { includeTitleOnly: payload.include_title_only === true });
    const contentExclusions = {
      applied: true,
      override_flag: payload.include_title_only === true,
      override_used: content.override_used,
      override_note: 'title-only records are analysed with their stored title alone only when an administrator sets include_title_only: true; this handler refuses non-administrators before it, and no excerpt is ever fetched, generated or inferred',
      excluded: content.excluded,
      counts: content.counts,
      note: content.note,
    };
    const analysisItems = content.items;

    if (!analysisItems.length) {
      return blockedAfterClaim(
        'insufficient_stored_text',
        `blocked: all ${items.length} requested records were excluded before any model call because their stored text is insufficient for analysis (${content.counts.title_only} title-only, ${content.counts.no_text} with no stored text); an administrator can include title-only records explicitly`,
        { content_exclusions: contentExclusions, source_item_ids: items.map((item) => item.id) },
      );
    }

    const sources = buildSourceView(analysisItems, config);
    const grouping = groupCandidates(analysisItems);
    const cacheEntries = await readCacheEntries(db, 200);
    const plan = planBatch({ items: analysisItems, cacheEntries });
    const plannedItems = plan.to_process;
    const plannedSources = sources.filter((source) => plannedItems.some((item) => item.id === source.item_id));
    const estimate = estimateBatchWorstCase({
      sources: plannedSources.length ? plannedSources : sources,
      maxClaims: config.max_claims,
      config,
    });
    const selection = requestedIds.length ? 'explicit_item_ids' : 'newest_stored_records';

    // --- dry run: the plan, the grouping, the cache coverage and the estimate.
    if (action === 'dry_run') {
      const report = buildDryRunReport({
        selection,
        requestedIds: validation.item_ids || [],
        duplicateIds: validation.duplicate_ids || [],
        missingIds,
        items, sources, grouping, plan, estimate,
        content: contentExclusions,
        cacheEntriesRead: cacheEntries.length,
      });
      const updated = await updateRun(db, anchor.id, {
        status: 'dry_run',
        source_item_ids: items.map((item) => item.id),
        batch_record_count: items.length,
        source_fingerprint: fingerprintSourceSet(items),
        cache_state: plan.cache_state,
        cache_covered_item_ids: plan.covered.map((row) => row.item_id),
        processed_item_ids: plannedItems.map((item) => item.id),
        grouping: report.grouping,
        report,
        content_exclusions: contentExclusions,
        estimated_spend_usd: estimate.estimated_usd,
        cost_estimate_basis: estimate.basis,
        model_calls: 0,
        provider_calls: 0,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        notes: `dry run over ${items.length} stored records (${selection}); ${plan.to_process.length} to process, ${plan.covered.length} already covered by cached analysis, ${content.counts.excluded} excluded for insufficient stored text (${content.counts.title_only} title-only, ${content.counts.no_text} with no stored text); worst-case estimate ${estimate.estimated_usd} USD; 0 provider calls`,
      });
      return Response.json({
        ok: true, action, run_id: runId, status: 'dry_run', stage: config.stage,
        authorization_id: authorizationId, authorization_consumed: true, kill_switch: killSwitch,
        provider_calls: 0, model_calls: 0, report, record_id: updated.id,
        limitations: DEV_LIMITATIONS,
      });
    }

    // --- analyze: one authorized batch, capped and budgeted.
    if (plan.cache_state === 'cached') {
      const updated = await updateRun(db, anchor.id, {
        status: 'cached',
        content_exclusions: contentExclusions,
        source_item_ids: items.map((item) => item.id),
        batch_record_count: items.length,
        source_fingerprint: fingerprintSourceSet(items),
        cache_state: plan.cache_state,
        cache_covered_item_ids: plan.covered.map((row) => row.item_id),
        processed_item_ids: [],
        estimated_spend_usd: 0,
        model_calls: 0, provider_calls: 0,
        cost_estimate_basis: 'no call: every requested record already has analysis for this exact stored text',
        finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
        notes: `no model call: all ${items.length} requested records are already covered by cached analysis for this exact stored text`,
      });
      return Response.json({
        ok: true, action, run_id: runId, status: 'cached', stage: config.stage,
        authorization_consumed: true, kill_switch: killSwitch, model_calls: 0, provider_calls: 0,
        cached: {
          item_ids: plan.covered.map((row) => row.item_id),
          development_ids: Array.from(new Set(plan.covered.flatMap((row) => row.cached_development_ids || []))),
          cached_run_ids: Array.from(new Set(plan.covered.map((row) => row.cached_run_id).filter(Boolean))),
        },
        record_id: updated.id,
      });
    }

    if (!estimate.within_ceiling) {
      return blockedAfterClaim('spend_ceiling', `blocked: worst-case estimate ${estimate.estimated_usd} exceeds the ceiling ${config.spend_ceiling_usd}`, {
        estimated_spend_usd: estimate.estimated_usd,
        source_item_ids: items.map((item) => item.id),
        processed_item_ids: plannedItems.map((item) => item.id),
      });
    }

    let typesafeConnection = null;
    const deps = {
      base44,
      getTypesafeConnection: async () => {
        if (!typesafeConnection) typesafeConnection = await base44.asServiceRole.aiGateway.connection({ provider: 'typesafe' });
        return typesafeConnection;
      },
      reserve,
    };

    const pipeline = await runPipeline({ deps, sources: plannedSources, runId, config });
    const finishedAt = new Date().toISOString();
    const batchFingerprint = fingerprintSourceSet(plannedItems);

    const developmentRows = pipeline.finalized.developments.map((row) => ({ ...row, source_fingerprint: batchFingerprint }));
    const storedDevelopments = await persistDevelopments(db, developmentRows);
    const storedClaims = await persistClaims(db, pipeline.finalized.claims);

    // Idempotency is recorded whenever the extraction itself ran, so the same stored
    // text is not sent to a model again - including a batch that legitimately found
    // nothing, because that finding is itself the analysis outcome.
    let cacheEntry = null;
    if (pipeline.callA && pipeline.callA.ok === true) {
      cacheEntry = await persistCacheEntry(db, {
        fingerprint: batchFingerprint,
        item_fingerprints: plannedItems.map(itemFingerprint),
        source_item_ids: plannedItems.map((item) => item.id),
        run_id: runId,
        development_ids: pipeline.finalized.developments.map((row) => row.development_id),
        claims_accepted: pipeline.finalized.claims.length,
        model_calls: pipeline.modelCalls,
        cost_estimate_usd: pipeline.cost.available ? pipeline.cost.estimate_usd : null,
      });
    }

    const requestedModels = [pipeline.callA.requested_model].concat(pipeline.callB ? [pipeline.callB.requested_model] : []);
    const resolvedModels = [pipeline.callA.resolved_model, pipeline.callB ? pipeline.callB.resolved_model : null]
      .filter((value) => typeof value === 'string' && value);
    const resolvedNote = resolvedModels.length
      ? 'resolved identifiers returned by the providers for these calls'
      : 'neither provider returned a resolved model identifier; none is asserted';

    // The audit detail is built by the same modules the pipeline uses, per call and per
    // rejection, and every value the providers did not return stays null.
    const callDetails = buildCallDetails([
      { role: 'A', call: pipeline.callA, task_kind: config.model_a.task_kind, slot: 'a', timeout_ms: config.timeout_ms },
      pipeline.callB
        ? { role: 'B', call: pipeline.callB, task_kind: config.model_b.task_kind, slot: 'b', timeout_ms: config.timeout_ms }
        : null,
    ].filter(Boolean));
    const rejectionReport = buildRejectionReport(pipeline.collected);

    const errorSource = pipeline.callA.ok === true ? pipeline.callB : pipeline.callA;
    const runRecord = await updateRun(db, anchor.id, {
      status: pipeline.status,
      source_item_ids: items.map((item) => item.id),
      batch_record_count: items.length,
      processed_item_ids: plannedItems.map((item) => item.id),
      source_fingerprint: batchFingerprint,
      cache_state: plan.cache_state,
      cache_covered_item_ids: plan.covered.map((row) => row.item_id),
      cache_entry_ids: cacheEntry ? [cacheEntry.id] : [],
      content_exclusions: contentExclusions,
      call_details: callDetails,
      rejection_report: rejectionReport,
      grouping: { method: grouping.method, candidates: grouping.candidates, duplicates: grouping.duplicates, refused_merges: grouping.refused_merges, records_analysed: grouping.records_analysed },
      providers: requestedModels.length ? [pipeline.callA.provider].concat(pipeline.callB ? [pipeline.callB.provider] : []) : [],
      requested_models: requestedModels,
      resolved_models: resolvedModels,
      resolved_model_available: resolvedModels.length > 0,
      resolved_model_note: resolvedNote,
      model_calls: pipeline.modelCalls,
      provider_calls: pipeline.modelCalls,
      calls_per_provider: pipeline.callsPerProvider,
      usage_available: Boolean(pipeline.usage),
      ...(pipeline.usage ? { usage: pipeline.usage } : {}),
      cost_known: false,
      cost: pipeline.cost,
      cost_estimate_basis: pipeline.cost.basis,
      estimated_spend_usd: estimate.estimated_usd,
      spend_ceiling_usd: config.spend_ceiling_usd,
      developments_accepted: pipeline.finalized.developments.length,
      developments_partial: pipeline.finalized.developments.filter((row) => row.status === 'partial').length,
      developments_rejected: pipeline.collected.rejected_developments.length,
      claims_accepted: pipeline.finalized.claims.length,
      claims_rejected: pipeline.collected.rejected_claims.length,
      success_criteria: pipeline.criteria,
      success_criteria_failed: pipeline.failed_criteria,
      error_category: errorSource && errorSource.ok === false && errorSource.error ? errorSource.error.category : '',
      error_summary: errorSource && errorSource.ok === false && errorSource.error ? errorSource.error.summary : '',
      finished_at: finishedAt,
      duration_ms: Date.now() - startedAt,
      notes: `authorized batch over ${plannedItems.length} of ${items.length} requested records (${plan.covered.length} skipped as cached), ${pipeline.modelCalls} model calls, ${pipeline.finalized.developments.length} developments stored from ${pipeline.finalized.claims.length} verified claims. Status ${pipeline.status}: ${pipeline.passed}/${pipeline.total} criteria met${pipeline.failed_criteria.length ? `; not met: ${pipeline.failed_criteria.join(', ')}` : ''}. ${pipeline.collected.rejected_claims.length} claims and ${pipeline.collected.rejected_developments.length} developments were rejected by validation (${pipeline.collected.counts.fabricated_citations} citation mismatches). ${resolvedNote}. No retry is performed.`,
    });

    const secretFindings = scanForSecrets({ run_id: runId, criteria: pipeline.criteria, claims: pipeline.finalized.claims });

    return Response.json({
      ok: pipeline.status === 'success' || pipeline.status === 'no_findings',
      action, run_id: runId, status: pipeline.status, stage: config.stage,
      authorization_id: authorizationId, authorization_consumed: true, kill_switch: killSwitch,
      success_criteria: pipeline.criteria,
      success_criteria_failed: pipeline.failed_criteria,
      success_criteria_met: `${pipeline.passed}/${pipeline.total}`,
      batch: {
        selection, requested: validation.requested || 0, resolved_records: items.length,
        processed_records: plannedItems.length, skipped_as_cached: plan.covered.map((row) => row.item_id),
        missing_ids: missingIds, duplicate_ids: validation.duplicate_ids || [], cap: config.max_records,
        excluded_records: content.counts.excluded,
      },
      cache: { state: plan.cache_state, entry_id: cacheEntry ? cacheEntry.id : null, note: plan.note },
      content_exclusions: contentExclusions,
      grouping: {
        method: grouping.method, candidates: grouping.candidates, duplicates: grouping.duplicates,
        refused_merges: grouping.refused_merges, records_analysed: grouping.records_analysed,
      },
      call_budget: { per_provider: config.max_calls_per_provider, total: config.max_calls_total, consumed: pipeline.modelCalls },
      model_calls: pipeline.modelCalls, provider_calls: pipeline.modelCalls,
      calls_per_provider: pipeline.callsPerProvider,
      call_details: callDetails,
      providers: [pipeline.callA.provider].concat(pipeline.callB ? [pipeline.callB.provider] : []),
      requested_models: requestedModels,
      resolved_models: resolvedModels, resolved_model_note: resolvedNote,
      usage_available: Boolean(pipeline.usage),
      usage: pipeline.usage || 'not returned by provider',
      cost_known: false, cost: pipeline.cost, billed_cost: pipeline.cost.billed_cost_note,
      estimate,
      rejection_report: rejectionReport,
      developments: pipeline.finalized.developments.map((row) => ({
        ...row, stored: storedDevelopments.some((stored) => stored.development_id === row.development_id),
      })),
      claims_stored: storedClaims.length,
      stored: {
        run_record_id: runRecord.id,
        development_ids: storedDevelopments.map((row) => row.development_id),
        cache_entry_id: cacheEntry ? cacheEntry.id : null,
      },
      extraction: {
        status: pipeline.callA.ok ? 'success' : (pipeline.callA.timed_out ? 'timed_out' : 'failed'),
        latency_ms: pipeline.callA.latency_ms,
        requested_model: pipeline.callA.requested_model, resolved_model: pipeline.callA.resolved_model,
        error: pipeline.callA.error || null,
      },
      evaluation: pipeline.callB ? {
        status: pipeline.callB.ok ? 'success' : (pipeline.callB.timed_out ? 'timed_out' : 'failed'),
        latency_ms: pipeline.callB.latency_ms,
        requested_model: pipeline.callB.requested_model, resolved_model: pipeline.callB.resolved_model,
        assessments: pipeline.finalized.claims.map((claim) => ({ claim_id: claim.claim_id, state: claim.assessment_state })),
        error: pipeline.callB.error || null,
      } : 'skipped: no claim survived validation, so the evaluation model was not called',
      independent_verification: 'not_performed',
      secret_findings: secretFindings,
      limitations: DEV_LIMITATIONS,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error_category: categorizeError(sanitizeMessage(error)),
      error: sanitizeMessage(error),
    }, { status: 500 });
  }
}