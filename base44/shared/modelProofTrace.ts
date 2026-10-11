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

import { PROOF_CONFIG } from './modelProofConfig.ts';

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

export function buildRunRecord(fields) {
  return {
    stage: PROOF_CONFIG.stage,
    trigger: 'manual',
    retention_days: PROOF_CONFIG.retention_days,
    spend_ceiling_usd: PROOF_CONFIG.spend_ceiling_usd,
    model_calls: 0,
    calls_per_provider: {},
    input_item_ids: [],
    input_record_count: 0,
    input_chars: 0,
    // Usage and cost keys are added only when a provider actually returned them,
    // so an unavailable measurement is absent rather than invented.
    usage_available: false,
    cost_known: false,
    // Retention is a recorded policy, not an implemented behaviour.
    retention_note: 'retention policy recorded as metadata only; no automatic deletion is implemented',
    ...fields,
  };
}

export async function findRunById(db, runId) {
  const page = await db.ModelProofRun.filter({ run_id: runId }, { limit: 1 });
  return (page.items || [])[0] || null;
}

export async function persistRun(db, record) {
  return db.ModelProofRun.create(record);
}

export async function persistResults(db, records) {
  if (!records.length) return [];
  return db.ModelProofResult.bulkCreate(records);
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