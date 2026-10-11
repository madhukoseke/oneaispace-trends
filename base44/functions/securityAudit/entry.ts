// Phase 3F: the security and operational hardening endpoint.
//
// Administrator-only, and read-only in every action:
//
//   status            the hardening posture: how ingestion is authorized now, which paths
//                     can write an Item, why the schedule is paused, how tests are isolated,
//                     and why the excerpt recovery stays blocked.
//   suite             the Phase 3F regression suite. It runs entirely against an in-memory
//                     store with a tripwire in place of the platform SDK, so it consumes no
//                     authorization, creates no record, calls no model and writes nothing.
//   fixture_inventory the read-only cleanup dry run: which stored suite fixtures a cleanup
//                     would remove, which records are protected, and the counts. It reads
//                     only, and it deletes nothing.
//
// There is no delete, deleteMany or purge call in this function or in the modules it imports.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { INGESTION_AUTH_DESIGN, INGESTION_LIMITATIONS, ITEM_WRITE_PATHS } from '../../shared/ingestionAuth.ts';
import { ISOLATION_LIMITATIONS } from '../../shared/testIsolation.ts';
import { CLEANUP_CRITERIA, loadFixtureInventory } from '../../shared/fixtureInventory.ts';
import { RECOVERY_GATE, RECOVERY_LIMITATIONS } from '../../shared/recoveryGate.ts';
import { runPhase3fSuite } from '../../shared/phase3fSuite.ts';
import { sanitizeMessage } from '../../shared/modelAdapters.ts';
import { clip } from '../../shared/pipelineSupport.ts';

const ZERO = { model_calls: 0, provider_calls: 0, writes: 0, production_writes: 0 };

export default async function (req) {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized', ...ZERO }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Forbidden', ...ZERO }, { status: 403 });
    }

    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }
    const action = String(payload.action || 'status');
    const operator = { operator_id: user.id, operator_role: user.role };

    if (action === 'suite') {
      const runId = clip(payload.run_id, 80) || `phase3f-suite_${new Date(startedAt).toISOString()}`;
      const suite = await runPhase3fSuite({ runId });
      return Response.json({
        ok: suite.failed === 0,
        action,
        stage: 'phase3f-security-hardening',
        run_id: runId,
        operator,
        suite: suite.suite,
        summary: { cases_run: suite.cases_run, passed: suite.passed, failed: suite.failed },
        // Names only here: every case's own detail is in `tests` below, so a failing run stays
        // readable instead of being truncated by its own diagnostics.
        failing: suite.cases.filter((entry) => !entry.ok).map((entry) => entry.name),
        tests: suite,
        isolation: ISOLATION_LIMITATIONS,
        ingestion_authorization: {
          accepted_proofs: INGESTION_AUTH_DESIGN.accepted_proofs,
          rejected_proofs: INGESTION_AUTH_DESIGN.rejected_proofs,
          scheduler_identity_documented: INGESTION_AUTH_DESIGN.scheduler_identity_documented,
          schedule_state: INGESTION_AUTH_DESIGN.schedule_state,
          fallback: INGESTION_AUTH_DESIGN.fallback,
        },
        recovery_gate: { status: RECOVERY_GATE.status, documented_atomic_update: RECOVERY_GATE.documented_atomic_update },
        ...ZERO,
        note: 'no authorization is consumed, no record is created, no model is called and no production entity is read or written by this suite',
        duration_ms: Date.now() - startedAt,
      });
    }

    if (action === 'fixture_inventory') {
      const inventory = await loadFixtureInventory(base44.entities);
      const candidates = inventory.classification.candidates;
      return Response.json({
        ok: true,
        action,
        stage: 'phase3f-fixture-cleanup-inventory',
        operator,
        read_only: true,
        delete_performed: false,
        criteria: CLEANUP_CRITERIA,
        scan: inventory.scan,
        live_run: inventory.classification.live_run,
        totals: inventory.classification.totals,
        candidate_counts: {
          DevAnalysisRun: candidates.DevAnalysisRun.count,
          DevDevelopment: candidates.DevDevelopment.count,
          DevClaim: candidates.DevClaim.count,
          DevAnalysisCache: candidates.DevAnalysisCache.count,
          total: candidates.DevAnalysisRun.count + candidates.DevDevelopment.count
            + candidates.DevClaim.count + candidates.DevAnalysisCache.count,
        },
        candidates,
        protected_counts: inventory.classification.protected,
        suite_run_ids: inventory.classification.suite_run_ids,
        note: inventory.classification.note,
        ...ZERO,
        duration_ms: Date.now() - startedAt,
      });
    }

    if (action !== 'status') {
      return Response.json({
        ok: false, error: 'unknown action; expected status, suite or fixture_inventory', ...ZERO,
      }, { status: 400 });
    }

    return Response.json({
      ok: true,
      action,
      stage: 'phase3f-security-hardening',
      operator,
      read_only: true,
      execution_enabled: false,
      ingestion_authorization: INGESTION_AUTH_DESIGN,
      ingestion_limitations: INGESTION_LIMITATIONS,
      item_write_paths: ITEM_WRITE_PATHS,
      test_isolation: ISOLATION_LIMITATIONS,
      fixture_cleanup: CLEANUP_CRITERIA,
      recovery_gate: RECOVERY_GATE,
      recovery_limitations: RECOVERY_LIMITATIONS,
      ...ZERO,
      note: 'posture only: this action reads no record, contacts no source and changes nothing',
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json({
      ok: false, error_category: 'security_audit_error', error: sanitizeMessage(error), ...ZERO,
    }, { status: 500 });
  }
}