// Persistence lifecycle for Phase 2A development analysis, kept entirely separate from
// the Trends catalogue and from the Stage 1 proof: runs live in DevAnalysisRun,
// developments in DevDevelopment, claims in DevClaim, and idempotency keys in
// DevAnalysisCache. Nothing here reads or writes Item, Trend, Topic, IngestionRun, User,
// Save, ModelProofRun or ModelProofResult.
//
// This module contains no delete and no purge operation. The retention window is
// recorded per record as metadata for a future, separately reviewed cleanup.
//
// The one-time authorization and the call budget are both consumed here, through
// guarded updates whose reported match count is the decision. Exactly one match is
// accepted; anything else fails closed, so nothing is dispatched on an ambiguous
// outcome, and no call is ever made twice for one slot.
//
// A run's identity fields carry no schema default, so every creation and every update
// re-asserts them: a run cannot lose its stage, spend ceiling or retention note and drop
// out of the stage-filtered review list.

import { DEV_ANALYSIS_CONFIG } from './devAnalysisConfig.ts';

export const DEV_RETENTION_NOTE = 'retention recorded as metadata only; no automatic deletion is implemented';

export const DEV_RUN_IDENTITY_FIELDS = {
  stage: DEV_ANALYSIS_CONFIG.stage,
  trigger: DEV_ANALYSIS_CONFIG.trigger,
  spend_ceiling_usd: DEV_ANALYSIS_CONFIG.spend_ceiling_usd,
  retention_note: DEV_RETENTION_NOTE,
};

function cleanError(value) {
  let text = String((value && value.message) || value || 'unknown error');
  text = text.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 300);
}

// Every run record is built here, whatever the caller passes, so no creation site can
// omit the run's identity fields or its caps.
export function buildDevRunRecord(fields) {
  return {
    ...DEV_RUN_IDENTITY_FIELDS,
    retention_days: DEV_ANALYSIS_CONFIG.retention_days,
    batch_record_cap: DEV_ANALYSIS_CONFIG.max_records,
    call_budget_per_provider: DEV_ANALYSIS_CONFIG.max_calls_per_provider,
    call_budget_total: DEV_ANALYSIS_CONFIG.max_calls_total,
    model_calls: 0,
    provider_calls: 0,
    calls_per_provider: {},
    source_item_ids: [],
    processed_item_ids: [],
    cache_covered_item_ids: [],
    developments_accepted: 0,
    developments_rejected: 0,
    claims_accepted: 0,
    claims_rejected: 0,
    usage_available: false,
    cost_known: false,
    resolved_model_available: false,
    dry_run: false,
    ...fields,
  };
}

export async function persistRun(db, record) {
  return db.DevAnalysisRun.create(buildDevRunRecord(record));
}

export async function updateRun(db, id, fields) {
  return db.DevAnalysisRun.update(id, { ...DEV_RUN_IDENTITY_FIELDS, ...fields });
}

export async function findRunById(db, runId) {
  const page = await db.DevAnalysisRun.filter({ run_id: runId }, { limit: 1 });
  return (page.items || [])[0] || null;
}

export async function listRuns(db, limit = 10) {
  const page = await db.DevAnalysisRun.filter({ stage: DEV_ANALYSIS_CONFIG.stage }, { limit, sort: '-created_date' });
  return page.items || [];
}

export async function listRunsByAuthorization(db, authorizationId) {
  const page = await db.DevAnalysisRun.filter({ authorization_id: authorizationId }, { limit: 5, sort: '-created_date' });
  return page.items || [];
}

export async function persistDevelopments(db, rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return db.DevDevelopment.bulkCreate(rows.map((row) => ({ stage: DEV_ANALYSIS_CONFIG.stage, ...row })));
}

export async function persistClaims(db, rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return db.DevClaim.bulkCreate(rows.map((row) => ({ stage: DEV_ANALYSIS_CONFIG.stage, ...row })));
}

export async function listDevelopments(db, runId) {
  const page = await db.DevDevelopment.filter({ run_id: runId }, { limit: 50, sort: '-created_date' });
  return page.items || [];
}

export async function listClaims(db, runId) {
  const page = await db.DevClaim.filter({ run_id: runId }, { limit: 100, sort: '-created_date' });
  return page.items || [];
}

// Idempotency: the analysis record for a set of source fingerprints. Coverage is
// per record, so a later batch that includes an unchanged record does not send it to a
// model again.
export async function readCacheEntries(db, limit = 200) {
  const page = await db.DevAnalysisCache.filter({ stage: DEV_ANALYSIS_CONFIG.stage }, { limit, sort: '-created_date' });
  return page.items || [];
}

