// Phase 3F: the security and operational hardening regression suite.
//
// Every case here is a real check of the code the live paths use:
//
//   - the ingestion authorization decision is the one ingestTrends calls;
//   - the isolated store is the one the suites are given;
//   - the analysis suite is executed end to end against that store, with a tripwire in place
//     of the platform SDK, so the case proves by running it that no test reaches production;
//   - the feed cases use the feed module the public function uses;
//   - the cleanup classification is the one the read-only inventory reports;
//   - the recovery gate is the posture the endpoint reports.
//
// The suite makes no provider call, no model call, no network request and no production write.

import { DEV_ANALYSIS_CONFIG } from './devAnalysisConfig.ts';
import { resolveFeed } from './devFeed.ts';
import { createCaseRecorder } from './pipelineSupport.ts';
import {
  INGESTION_AUTH_DESIGN, INGESTION_LIMITATIONS, ITEM_WRITE_PATHS, ingestTrendsAccess, ingestionAccess,
} from './ingestionAuth.ts';
import {
  PRODUCTION_BACKED_ACTIONS, PRODUCTION_EXECUTION_GATE, PRODUCTION_EXECUTION_LIMITATIONS,
  ROUTINE_REGRESSION_ACTIONS, productionExecutionAccess, productionExecutionAuthorized,
} from './productionExecutionGate.ts';
import { RECOVERY_GATE, RECOVERY_LIMITATIONS } from './recoveryGate.ts';
import {
  ANALYSIS_SUITE_COLLECTIONS, ISOLATED_DB_MARKER, ISOLATION_LIMITATIONS, IsolationViolationError,
  PRODUCTION_COLLECTIONS, createIsolatedTestDb, createLiveCallTripwire, probeCollection,
} from './testIsolation.ts';
import {
  CLEANUP_CRITERIA, LIVE_RUN_ID, classifyFixtures, isSuiteIdentifier,
} from './fixtureInventory.ts';
import { buildDevRunRecord, persistCacheEntry, persistRun, reserveCallSlot, updateRun } from './devAnalysisTrace.ts';
import { runSuite } from './devAnalysisSuite.ts';

// A development whose parent run proves it came from a real, authorized live batch.
function liveRunFixture(overrides = {}) {
  return {
    run_id: 'run_phase3f_live', stage: DEV_ANALYSIS_CONFIG.stage, action: 'analyze', dry_run: false,
    status: 'success', execution_flag: true, kill_switch_state: 'on', claim_state: 'consumed',
    claim_token: 'token-abcdefgh', authorization_id: 'auth-abcdefgh', operator_role: 'admin',
    source_fingerprint: 'fp_phase3f', ...overrides,
  };
}

function liveDevelopmentFixture(overrides = {}) {
  return {
    development_id: 'dev_phase3f_live', run_id: 'run_phase3f_live', stage: DEV_ANALYSIS_CONFIG.stage,
    status: 'accepted', source_fingerprint: 'fp_phase3f',
    source_urls: ['https://arxiv.org/abs/2510.00001'], primary_published_at: '2026-10-04T09:00:00.000Z',
    title: 'Quine: A Self-Compiling Language for Agentic Systems', kind: 'research',
    kind_basis: 'research contribution from the stored text', summary: 'The paper proposes Quine.',
    why_it_matters: 'A self-compiling language for agentic systems.', claim_ids: ['claim_phase3f'],
    supporting_item_ids: ['itm_quine'], support_state: 'evidence_supported_by_model',
    source_states_claim: true, evidence_supported_by_model: true, ...overrides,
  };
}

function liveClaimsFixture() {
  return [{
    claim_id: 'claim_phase3f', run_id: 'run_phase3f_live', item_id: 'itm_quine', source: 'arXiv',
    canonical_url: 'https://arxiv.org/abs/2510.00001', published_at: '2026-10-04T09:00:00.000Z',
    evidence_quote: 'We propose Quine, a self-compiling language for agentic systems', quote_in_record: true,
  }];
}

