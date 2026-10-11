// Phase 3A: controlled, administrator-only enrichment of title-only source records.
//
// Manual by construction: it runs only when an administrator names the records and asks for
// execution, it is capped, and it has no schedule behind it. The rules it obeys - provider-native
// text only, an empty excerpt only, one field written, no model anywhere - are stated in
// base44/shared/sourceEnrichment.ts, which this handler only wires up.
//
// Dry run is the default: without an explicit execute request this handler performs no write at
// all and returns exactly the plan an execute run would carry out.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  ENRICHMENT_CONFIG, ENRICHMENT_LIMITATIONS, decideEnrichment, lookupNativeText, planFingerprint,
  summarizeDecisions,
} from '../../shared/sourceEnrichment.ts';
import { CONTENT_STATES } from '../../shared/devAnalysisConfig.ts';
import { contentState } from '../../shared/devAnalysisGrouping.ts';
import { sanitizeMessage } from '../../shared/modelAdapters.ts';
import { clip } from '../../shared/normalize.ts';

async function inBatches(list, size, handler) {
  const settled = [];
  for (let index = 0; index < list.length; index += size) {
    const batch = list.slice(index, index + size);
    settled.push(...(await Promise.allSettled(batch.map(handler))));
  }
  return settled;
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

    const requested = Array.isArray(payload.item_ids) ? payload.item_ids.map((id) => clip(id, 80)).filter(Boolean) : [];
    const itemIds = Array.from(new Set(requested));
    const execute = payload.execute === true && payload.dry_run !== true;
    const cap = ENRICHMENT_CONFIG.max_records;

    // Every refusal below is answered before a record is read or a provider is contacted.
    if (!itemIds.length) {
      return Response.json({
        ok: false, error_category: 'no_records', model_calls: 0, provider_calls: 0, writes: 0,
        reason: 'name the source records to enrich with item_ids; this handler never walks the catalogue',
      }, { status: 400 });
    }
    if (itemIds.length > cap) {
      return Response.json({
        ok: false, error_category: 'record_cap', model_calls: 0, provider_calls: 0, writes: 0,
        reason: `${itemIds.length} records were requested, the cap is ${cap}`, cap,
      }, { status: 400 });
    }

    const page = await base44.entities.Item.filter({ id: { $in: itemIds } }, { limit: cap });
    const items = (page && page.items) || [];
    const missingIds = itemIds.filter((id) => !items.some((item) => item.id === id));

    if (!items.length) {
      return Response.json({
        ok: false, error_category: 'no_records', model_calls: 0, provider_calls: 0, writes: 0,
        reason: 'no stored source record matched the request', missing_ids: missingIds,
      }, { status: 404 });
    }

    // Only records that could actually change are looked up: a record that already holds an
    // excerpt, or holds no text at all, is decided without contacting any provider.
    const lookupable = items.filter((item) => contentState(item) === CONTENT_STATES.title_only);
    const settled = await inBatches(lookupable, ENRICHMENT_CONFIG.fetch_concurrency, (item) => lookupNativeText(item));
    const lookups = new Map();
    settled.forEach((result, index) => {
      const item = lookupable[index];
      if (!item) return;
      lookups.set(item.id, result.status === 'fulfilled' ? result.value : {
        ok: false, native_text: '', lookup: '', error_category: 'fetch_failed', error: sanitizeMessage(result.reason),
      });
    });

    const decisions = items.map((item) => decideEnrichment(item, lookups.get(item.id)));
    const proposed = decisions.filter((row) => row.action === 'apply');

    // The one write in this path, and only when execution was explicitly requested.
    const appliedRows = [];
    if (execute) {
      for (const row of proposed) {
        await base44.entities.Item.update(row.item_id, { excerpt: row.excerpt_after });
        appliedRows.push({
          item_id: row.item_id, field: 'excerpt',
          excerpt_chars_before: row.excerpt_before.length,
          excerpt_chars_after: row.excerpt_after_chars,
          excerpt_after: row.excerpt_after,
        });
      }
    }

    return Response.json({
      ok: true,
      action: execute ? 'enrich' : 'dry_run',
      stage: 'phase3a-source-enrichment',
      dry_run: !execute,
      read_only: !execute,
      operator: { operator_id: user.id, operator_role: user.role, manual_only: true },
      selection: {
        requested: itemIds.length, resolved_records: items.length, missing_ids: missingIds, cap,
        lookuped_records: lookupable.length,
        plan_fingerprint: planFingerprint(items),
      },
      summary: summarizeDecisions(decisions),
      // Proposed and applied are kept apart: a dry run lists what would be written and writes nothing.
      proposed_excerpts: proposed.map((row) => ({
        item_id: row.item_id, title: row.title, source: row.source, canonical_url: row.canonical_url,
        provider: row.provider, lookup: row.lookup, excerpt_after: row.excerpt_after,
      })),
      applied_excerpts: appliedRows,
      writes: {
        applied: appliedRows.length, field: 'excerpt', dry_run: !execute,
        records_touched: appliedRows.map((row) => row.item_id),
        note: execute
          ? 'only the excerpt field was written, and only on records that were title-only when they were read for this request'
          : 'dry run: no record was written',
      },
      records: decisions,
      limits: {
        max_records: cap, update_fields: ENRICHMENT_CONFIG.update_fields, dry_run_default: ENRICHMENT_CONFIG.dry_run_default,
        model_calls: 0, schedules: 0, new_integrations: 0,
        model_execution: 'not involved: this path makes no model call and does not read or change the analysis kill switch',
        untouched: ['Item.title', 'Item.canonical_url', 'Item.published_at', 'Item.source', 'DevAnalysisRun', 'DevDevelopment', 'DevClaim', 'DevAnalysisCache', 'IngestionRun', 'Trend', 'Topic'],
      },
      limitations: ENRICHMENT_LIMITATIONS,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json({ ok: false, error_category: 'enrichment_error', error: sanitizeMessage(error) }, { status: 500 });
  }
}