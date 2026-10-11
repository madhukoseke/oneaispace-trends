// Execution tracing for the Stage 1 proof, kept entirely separate from Trends
// content: runs and results live in their own two entities and are readable only
// by admins.
//
// This module contains no delete and no purge operation. The 30-day retention
// policy is recorded per run as metadata for a future, separately reviewed
// cleanup; nothing here removes a record.
//
// Only what actually happened is written: a measurement the provider did not
// return is stored as null with its availability flag false. No credentials, no
// request headers and no full source bodies are ever persisted - sources are
// referenced by record id with the minimum excerpt needed to justify a claim.
//
// The one-time authorization and the call budget are both consumed here, through
// guarded updates whose reported match count is the decision. Exactly one match is
// accepted; anything else fails closed, so nothing is dispatched on an ambiguous
// outcome.

import { PROOF_CONFIG } from './modelProofConfig.ts';

// Retention is a recorded policy, not an implemented behaviour.
export const RETENTION_NOTE = 'retention policy recorded as metadata only; no automatic deletion is implemented';

// The fields that identify a run to the review queries. None of them carries a
// schema default, so each one is present only because a write put it there: every
// creation and every update re-asserts them, so a run cannot lose them and drop
// out of the stage-filtered review list.
export const RUN_IDENTITY_FIELDS = {
  stage: PROOF_CONFIG.stage,
  trigger: 'manual',
  spend_ceiling_usd: PROOF_CONFIG.spend_ceiling_usd,
  retention_note: RETENTION_NOTE,
};

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/i,
  /api[-_]?key["'\s:=]+[A-Za-z0-9._-]{8,}/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

const ALLOWED_TOKEN_KEYS = /^(input|output|total)_?tokens?$/i;
const FORBIDDEN_KEYS = /^(api_?key|apikey|authorization|auth|bearer|secret|password|access_token|refresh_token)$/i;

// Walks a record and reports anything key-shaped. Used both as a positive control
// (a synthetic record must be caught) and as a real check over persisted records.
export function scanForSecrets(value, path = '$') {
  const findings = [];
  if (value === null || value === undefined) return findings;

  if (typeof value === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) findings.push(`secret-shaped value at ${path}`);
    }
    return findings;
  }
  if (typeof value !== 'object') return findings;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.test(key) && !ALLOWED_TOKEN_KEYS.test(key)) {
      findings.push(`forbidden field "${key}" at ${childPath}`);
      continue;
    }
    findings.push(...scanForSecrets(child, childPath));
  }
  return findings;
}