export async function runPhase3fSuite({ runId = `phase3f-suite_${Date.now()}` } = {}) {
  const cases = [];
  const record = createCaseRecorder(cases);

  // --- 1. ingestion authorization ---------------------------------------------------------
  await record('ingestion.an_unauthenticated_request_is_refused', async () => {
    const anonymous = ingestionAccess(null);
    const undefinedUser = ingestionAccess(undefined);
    return {
      ok: anonymous.ok === false && anonymous.status === 401 && anonymous.error_category === 'unauthenticated'
        && undefinedUser.ok === false && undefinedUser.status === 401
        && anonymous.writes === 0 && anonymous.model_calls === 0 && anonymous.provider_calls === 0,
      note: { status: anonymous.status, category: anonymous.error_category, undefined_user_status: undefinedUser.status },
    };
  });

  await record('ingestion.a_non_administrator_is_refused', async () => {
    const user = ingestionAccess({ id: 'u_reader', role: 'user' });
    const withoutRole = ingestionAccess({ id: 'u_reader' });
    return {
      ok: user.ok === false && user.status === 403 && user.error_category === 'forbidden'
        && withoutRole.ok === false && withoutRole.status === 403,
      note: { status: user.status, category: user.error_category, missing_role_status: withoutRole.status },
    };
  });

  await record('ingestion.an_administrator_is_authorized', async () => {
    const admin = ingestionAccess({ id: 'u_admin', role: 'admin' });
    return {
      ok: admin.ok === true && admin.status === 200 && admin.operator.operator_id === 'u_admin'
        && admin.operator.operator_role === 'admin'
        && admin.operator.authorization === 'authenticated_administrator',
      note: { operator: admin.operator },
    };
  });

  // The correction this suite exists for: nothing a caller controls can stand in for a
  // signed-in administrator, and the decision function takes nothing else to read.
  await record('ingestion.no_caller_supplied_field_can_grant_access', async () => {
    const forged = ingestionAccess({
      trigger_source: 'schedule',
      from_schedule: true,
      is_scheduler: true,
      headers: { 'x-base44-scheduler': 'verified', authorization: 'Bearer scheduler' },
      query: { trigger_source: 'schedule' },
      body: { trigger_source: 'schedule', execute: true },
      operator_role: 'admin',
      role: 'admin-without-an-id',
    });
    const spoofedRoleOnly = ingestionAccess({ id: '', role: 'admin' });
    return {
      ok: forged.ok === false && forged.status === 401
        && spoofedRoleOnly.ok === false && spoofedRoleOnly.status === 401
        // One parameter: the decision cannot read a request, a header or a body.
        && ingestionAccess.length === 1
        && INGESTION_AUTH_DESIGN.accepted_proofs.length === 1
        && INGESTION_AUTH_DESIGN.rejected_proofs.length >= 4,
      note: {
        forged_status: forged.status, forged_category: forged.error_category,
        empty_id_status: spoofedRoleOnly.status,
        decision_parameters: ingestionAccess.length,
        accepted_proofs: INGESTION_AUTH_DESIGN.accepted_proofs.length,
      },
    };
  });

  await record('ingestion.the_writer_inventory_is_declared', async () => {
    const paths = ITEM_WRITE_PATHS.map((entry) => entry.path);
    return {
      ok: paths.includes('ingestTrends') && paths.includes('enrichSourceText')
        && paths.includes('Trends Ingestion') && paths.includes('administrator entity access')
        && ITEM_WRITE_PATHS.every((entry) => Boolean(entry.writes) && Boolean(entry.authorization)),
      note: { paths, declared: ITEM_WRITE_PATHS.length },
    };
  });

  // --- 2. scheduled invocation ------------------------------------------------------------
  await record('scheduler.no_verified_scheduler_identity_is_documented', async () => {
    const claimedScheduler = ingestionAccess({ id: 'scheduler', role: 'service', scheduler: true });
    return {
      ok: INGESTION_AUTH_DESIGN.scheduler_identity_documented === false
        && /no documented/i.test(INGESTION_LIMITATIONS.scheduler_identity)
        && claimedScheduler.ok === false
        && INGESTION_AUTH_DESIGN.scheduler_identity_note.length > 40,
      note: {
        documented: INGESTION_AUTH_DESIGN.scheduler_identity_documented,
        claimed_scheduler_status: claimedScheduler.status,
        note: INGESTION_AUTH_DESIGN.scheduler_identity_note,
      },
    };
  });

  await record('scheduler.fallback_is_admin_only_with_the_schedule_paused', async () => {
    return {
      ok: INGESTION_AUTH_DESIGN.fallback === 'admin_only_manual_ingestion'
        && INGESTION_AUTH_DESIGN.schedule_state === 'paused'
        && Boolean(INGESTION_AUTH_DESIGN.schedule_note) && Boolean(INGESTION_LIMITATIONS.schedule_paused),
      note: {
        fallback: INGESTION_AUTH_DESIGN.fallback,
        schedule_state: INGESTION_AUTH_DESIGN.schedule_state,
        schedule_name: INGESTION_AUTH_DESIGN.schedule_name,
      },
    };
  });

  // --- 3. test isolation ------------------------------------------------------------------
  await record('isolation.production_collections_are_unreachable_from_a_test_store', async () => {
    const isolated = createIsolatedTestDb({ collections: ANALYSIS_SUITE_COLLECTIONS, label: 'isolation-probe' });
    const probes = PRODUCTION_COLLECTIONS.map((name) => probeCollection(isolated.db, name));
    const reachable = probes.filter((probe) => probe.reached).map((probe) => probe.collection).sort();
    const blocked = probes.filter((probe) => !probe.reached);
    return {
      ok: blocked.length === PRODUCTION_COLLECTIONS.length - ANALYSIS_SUITE_COLLECTIONS.length
        && JSON.stringify(reachable) === JSON.stringify(ANALYSIS_SUITE_COLLECTIONS.slice().sort())
        && blocked.every((probe) => /isolation|not one of them/i.test(probe.reason))
        && isolated.state.marker === ISOLATED_DB_MARKER
        && isolated.describe().production_writes === 0,
      note: {
        reachable, blocked: blocked.map((probe) => probe.collection),
        blocked_collections: isolated.state.blocked_collections,
      },
    };
  });

  await record('isolation.a_write_path_lands_in_memory_and_nowhere_else', async () => {
    const isolated = createIsolatedTestDb({ collections: ANALYSIS_SUITE_COLLECTIONS, label: 'write-probe' });
    const anchor = await persistRun(isolated.db, buildDevRunRecord({
      run_id: 'isolation_write_probe', action: 'suite', status: 'running', authorization_id: 'isolation_write_probe',
    }));
    const slot = await reserveCallSlot(isolated.db, anchor.id, 'a', 'probe:model');
    const updated = await updateRun(isolated.db, anchor.id, { status: 'success' });
    const cache = await persistCacheEntry(isolated.db, {
      fingerprint: 'fp_isolation_probe', run_id: 'isolation_write_probe', development_ids: [], claims_accepted: 0, model_calls: 0,
    });
    const touched = Array.from(new Set(isolated.state.writes.map((entry) => entry.collection)));
    return {
      ok: anchor.id && slot.ok === true && slot.updated === 1 && updated.status === 'success'
        && cache.fingerprint === 'fp_isolation_probe'
        && touched.length > 0 && touched.every((name) => ANALYSIS_SUITE_COLLECTIONS.includes(name))
        && isolated.state.writes.every((entry) => ANALYSIS_SUITE_COLLECTIONS.includes(entry.collection))
        && isolated.describe().production_writes === 0,
      note: {
        anchor_id: anchor.id, slot_ok: slot.ok, slot_updated: slot.updated,
        updated_status: updated.status, cache_fingerprint: cache.fingerprint,
        writes_by_collection: isolated.describe().writes_by_collection, touched,
      },
    };
  });

  await record('isolation.the_tripwire_refuses_every_platform_call', async () => {
    const tripwire = createLiveCallTripwire('the regression case');
    // Each probe places a call and is awaited, so a refusal that arrives as a rejected promise
    // counts as a refusal too. Reading a property alone is inert and is deliberately not a probe:
    // the tripwire exists to stop calls.
    const attempt = async (path, handler) => {
      try {
        await handler();
        return { path, refused: false, kind: 'no error raised' };
      } catch (error) {
        return {
          path,
          refused: error instanceof IsolationViolationError,
          kind: error instanceof IsolationViolationError ? 'isolation_violation' : `unexpected: ${error && error.name}`,
        };
      }
    };
    const attempts = [];
    attempts.push(await attempt('auth.me', () => tripwire.auth.me()));
    attempts.push(await attempt('users.inviteUser', () => tripwire.users.inviteUser('someone@example.org', 'user')));
    attempts.push(await attempt('functions.invoke', () => tripwire.functions.invoke('ingestTrends', {})));
    attempts.push(await attempt('entities.Item.filter', () => tripwire.entities.Item.filter({})));
    attempts.push(await attempt('entities.DevAnalysisRun.create', () => tripwire.entities.DevAnalysisRun.create({})));
    attempts.push(await attempt('integrations.Core.InvokeLLM', () => tripwire.integrations.Core.InvokeLLM({ prompt: 'x' })));
    attempts.push(await attempt('asServiceRole.entities.Item.update', () => tripwire.asServiceRole.entities.Item.update('x', {})));
    attempts.push(await attempt('asServiceRole.integrations.Core.InvokeLLM', () => tripwire.asServiceRole.integrations.Core.InvokeLLM({ prompt: 'x' })));
    attempts.push(await attempt('asServiceRole.aiGateway.connection', () => tripwire.asServiceRole.aiGateway.connection({ provider: 'typesafe' })));
    const notRefused = attempts.filter((entry) => !entry.refused);
    return {
      ok: attempts.length === 9 && notRefused.length === 0 && tripwire.__test_tripwire === true,
      note: {
        probes: attempts.length, refused: attempts.length - notRefused.length,
        not_refused: notRefused, kinds: Array.from(new Set(attempts.map((entry) => entry.kind))),
      },
    };
  });

  // The strongest possible check: the whole analysis suite is executed here, against an
  // in-memory store and a tripwire, and it must pass without either reaching production.
  await record('isolation.the_analysis_suite_runs_without_reaching_production', async () => {
    const isolated = createIsolatedTestDb({ collections: ANALYSIS_SUITE_COLLECTIONS, label: 'nested-analysis-suite' });
    const nested = await runSuite({
      db: isolated.db,
      base44: createLiveCallTripwire('the mocked-provider analysis suite'),
      runId: `${runId}-iso`,
    });
    const touched = Array.from(new Set([
      ...isolated.state.reads.map((entry) => entry.collection),
      ...isolated.state.writes.map((entry) => entry.collection),
    ])).sort();
    const itemProbe = probeCollection(isolated.db, 'Item');
    const proofProbe = probeCollection(isolated.db, 'ModelProofRun');
    return {
      ok: nested.cases_run > 0 && nested.failed === 0
        && isolated.state.writes.length > 0
        && touched.every((name) => ANALYSIS_SUITE_COLLECTIONS.includes(name))
        && itemProbe.reached === false && proofProbe.reached === false
        && isolated.describe().production_writes === 0,
      note: {
        nested_cases: nested.cases_run, nested_passed: nested.passed, nested_failed: nested.failed,
        failing: nested.cases.filter((entry) => !entry.ok).map((entry) => entry.name),
        collections_touched: touched, in_memory_writes: isolated.state.writes.length,
        item_reachable: itemProbe.reached, proof_reachable: proofProbe.reached,
      },
    };
  });

  await record('isolation.limitations_are_declared', async () => {
    const required = ['storage', 'unreachable', 'no_platform_sdk', 'no_records_created', 'no_authorization', 'production_writes_are_zero', 'in_memory_semantics'];
    const missing = required.filter((key) => !ISOLATION_LIMITATIONS[key]);
    return { ok: missing.length === 0, note: { undocumented: missing, declared: required.length } };
  });

  // --- 4. the public feed -----------------------------------------------------------------
  await record('feed.provenance_filtering_stays_fail_closed', async () => {
    const run = liveRunFixture();
    const live = liveDevelopmentFixture();
    const suiteFixture = liveDevelopmentFixture({ development_id: 'dev_suite_fixture', run_id: 'run_suite_fixture' });
    const dryRun = liveDevelopmentFixture({ development_id: 'dev_dry_fixture', run_id: 'run_dry_fixture' });
    const orphan = liveDevelopmentFixture({ development_id: 'dev_orphan', run_id: 'run_absent' });
    const feed = resolveFeed({
      developments: [live, suiteFixture, dryRun, orphan],
      runsById: {
        [run.run_id]: run,
        run_suite_fixture: liveRunFixture({ run_id: 'run_suite_fixture', action: 'suite' }),
        run_dry_fixture: liveRunFixture({ run_id: 'run_dry_fixture', action: 'dry_run', dry_run: true }),
      },
      claimsByRun: { [run.run_id]: liveClaimsFixture() },
      limit: 6,
    });
    const codes = feed.excluded.map((entry) => entry.reason_code);
    return {
      ok: feed.items.length === 1 && feed.items[0].development_id === live.development_id
        && codes.includes('parent_run_is_suite_fixture')
        && codes.includes('parent_run_was_a_dry_run')
        && codes.includes('parent_run_missing')
        && feed.items[0].independent_verification === 'not_performed',
      note: { shown: feed.items.map((item) => item.development_id), excluded: codes },
    };
  });

  // --- 5. the fixture cleanup, as a dry run ------------------------------------------------
  await record('cleanup.suite_fixtures_are_identified_by_explicit_identifiers_only', async () => {
    const classified = classifyFixtures({
      runs: [
        { id: 'run_a', run_id: 'phase2c-suite3-multi', authorization_id: 'phase2c-suite3-multi' },
        { id: 'run_b', run_id: LIVE_RUN_ID, authorization_id: 'auth-live-1' },
        { id: 'run_c', run_id: 'run_manual_dry', authorization_id: 'auth-manual-1' },
      ],
      developments: [
        { id: 'dev_a', development_id: 'dev_suite_1', run_id: 'phase2c-suite3-multi' },
        { id: 'dev_b', development_id: 'dev_live_1', run_id: LIVE_RUN_ID },
        { id: 'dev_c', development_id: 'dev_manual_1', run_id: 'run_manual_dry' },
      ],
      claims: [
        { id: 'claim_a', claim_id: 'claim_suite_1', development_id: 'dev_suite_1', run_id: 'phase2c-suite3-multi' },
        { id: 'claim_b', claim_id: 'claim_live_1', development_id: 'dev_live_1', run_id: LIVE_RUN_ID },
      ],
      cacheEntries: [
        { id: 'cache_a', run_id: 'phase2c-suite3-multi', development_ids: ['dev_suite_1'] },
        { id: 'cache_b', run_id: LIVE_RUN_ID, development_ids: ['dev_live_1'] },
      ],
    });
    const candidates = classified.candidates;
    return {
      ok: isSuiteIdentifier('phase2c-suite3-multi') === true && isSuiteIdentifier('phase2a-suite') === true
        && isSuiteIdentifier(LIVE_RUN_ID) === false && isSuiteIdentifier('run_manual_dry') === false
        && candidates.DevAnalysisRun.count === 1 && candidates.DevAnalysisRun.ids[0] === 'run_a'
        && candidates.DevDevelopment.count === 1 && candidates.DevDevelopment.ids[0] === 'dev_a'
        && candidates.DevClaim.count === 1 && candidates.DevClaim.ids[0] === 'claim_a'
        && candidates.DevAnalysisCache.count === 1 && candidates.DevAnalysisCache.ids[0] === 'cache_a'
        && classified.delete_performed === false && classified.read_only === true,
      note: {
        candidates: {
          runs: candidates.DevAnalysisRun.ids, developments: candidates.DevDevelopment.ids,
          claims: candidates.DevClaim.ids, cache: candidates.DevAnalysisCache.ids,
        },
        protected_runs: classified.protected.run_reason_codes,
        totals: classified.totals,
      },
    };
  });

  await record('cleanup.the_live_run_and_its_children_are_preserved', async () => {
    const classified = classifyFixtures({
      runs: [{ id: 'run_b', run_id: LIVE_RUN_ID, authorization_id: 'auth-live-1' }],
      developments: [{ id: 'dev_b', development_id: 'dev_live_1', run_id: LIVE_RUN_ID }],
      claims: [{ id: 'claim_b', claim_id: 'claim_live_1', development_id: 'dev_live_1', run_id: LIVE_RUN_ID }],
      cacheEntries: [{ id: 'cache_b', run_id: LIVE_RUN_ID, development_ids: ['dev_live_1'] }],
    });
    return {
      ok: classified.live_run.present === true && classified.live_run.excluded === true
        && classified.candidates.DevAnalysisRun.count === 0
        && classified.candidates.DevDevelopment.count === 0
        && classified.candidates.DevClaim.count === 0
        && classified.candidates.DevAnalysisCache.count === 0
        && classified.protected.DevDevelopment === 1 && classified.protected.DevClaim === 1
        && classified.protected.run_reason_codes.live_run_excluded === 1
        && CLEANUP_CRITERIA.live_run_exclusion.includes(LIVE_RUN_ID),
      note: {
        live_run: classified.live_run, protected: classified.protected,
        candidates: classified.candidates.DevAnalysisRun.count,
      },
    };
  });

  await record('cleanup.a_referenced_development_is_never_orphaned', async () => {
    const classified = classifyFixtures({
      runs: [{ id: 'run_a', run_id: 'phase2c-suite3-multi', authorization_id: 'phase2c-suite3-multi' }],
      developments: [{ id: 'dev_a', development_id: 'dev_shared_1', run_id: 'phase2c-suite3-multi' }],
      claims: [{ id: 'claim_a', claim_id: 'claim_shared_1', development_id: 'dev_shared_1', run_id: 'phase2c-suite3-multi' }],
      // A cache entry the cleanup is not removing still references this development.
      cacheEntries: [{ id: 'cache_live', run_id: LIVE_RUN_ID, development_ids: ['dev_shared_1'] }],
    });
    const reasons = classified.protected.development_reason_codes;
    return {
      ok: classified.candidates.DevDevelopment.count === 0 && classified.candidates.DevClaim.count === 0
        && reasons.referenced_by_a_non_candidate_cache_entry === 1
        && classified.protected.claim_reason_codes.development_is_protected === 1,
      note: { development_reasons: reasons, claim_reasons: classified.protected.claim_reason_codes },
    };
  });

  // --- 6. the recovery gate ----------------------------------------------------------------
  await record('recovery.stays_blocked_without_a_documented_atomic_mechanism', async () => {
    const guarded = createIsolatedTestDb({ collections: ANALYSIS_SUITE_COLLECTIONS, label: 'recovery-probe' });
    const attempt = (label, handler) => {
      try {
        handler();
        return { label, refused: false, kind: 'no error raised' };
      } catch (error) {
        return {
          label,
          refused: error instanceof IsolationViolationError,
          kind: error instanceof IsolationViolationError ? 'isolation_violation' : `unexpected: ${error && error.name}`,
        };
      }
    };
    // The recovery would have to write Item.excerpt directly. No write method for Item and no
    // transaction is reachable at all, which is the structural half of the block; the declared
    // half is that the platform documents neither atomicity nor a compare-and-set.
    const probes = [
      attempt('Item.updateMany', () => guarded.db.Item.updateMany({}, { $set: { excerpt: 'x' } })),
      attempt('Item.update', () => guarded.db.Item.update('itm_1', { excerpt: 'x' })),
      attempt('transaction', () => guarded.db.transaction({})),
    ];
    const notRefused = probes.filter((entry) => !entry.refused);
    return {
      ok: RECOVERY_GATE.status === 'blocked'
        && RECOVERY_GATE.documented_atomic_update === false
        && RECOVERY_GATE.documented_transaction === false
        && RECOVERY_GATE.documented_compare_and_set === false
        && RECOVERY_GATE.required_before_proceeding.length === 3
        && RECOVERY_GATE.blocked_because.length === 3
        && /updateMany\(\) match count/.test(RECOVERY_GATE.prohibited)
        && RECOVERY_GATE.manifest.records === 23
        && notRefused.length === 0
        && RECOVERY_LIMITATIONS.no_bypass.length > 40
        && RECOVERY_LIMITATIONS.writers_remain.includes('administrator'),
      note: {
        status: RECOVERY_GATE.status,
        documented_atomic_update: RECOVERY_GATE.documented_atomic_update,
        manifest_records: RECOVERY_GATE.manifest.records,
        prerequisites: RECOVERY_GATE.required_before_proceeding.length,
        probes: probes.length, not_refused: notRefused,
      },
    };
  });

  await record('limitations.declared', async () => {
    const required = ['scheduler_identity', 'no_caller_trust', 'schedule_paused', 'refusal_is_free', 'manual_only'];
    const missing = required.filter((key) => !INGESTION_LIMITATIONS[key]);
    const recoveryMissing = ['no_mechanism', 'no_bypass', 'writers_remain', 'phase_3e_accepted']
      .filter((key) => !RECOVERY_LIMITATIONS[key]);
    return {
      ok: missing.length === 0 && recoveryMissing.length === 0,
      note: { ingestion_missing: missing, recovery_missing: recoveryMissing, declared: required.length + 4 },
    };
  });

  // --- 7. the production-execution gate (Phase 3G) -----------------------------------------
  // The incident: a routine validation call reached the deployed ingestion handler, which the
  // platform harness had authenticated as a real administrator, and a full ingestion ran. The
  // isolation cases above could not have caught it, because the tripwire protects a *suite* and
  // this was a direct handler invocation. These cases assert the control that closes that path.
  await record('execution_gate.authorization_list_is_empty_by_default', async () => {
    const routineKeys = new Set(ROUTINE_REGRESSION_ACTIONS.map((entry) => `${entry.path}.${entry.action}`));
    const overlapping = PRODUCTION_BACKED_ACTIONS.filter((entry) => routineKeys.has(`${entry.path}.${entry.action}`));
    const routineForIngestion = ROUTINE_REGRESSION_ACTIONS.filter((entry) => entry.path === 'ingestTrends');
    return {
      ok: PRODUCTION_EXECUTION_GATE.authorized_runs.length === 0
        && PRODUCTION_EXECUTION_GATE.require_explicit_authorization === true
        && PRODUCTION_EXECUTION_GATE.routine_commands_carry_no_authorization === true
        && overlapping.length === 0
        && routineForIngestion.length === 0
        && PRODUCTION_BACKED_ACTIONS.some((entry) => entry.path === 'ingestTrends')
        && PRODUCTION_BACKED_ACTIONS.some((entry) => entry.path === 'enrichSourceText' && entry.action === 'enrich')
        && PRODUCTION_BACKED_ACTIONS.every((entry) => /authorization/.test(entry.requires)),
      note: {
        authorized_runs: PRODUCTION_EXECUTION_GATE.authorized_runs,
        production_backed: PRODUCTION_BACKED_ACTIONS.map((entry) => `${entry.path}.${entry.action}`),
        routine_actions: ROUTINE_REGRESSION_ACTIONS.length,
        overlapping: overlapping.map((entry) => `${entry.path}.${entry.action}`),
        routine_actions_for_ingestTrends: routineForIngestion.length,
      },
    };
  });

  await record('execution_gate.routine_invocations_are_refused', async () => {
    const principal = { id: 'u_admin', role: 'admin' };
    // The exact shapes a routine regression command, a test harness or a stale script carries.
    const routineValues = [undefined, null, '', '   ', 'test', 'regression', 'phase3f-security-suite-3', 'devAnalysis', 'suite'];
    const refusals = routineValues.map((value) => productionExecutionAccess({ authorization: value, principal, path: 'ingestTrends', action: 'run' }));
    return {
      ok: refusals.every((entry) => entry.ok === false && entry.status === 403
        && entry.error_category === 'production_execution_not_authorized'
        && entry.authorization_accepted === false && entry.gate.armed_entries.length === 0
        && entry.gate.single_use === false),
      note: {
        routine_values_tried: routineValues.length,
        statuses: Array.from(new Set(refusals.map((entry) => entry.status))),
        categories: Array.from(new Set(refusals.map((entry) => entry.error_category))),
        supplied: Array.from(new Set(refusals.map((entry) => entry.authorization_supplied))),
      },
    };
  });

  await record('execution_gate.identity_is_checked_first', async () => {
    const anonymous = productionExecutionAccess({ authorization: 'any-run-id', principal: null, path: 'ingestTrends' });
    const nonAdmin = productionExecutionAccess({ authorization: 'any-run-id', principal: { id: 'u_reader', role: 'user' }, path: 'ingestTrends' });
    const noId = productionExecutionAccess({ authorization: 'any-run-id', principal: { role: 'admin' }, path: 'ingestTrends' });
    const category = 'production_execution_requires_an_authenticated_administrator';
    return {
      ok: anonymous.ok === false && anonymous.status === 401 && anonymous.error_category === category
        && nonAdmin.ok === false && nonAdmin.status === 403 && nonAdmin.error_category === category
        && noId.ok === false && noId.status === 401
        && anonymous.authorization_accepted === false
        && anonymous.gate.armed_entries.length === 0
        && nonAdmin.gate.stage === PRODUCTION_EXECUTION_GATE.stage
        && noId.gate.stage === PRODUCTION_EXECUTION_GATE.stage,
      note: { anonymous: anonymous.status, non_administrator: nonAdmin.status, administrator_without_an_id: noId.status },
    };
  });

  await record('execution_gate.an_armed_authorization_is_admitted_only_for_its_own_scope', async () => {
    // The mechanism is proven on a supplied list, so the real constant stays empty.
    const now = Date.parse('2026-10-12T00:00:00.000Z');
    const entries = [
      { id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', armed_at: '2026-10-11T23:00:00.000Z', expires_at: '2026-10-12T03:00:00.000Z', note: 'one bounded ingestion' },
      { id: 'phase3g-enrich-1', path: 'enrichSourceText', action: 'enrich', expires_at: '2026-10-12T03:00:00.000Z', note: 'ten title-only records' },
    ];
    const check = (authorization, path, action) => productionExecutionAuthorized(authorization, { path, action, entries, now });
    return {
      ok: check('phase3g-run-1', 'ingestTrends', 'run').authorized === true
        && check(' phase3g-run-1 ', 'ingestTrends', 'run').authorized === true
        && check('phase3g-run-2', 'ingestTrends', 'run').reason === 'id_not_on_the_authorization_list'
        && check('phase3g-run-1', 'ingestionTrends', 'run').reason === 'authorization_is_scoped_to_another_action'
        && check('phase3g-run-1', 'ingestTrends', 'run') && check('phase3g-run-1', 'ingestTrends', 'run').entry.id === 'phase3g-run-1'
        && check('phase3g-run-1', 'enrichSourceText', 'enrich').reason === 'authorization_is_scoped_to_another_action'
        && check('phase3g-enrich-1', 'ingestTrends', 'run').reason === 'authorization_is_scoped_to_another_action'
        && check('phase3g-run-1', 'ingestTrends', 'dry_run').reason === 'authorization_is_scoped_to_another_action'
        && check('phase3g-run-1', 'ingestTrends', undefined).reason === 'authorization_is_scoped_to_another_action'
        && check('', 'ingestTrends', 'run').reason === 'no_authorization_supplied'
        && check('   ', 'ingestTrends', 'run').reason === 'no_authorization_supplied'
        && check(null, 'ingestTrends', 'run').reason === 'no_authorization_supplied'
        && check({ id: 'phase3g-run-1' }, 'ingestTrends', 'run').reason === 'no_authorization_supplied',
      note: {
        its_own_scope: check('phase3g-run-1', 'ingestTrends', 'run').reason,
        reused_for_another_action: check('phase3g-run-1', 'enrichSourceText', 'enrich').reason,
        wrong_action_on_its_own_path: check('phase3g-run-1', 'ingestTrends', 'dry_run').reason,
        unknown_id: check('phase3g-run-2', 'ingestTrends', 'run').reason,
        different_path: check('phase3g-run-1', 'ingestionTrends', 'run').reason,
        matched_entry_note: check('phase3g-run-1', 'ingestTrends', 'run').entry.note,
      },
    };
  });

  await record('execution_gate.expiry_is_required_and_enforced', async () => {
    const now = Date.parse('2026-10-12T00:00:00.000Z');
    const scoped = (entry) => productionExecutionAuthorized('phase3g-run-1', { path: 'ingestTrends', action: 'run', entries: [entry], now });
    const live = scoped({ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', expires_at: '2026-10-12T06:00:00.000Z' });
    const expired = scoped({ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', expires_at: '2026-10-11T23:59:00.000Z' });
    const atTheBoundary = scoped({ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', expires_at: '2026-10-12T00:00:00.000Z' });
    const noExpiry = scoped({ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run' });
    const junkExpiry = scoped({ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', expires_at: 'whenever' });
    return {
      ok: live.authorized === true && live.entry.expires_at === '2026-10-12T06:00:00.000Z'
        && expired.reason === 'authorization_expired_or_missing_an_expiry'
        && atTheBoundary.reason === 'authorization_expired_or_missing_an_expiry'
        && noExpiry.reason === 'authorization_expired_or_missing_an_expiry'
        && junkExpiry.reason === 'authorization_expired_or_missing_an_expiry',
      note: {
        inside_the_window: live.reason, expired: expired.reason,
        at_the_expiry_instant: atTheBoundary.reason,
        without_an_expiry: noExpiry.reason, unparseable_expiry: junkExpiry.reason,
      },
    };
  });

  await record('execution_gate.single_use_is_not_guaranteed_and_the_limitation_is_declared', async () => {
    const now = Date.parse('2026-10-12T00:00:00.000Z');
    const entries = [{ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', expires_at: '2026-10-12T06:00:00.000Z' }];
    const principal = { id: 'u_admin', role: 'admin' };
    const attempt = () => productionExecutionAccess({
      authorization: 'phase3g-run-1', principal, path: 'ingestTrends', action: 'run', authorizedRuns: entries, now,
    });
    const attempts = [attempt(), attempt(), attempt()];
    return {
      ok: attempts.every((entry) => entry.ok === true)
        && /not single-use/i.test(PRODUCTION_EXECUTION_LIMITATIONS.not_single_use)
        && PRODUCTION_EXECUTION_LIMITATIONS.replay_protection.length > 40
        && PRODUCTION_EXECUTION_LIMITATIONS.stale_entry_risk.length > 40
        && !/single-use|exactly once|replay-proof/i.test(JSON.stringify(PRODUCTION_EXECUTION_GATE)),
      note: {
        attempts_admitted_with_the_same_id: attempts.map((entry) => entry.ok),
        declared_limitation: PRODUCTION_EXECUTION_LIMITATIONS.not_single_use,
        what_limits_replay: PRODUCTION_EXECUTION_LIMITATIONS.replay_protection,
      },
    };
  });

  await record('execution_gate.routine_tests_cannot_arm_production_execution', async () => {
    const before = JSON.stringify(PRODUCTION_EXECUTION_GATE.authorized_runs);
    const attempt = productionExecutionAccess({
      authorization: 'phase3g-run-1',
      principal: { id: 'u_admin', role: 'admin' },
      path: 'ingestTrends',
      action: 'run',
      // A caller trying to supply the list itself is ignored: the scope and the entries come from
      // this app's source, never from a request.
      authorizedRuns: [{ id: 'phase3g-run-1', path: 'ingestTrends', action: 'run', expires_at: '2099-01-01T00:00:00.000Z' }],
    });
    const after = JSON.stringify(PRODUCTION_EXECUTION_GATE.authorized_runs);
    return {
      ok: before === '[]' && after === before
        && PRODUCTION_EXECUTION_GATE.authorization_source === 'source constant only'
        && /no request field, no entity, no environment variable/i.test(PRODUCTION_EXECUTION_GATE.authorization_source_note)
        && PRODUCTION_EXECUTION_GATE.require_explicit_authorization === true
        && attempt.requested_scope.path === 'ingestTrends' && attempt.requested_scope.action === 'run',
      note: {
        armed_before_the_suite: before,
        armed_after_the_suite: after,
        source: PRODUCTION_EXECUTION_GATE.authorization_source,
        note: 'a supplied authorizedRuns list is only reachable from in-process code and from this regression; the request path never passes one, so it cannot arm anything',
      },
    };
  });

  await record('execution_gate.the_ingestion_handler_refuses_a_routine_call', async () => {
    const admin = { id: 'u_admin', role: 'admin' };
    // The exact call that caused the incident: an empty body, issued as an authenticated
    // administrator by the platform's own validation harness.
    const incident = ingestTrendsAccess({ principal: admin, body: {} });
    const labelled = ingestTrendsAccess({ principal: admin, body: { trigger_source: 'schedule', execute: true } });
    const anonymous = ingestTrendsAccess({ principal: null, body: {} });
    const reader = ingestTrendsAccess({ principal: { id: 'u_reader', role: 'user' }, body: {} });
    const armedElsewhere = ingestTrendsAccess({ principal: admin, body: { execution_authorization: 'phase3g-recovery-run-1' } });
    return {
      ok: incident.ok === false && incident.status === 403 && incident.stage === 'production_execution'
        && incident.error_category === 'production_execution_not_authorized'
        && labelled.ok === false && labelled.stage === 'production_execution'
        && anonymous.ok === false && anonymous.status === 401 && anonymous.stage === 'identity'
        && reader.ok === false && reader.status === 403 && reader.stage === 'identity'
        && armedElsewhere.ok === false && armedElsewhere.stage === 'production_execution'
        && incident.gate.armed_entries.length === 0
        && incident.gate.single_use === false,
      note: {
        incident_call: { stage: incident.stage, status: incident.status, category: incident.error_category },
        labelled_call: { stage: labelled.stage, status: labelled.status },
        unauthenticated: { stage: anonymous.stage, status: anonymous.status },
        non_administrator: { stage: reader.stage, status: reader.status },
        id_not_on_the_list: { stage: armedElsewhere.stage, status: armedElsewhere.status },
      },
    };
  });

  await record('execution_gate.diagnostics_stay_reachable_without_an_authorization', async () => {
    const routineKeys = new Set(ROUTINE_REGRESSION_ACTIONS.map((entry) => `${entry.path}.${entry.action}`));
    const diagnosticActions = [
      'securityAudit.status', 'securityAudit.suite', 'securityAudit.fixture_inventory',
      'devAnalysis.suite', 'devAnalysis.calibration_suite', 'devAnalysis.source_quality',
      'devAnalysis.review', 'modelProof.contract', 'modelProof.review',
      'enrichSourceText.suite', 'enrichSourceText.dry_run', 'devFeed.read',
    ];
    const unlisted = diagnosticActions.filter((key) => !routineKeys.has(key));
    return {
      ok: unlisted.length === 0
        && PRODUCTION_EXECUTION_GATE.covered_paths.length === 2
        && PRODUCTION_EXECUTION_GATE.covered_paths.includes('ingestTrends')
        && PRODUCTION_EXECUTION_GATE.covered_paths.includes('enrichSourceText')
        && PRODUCTION_EXECUTION_GATE.covered_by_an_existing_source_constant.length === 2
        && PRODUCTION_EXECUTION_LIMITATIONS.suites_unaffected.length > 40
        && PRODUCTION_EXECUTION_LIMITATIONS.not_a_substitute_for_isolation.length > 40,
      note: {
        diagnostic_actions_declared: diagnosticActions.length, unlisted,
        covered_paths: PRODUCTION_EXECUTION_GATE.covered_paths,
      },
    };
  });

  const passed = cases.filter((entry) => entry.ok).length;
  return {
    suite: 'phase3f-security-hardening-suite',
    stage: DEV_ANALYSIS_CONFIG.stage,
    cases_run: cases.length,
    passed,
    failed: cases.length - passed,
    provider_calls: 0,
    model_calls: 0,
    production_writes: 0,
    cases,
  };
}