export async function findCacheByFingerprint(db, fingerprint) {
  const page = await db.DevAnalysisCache.filter({ fingerprint }, { limit: 1 });
  return (page.items || [])[0] || null;
}

export async function persistCacheEntry(db, entry) {
  return db.DevAnalysisCache.create({
    stage: DEV_ANALYSIS_CONFIG.stage,
    fingerprint: entry.fingerprint,
    item_fingerprints: entry.item_fingerprints || [],
    source_item_ids: entry.source_item_ids || [],
    run_id: entry.run_id,
    development_ids: entry.development_ids || [],
    development_count: (entry.development_ids || []).length,
    claims_accepted: entry.claims_accepted || 0,
    model_calls: entry.model_calls || 0,
    cost_estimate_usd: typeof entry.cost_estimate_usd === 'number' ? entry.cost_estimate_usd : null,
    cached_at: new Date().toISOString(),
    retention_days: DEV_ANALYSIS_CONFIG.retention_days,
  });
}

// Consumes the one-time authorization. A guarded update consumes the claim and only a
// reported count of exactly one wins; the claim is then read back and accepted only when
// exactly one claim record exists for this authorization id and it carries this
// attempt's token. A refused attempt leaves whatever record it created in place: nothing
// is deleted or overwritten, and the refusal is reported to the caller.
export async function consumeAuthorization(db, { authorizationId, seed, token }) {
  const existing = await listRunsByAuthorization(db, authorizationId);
  if (existing.length > 1) return { ok: false, reason: 'duplicate_anchors', anchors: existing.length };

  let anchor = existing[0] || null;
  if (!anchor) {
    const created = await persistRun(db, { ...seed, authorization_id: authorizationId });
    const after = await listRunsByAuthorization(db, authorizationId);
    if (after.length !== 1) {
      await updateRun(db, created.id, {
        status: 'blocked',
        error_category: 'duplicate_anchors',
        error_summary: 'blocked: more than one claim record exists for this authorization id, so the attempt was refused before any model call',
        finished_at: new Date().toISOString(),
      });
      return { ok: false, reason: 'duplicate_anchors', anchors: after.length, anchor: created };
    }
    anchor = after[0];
  }

  let updated = null;
  try {
    const result = await db.DevAnalysisRun.updateMany(
      { authorization_id: authorizationId, claim_state: 'open' },
      { $set: { claim_state: 'consumed', claim_token: token, claimed_at: new Date().toISOString() } },
    );
    updated = typeof result.updated === 'number' ? result.updated : null;
  } catch (error) {
    return { ok: false, reason: 'claim_failed', summary: cleanError(error), anchor };
  }

  if (updated !== 1) {
    return { ok: false, reason: updated === 0 ? 'already_consumed' : 'ambiguous_claim', updated, anchor };
  }

  const verify = await listRunsByAuthorization(db, authorizationId);
  if (verify.length !== 1 || verify[0].claim_token !== token) {
    return { ok: false, reason: 'claim_verification_failed', anchors: verify.length, anchor };
  }
  return { ok: true, anchor: verify[0], token, reason: 'claimed' };
}

// Consumes one call slot from the run's server-side budget. The slot starts as "free";
// only a guarded update that reports exactly one changed record lets the call through.
export async function reserveCallSlot(db, anchorId, slot, holder) {
  const field = slot === 'a' ? 'call_slot_a' : slot === 'b' ? 'call_slot_b' : '';
  if (!field) {
    return { ok: false, updated: 0, slot, holder, summary: `slot "${slot}" is not one of the two configured call slots` };
  }
  const stamp = slot === 'a' ? 'slot_a_reserved_at' : 'slot_b_reserved_at';
  try {
    const result = await db.DevAnalysisRun.updateMany(
      { id: anchorId, [field]: 'free' },
      { $set: { [field]: holder, [stamp]: new Date().toISOString() } },
    );
    const updated = typeof result.updated === 'number' ? result.updated : null;
    return {
      ok: updated === 1,
      updated,
      slot,
      holder,
      summary: updated === 1 ? '' : `the server-side budget for slot "${slot}" was already consumed`,
    };
  } catch (error) {
    return { ok: false, updated: null, slot, holder, summary: cleanError(error) };
  }
}

// Deletion is deliberately absent. Nothing in this module removes a record, and there is
// no cleanup function, schedule or admin action.