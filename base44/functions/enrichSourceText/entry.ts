// Phase 3A: controlled, administrator-only enrichment of title-only source records.
//
// Manual by construction: it runs only when an administrator names the records and asks for it,
// it is capped at ENRICHMENT_CONFIG.max_records, and it has no schedule behind it. Every rule it
// obeys - provider-native text only, an empty excerpt only, one field written under a
// compare-and-set guard, no model anywhere - is stated in base44/shared/sourceEnrichment.ts,
// which this handler only wires up.
//
// Actions:
//   dry_run (default) - the plan an execute run would carry out, with zero writes and zero
//                       provider lookups beyond reading the provider's own published text.
//   enrich            - the same plan, then the guarded write. Requires execute: true.
//   suite             - the mocked test suite: scripted lookups and an in-memory database, so no
//                       provider is contacted, no record is read or written and no model is called.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  ENRICHMENT_CONFIG, ENRICHMENT_LIMITATIONS, ENRICHMENT_NETWORK_POLICY, enrichmentAccess,
  lookupNativeText, runEnrichment,
} from '../../shared/sourceEnrichment.ts';
import { runEnrichmentSuite } from '../../shared/sourceEnrichmentSuite.ts';
import { sanitizeMessage } from '../../shared/modelAdapters.ts';

export default async function (req) {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const access = enrichmentAccess(user);
    if (!access.ok) {
      return Response.json({ ok: false, error: access.error, model_calls: 0, provider_calls: 0, writes: 0 }, { status: access.status });
    }

    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }

    const requestedAction = String(payload.action || '');
    const wantsExecute = payload.execute === true || requestedAction === 'enrich';
    const execute = wantsExecute && payload.dry_run !== true;
    const action = requestedAction || (execute ? 'enrich' : 'dry_run');

    // --- mocked suite: no provider call, no network request, no database write.
    if (action === 'suite') {
      const suite = await runEnrichmentSuite();
      return Response.json({
        ok: suite.failed === 0,
        action,
        stage: 'phase3a-source-enrichment',
        suite: suite.suite,
        summary: { cases_run: suite.cases_run, passed: suite.passed, failed: suite.failed },
        failing: suite.cases.filter((entry) => !entry.ok).map((entry) => ({ name: entry.name, detail: entry.detail })),
        tests: suite,
        live_path_provider_calls: 0,
        live_path_database_writes: 0,
        model_calls: 0,
        operator: access.operator,
        note: 'every case runs against scripted lookups and an in-memory database: no provider is contacted, no stored record, analysis row, development, claim, cache entry or ingestion run is read or written, and no model is called',
        duration_ms: Date.now() - startedAt,
      });
    }

    if (action !== 'dry_run' && action !== 'enrich') {
      return Response.json({
        ok: false, error_category: 'unknown_action', model_calls: 0, provider_calls: 0, writes: 0,
        error: 'unknown action; expected dry_run, enrich or suite',
      }, { status: 400 });
    }

    const result = await runEnrichment({
      db: base44.entities,
      itemIds: payload.item_ids,
      execute,
      lookup: lookupNativeText,
    });

    if (!result.ok) {
      return Response.json({ ...result, operator: access.operator, selection_requested: Array.isArray(payload.item_ids) ? payload.item_ids.length : 0 }, { status: result.status || 400 });
    }

    return Response.json({
      ok: true,
      action,
      stage: 'phase3a-source-enrichment',
      dry_run: !execute,
      read_only: !execute,
      operator: access.operator,
      selection: result.selection,
      summary: result.summary,
      // Proposed and applied are kept apart: a dry run lists what would be written and writes nothing.
      proposed_excerpts: result.proposed_excerpts,
      applied_excerpts: result.write_outcomes
        .filter((row) => row.applied)
        .map((row) => {
          const proposal = result.proposed_excerpts.find((entry) => entry.item_id === row.item_id) || {};
          return {
            item_id: row.item_id, field: 'excerpt',
            excerpt_after: proposal.excerpt_after || null,
            excerpt_chars_after: proposal.excerpt_after ? proposal.excerpt_after.length : null,
          };
        }),
      concurrent_update_conflicts: result.concurrent_update_conflicts,
      writes: {
        applied: result.writes,
        attempted: result.write_outcomes.length,
        field: 'excerpt',
        guard: 'a conditional update whose filter carries the exact excerpt this request read; only a reported changed count of exactly one is accepted, and anything else fails closed',
        dry_run: !execute,
        records_touched: result.applied_item_ids,
        note: execute
          ? 'only the excerpt field was written, and only on records that were still title-only when this request read them'
          : 'dry run: no record was written',
      },
      records: result.decisions,
      limits: {
        max_records: result.cap,
        update_fields: ENRICHMENT_CONFIG.update_fields,
        dry_run_default: ENRICHMENT_CONFIG.dry_run_default,
        fetch_timeout_ms: ENRICHMENT_CONFIG.fetch_timeout_ms,
        model_calls: 0,
        schedules: 0,
        new_integrations: 0,
        model_execution: 'not involved: this path makes no model call and does not read or change the analysis kill switch',
        untouched: ['Item.title', 'Item.canonical_url', 'Item.published_at', 'Item.source', 'Item.metrics', 'Trend', 'Topic', 'IngestionRun', 'DevAnalysisRun', 'DevDevelopment', 'DevClaim', 'DevAnalysisCache'],
      },
      network_policy: ENRICHMENT_NETWORK_POLICY,
      limitations: ENRICHMENT_LIMITATIONS,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json({
      ok: false, error_category: 'enrichment_error', error: sanitizeMessage(error),
      model_calls: 0, provider_calls: 0, writes: 0,
    }, { status: 500 });
  }
}