function cleanError(value) {
  let text = String((value && value.message) || value || 'unknown error');
  for (const pattern of SECRET_VALUE_PATTERNS) text = text.replace(new RegExp(pattern.source, 'g'), '[redacted]');
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function buildRunRecord(fields) {
  return {
    ...RUN_IDENTITY_FIELDS,
    retention_days: PROOF_CONFIG.retention_days,
    call_budget_per_provider: PROOF_CONFIG.max_calls_per_provider,
    call_budget_total: PROOF_CONFIG.max_calls_total,
    model_calls: 0,
    calls_per_provider: {},
    input_item_ids: [],
    input_record_count: 0,
    input_chars: 0,
    // Usage and cost keys are added only when a provider actually returned them,
    // so an unavailable measurement is absent rather than invented.
    usage_available: false,
    cost_known: false,
    resolved_model_available: false,
    ...fields,
  };
}

export async function findRunById(db, runId) {
  const page = await db.ModelProofRun.filter({ run_id: runId }, { limit: 1 });
  return (page.items || [])[0] || null;
}

// Every claim record carrying this one-time authorization id.
export async function findAnchors(db, authorizationId) {
  const page = await db.ModelProofRun.filter({ authorization_id: authorizationId }, { limit: 5, sort: '-created_date' });
  return page.items || [];
}

// Every run record is built through buildRunRecord whatever the caller passes, so
// no creation site can omit the run's identity fields. The claim path passes a bare
// seed, and creating that seed directly was how a completed run lost its stage,
// spend ceiling and retention note, which also hid it from the stage-filtered list.
export async function persistRun(db, record) {
  return db.ModelProofRun.create(buildRunRecord(record));
}

// The identity fields are re-asserted on every update, so an update can never be
// the reason a run drops out of the review list.
export async function updateRun(db, id, fields) {
  return db.ModelProofRun.update(id, { ...RUN_IDENTITY_FIELDS, ...fields });
}

// Result rows carry their run's stage, so both proof entities answer the same
// stage-based review query.
export async function persistResults(db, records) {
  if (!records.length) return [];
  return db.ModelProofResult.bulkCreate(records.map((row) => ({ stage: PROOF_CONFIG.stage, ...row })));
}

// Consumes the one-time authorization. Two steps, in this order:
//   1. a guarded update consumes the claim, and only a reported count of exactly
//      one is treated as winning. This is the decision point that makes the
//      authorization single-use, and it happens before any provider call.
//   2. the claim is read back and accepted only when exactly one claim record
//      exists for this authorization id and it carries this attempt's token. If
//      two first attempts created claim records simultaneously, both fail closed
//      here rather than one of them proceeding.
// A refused attempt leaves the record it may have created in place: nothing is
// deleted or overwritten, and the refusal is reported to the caller.
export async function claimAuthorization(db, { authorizationId, seed, token }) {
  const existing = await findAnchors(db, authorizationId);
  if (existing.length > 1) return { ok: false, reason: 'duplicate_anchors', anchors: existing.length };

  let anchor = existing[0] || null;
  if (!anchor) {
    const created = await persistRun(db, { ...seed, authorization_id: authorizationId });
    const after = await findAnchors(db, authorizationId);
    if (after.length !== 1) {
      // Two simultaneous first attempts each created a record. Both refuse, and
      // this attempt's own record is closed out so it cannot read as a run that is
      // still going. Nothing else is touched.
      await updateRun(db, created.id, {
        status: 'blocked', error_category: 'duplicate_anchors',
        error_summary: 'blocked: more than one claim record exists for this authorization id, so the attempt was refused before any provider call',
        finished_at: new Date().toISOString(),
      });
      return { ok: false, reason: 'duplicate_anchors', anchors: after.length, anchor: created };
    }
    anchor = after[0];
  }

  let updated = null;
  try {
    const result = await db.ModelProofRun.updateMany(
      { authorization_id: authorizationId, claim_state: 'open' },
      { $set: { claim_state: 'consumed', claim_token: token, claimed_at: new Date().toISOString() } },
    );
    updated = typeof result.updated === 'number' ? result.updated : null;
  } catch (error) {
    return { ok: false, reason: 'claim_failed', summary: cleanError(error), anchor };
  }

  if (updated !== 1) {
    return {
      ok: false,
      reason: updated === 0 ? 'already_consumed' : 'ambiguous_claim',
      updated,
      anchor,
    };
  }

  const verify = await findAnchors(db, authorizationId);
  if (verify.length !== 1 || verify[0].claim_token !== token) {
    return { ok: false, reason: 'claim_verification_failed', anchors: verify.length, anchor };
  }
  return { ok: true, anchor: verify[0], token, reason: 'claimed' };
}

// Consumes one call slot from the run's server-side budget. The slot starts as
// "free"; only a guarded update that reports exactly one changed record lets the
// call through, so a repeat attempt on the same slot is refused before dispatch.
export async function reserveCallSlot(db, anchorId, slot, holder) {
  const field = slot === 'a' ? 'call_slot_a' : slot === 'b' ? 'call_slot_b' : '';
  if (!field) {
    return { ok: false, updated: 0, slot, holder, summary: `slot "${slot}" is not one of the two configured call slots` };
  }
  const stamp = slot === 'a' ? 'slot_a_reserved_at' : 'slot_b_reserved_at';
  try {
    const result = await db.ModelProofRun.updateMany(
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

export async function listResults(db, runId) {
  const page = await db.ModelProofResult.filter({ run_id: runId }, { limit: 50, sort: '-created_date' });
  return page.items || [];
}

export async function listRuns(db, limit = 10) {
  const page = await db.ModelProofRun.filter({ stage: PROOF_CONFIG.stage }, { limit, sort: '-created_date' });
  return page.items || [];
}

// Deletion is deliberately absent from Stage 1. Nothing in this module removes a
// record, and there is no cleanup function, schedule or admin action: each run
// simply carries retention_days as metadata so a later stage can design retention
// with its own review.