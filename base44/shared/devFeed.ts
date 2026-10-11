// The public, read-only developments feed.
//
// This module reads stored analysis rows and projects a whitelist. It calls no model, writes
// no record and schedules nothing. A development reaches the feed only when its parent run
// proves the row came from an explicitly authorized, successfully completed live analysis
// batch, and every check fails closed: a record with missing or ambiguous provenance is
// excluded and counted, never shown.
//
// The parent run is consulted here rather than an "origin" label on the development itself,
// because such a label would prove nothing: it is written by whoever wrote the development.
// The run record, its consumed one-time authorization and its armed kill-switch state are the
// evidence that the batch was real.
//
// The feed returns a projection, not an export: internal run fields, authorization tokens,
// prompts, provider usage, cost estimates, error text and raw analysis rows never leave it.

import { DEV_ANALYSIS_CONFIG } from './devAnalysisConfig.ts';
import { clip } from './pipelineSupport.ts';

export const FEED_LIMIT_DEFAULT = 6;
export const FEED_LIMIT_MAX = 12;
export const FEED_READ_LIMIT = 200;
export const FEED_ORDERING = 'primary_published_at descending, then development_id ascending';

export const FEED_PROVENANCE_REASONS = {
  development_not_accepted: 'the development is not stored with an accepted status',
  missing_development_id: 'the development carries no development id',
  duplicate_development_id: 'another record already carries this development id, so the provenance of this one is ambiguous',
  parent_run_missing: 'no parent analysis run is stored for this development, so its provenance cannot be established',
  parent_run_is_suite_fixture: 'the parent run is a mocked-provider suite run: it analysed nothing live and is never shown',
  parent_run_not_an_authorized_batch: 'the parent run is not an authorized analyze batch',
  parent_run_was_a_dry_run: 'the parent run was a dry run, which produces a plan and no analysis',
  parent_run_not_successful: 'the parent run did not complete successfully, so its output is not published',
  parent_run_flagged_not_executed: 'the parent run does not carry the execute flag, so it was not an authorized execution',
  parent_run_not_armed: 'the parent run was not made while the execution kill switch was armed',
  authorization_not_consumed: 'the parent run consumed no one-time authorization',
  authorization_token_missing: 'the parent run carries no authorization token, so the batch cannot be shown to have been authorized',
  authorization_id_missing: 'the parent run carries no authorization id',
  operator_not_administrator: 'the parent run was not requested by an administrator',
  stage_mismatch: 'the parent run belongs to a different stage',
  source_fingerprint_mismatch: 'the development does not match the source fingerprint of its parent run, so it cannot be attributed to that batch',
  missing_source_url: 'the development stores no canonical source url',
  missing_publication_timestamp: 'the development stores no publication timestamp',
  missing_evidence_quote: 'no evidence quote verified against the stored record is stored for this development',
  evidence_source_not_in_development: 'the evidence quote belongs to a source the development does not list',
};

export const FEED_SUPPORT_LABELS = {
  evidence_supported_by_model: 'An evaluation model judged the quoted evidence to support this claim. That is a model assessment of the stored excerpt, not verification.',
  partial_support_by_model: 'An evaluation model judged the quoted evidence to support part of this claim only.',
  mixed_support_by_model: 'An evaluation model judged the quoted evidence to support some claims and contradict others.',
  contradicted_by_evaluator: 'An evaluation model judged the quoted evidence to conflict with this claim.',
  source_states_claim_only: 'The stored record states this. No model assessment of the evidence is recorded for it.',
};

export const FEED_DISCLOSURE =
  'Assembled from sources already stored in this app. Support is a model assessment of a quote taken verbatim from the stored record, never independent verification: nothing here has been checked against the world.';

export const FEED_KIND_LABELS = {
  model_release: 'Model release',
  model_version: 'Model version',
  product_release: 'Product release',
  research: 'Research',
  capability: 'Capability',
  project_announcement: 'Project announcement',
  unspecified: 'Development',
};

// The stored event type, where a development carries one. It is a finer classification than
// the kind, and the surfaces prefer it; the kind label remains the fallback.
export const FEED_EVENT_TYPE_LABELS = {
  model_release: 'Model release',
  research_contribution: 'Research contribution',
  software_release: 'Software release',
  product_announcement: 'Product announcement',
  adoption_case_study: 'Adoption case study',
  analysis_commentary: 'Analysis commentary',
  other: 'Other',
};

// The two ways a detail lookup can fail before provenance is even consulted. Everything else
// is answered with the same reason the list would use.
export const FEED_DETAIL_REASONS = {
  missing_development_id: 'no development identifier was supplied',
  development_not_found: 'no accepted development is stored under this identifier',
};

// The limit is bounded on the server, whatever the caller asks for.
export function clampLimit(value) {
  const raw = Number(value);
  const bounded = Number.isFinite(raw) ? Math.floor(raw) : FEED_LIMIT_DEFAULT;
  if (bounded < 1) return 1;
  return Math.min(bounded, FEED_LIMIT_MAX);
}

// Every condition must hold, and the first one that does not is the reason the development is
// excluded. Anything unproven - a missing token, an unarmed batch, a run that is not an
// authorized analyze action - fails closed.
export function validateProvenance(development, run) {
  const fail = (reasonCode) => ({ ok: false, reason_code: reasonCode, reason: FEED_PROVENANCE_REASONS[reasonCode] });

  if (!development || development.status !== 'accepted') return fail('development_not_accepted');
  if (!run) return fail('parent_run_missing');
  if (run.action === 'suite') return fail('parent_run_is_suite_fixture');
  if (run.stage !== DEV_ANALYSIS_CONFIG.stage) return fail('stage_mismatch');
  // A dry run is reported as exactly that, ahead of the coarser action check, so a plan-only run
  // is never described as something else in the exclusion report.
  if (run.dry_run === true) return fail('parent_run_was_a_dry_run');
  if (run.action !== 'analyze') return fail('parent_run_not_an_authorized_batch');
  if (run.status !== 'success') return fail('parent_run_not_successful');
  if (run.execution_flag !== true) return fail('parent_run_flagged_not_executed');
  if (run.kill_switch_state !== 'on') return fail('parent_run_not_armed');
  if (run.claim_state !== 'consumed') return fail('authorization_not_consumed');
  if (typeof run.claim_token !== 'string' || run.claim_token.trim().length < 8) return fail('authorization_token_missing');
  if (typeof run.authorization_id !== 'string' || run.authorization_id.trim().length < 8) return fail('authorization_id_missing');
  if (run.operator_role !== 'admin') return fail('operator_not_administrator');
  if (!development.source_fingerprint || !run.source_fingerprint
    || development.source_fingerprint !== run.source_fingerprint) return fail('source_fingerprint_mismatch');
  if (!Array.isArray(development.source_urls) || !development.source_urls.length) return fail('missing_source_url');
  if (!development.primary_published_at) return fail('missing_publication_timestamp');

  return { ok: true, reason_code: '', reason: '' };
}

// The stored record's own claim, with the quote that was checked against it. Only a claim
// whose quote was found verbatim in the stored record is used, and it must belong to a source
// the development itself lists.
export function selectEvidenceClaim(development, claims) {
  const claimIds = Array.isArray(development.claim_ids) ? development.claim_ids : [];
  const sourceUrls = Array.isArray(development.source_urls) ? development.source_urls : [];
  const verified = (claims || []).filter((claim) => claim
    && claimIds.includes(claim.claim_id)
    && claim.quote_in_record === true
    && String(claim.evidence_quote || '').trim().length >= DEV_ANALYSIS_CONFIG.min_evidence_quote_chars
    && Boolean(claim.canonical_url)
    && Boolean(claim.published_at)
    && sourceUrls.includes(claim.canonical_url));

  if (!verified.length) return null;
  return verified
    .slice()
    .sort((left, right) => String(left.published_at).localeCompare(String(right.published_at))
      || String(left.claim_id).localeCompare(String(right.claim_id)))[0];
}

// The whitelist. Nothing else is projected, so no run field, token, prompt, usage figure,
// cost estimate or error text can reach a caller of the feed.
export function projectDevelopment({ development, claims }) {
  const fail = (reasonCode) => ({ ok: false, reason_code: reasonCode, reason: FEED_PROVENANCE_REASONS[reasonCode] });

  const claim = selectEvidenceClaim(development, claims);
  if (!claim) {
    const hasVerified = (claims || []).some((row) => row && row.quote_in_record === true);
    return fail(hasVerified ? 'evidence_source_not_in_development' : 'missing_evidence_quote');
  }

  const kind = String(development.kind || 'unspecified');
  const eventType = String(development.event_type || '');
  const supportState = String(development.support_state || 'source_states_claim_only');

  return {
    ok: true,
    item: {
      development_id: development.development_id,
      title: clip(development.title, 160),
      kind,
      kind_label: FEED_KIND_LABELS[kind] || FEED_KIND_LABELS.unspecified,
      kind_basis: clip(development.kind_basis, 240),
      event_type: eventType,
      event_type_label: FEED_EVENT_TYPE_LABELS[eventType] || '',
      summary: clip(development.summary, 400),
      why_it_matters: clip(development.why_it_matters, 300),
      published_at: development.primary_published_at,
      source: {
        name: clip(claim.source, 80),
        url: claim.canonical_url,
      },
      evidence: {
        quote: clip(claim.evidence_quote, 240),
        quote_in_record: true,
        source_name: clip(claim.source, 80),
        source_url: claim.canonical_url,
        published_at: claim.published_at,
      },
      support: {
        state: supportState,
        label: FEED_SUPPORT_LABELS[supportState] || FEED_SUPPORT_LABELS.source_states_claim_only,
        source_states_claim: development.source_states_claim === true,
        evidence_supported_by_model: development.evidence_supported_by_model === true,
      },
      independent_verification: 'not_performed',
      disclosure: FEED_DISCLOSURE,
      supporting_source_count: (Array.isArray(development.supporting_item_ids) ? development.supporting_item_ids.length : 0),
    },
  };
}

// Deterministic: the same stored rows always produce the same feed, in the same order, and a
// development appears at most once. The requested limit is bounded here, not by the caller.
export function resolveFeed({ developments, runsById = {}, claimsByRun = {}, limit } = {}) {
  const bounded = clampLimit(limit);
  const ordered = (developments || [])
    .filter((development) => development && typeof development === 'object')
    .slice()
    .sort((left, right) => {
      const leftTime = String(left.primary_published_at || '');
      const rightTime = String(right.primary_published_at || '');
      if (leftTime !== rightTime) return rightTime.localeCompare(leftTime);
      return String(left.development_id || '').localeCompare(String(right.development_id || ''));
    });

  const items = [];
  const excluded = [];
  const seen = new Set();
  let scanned = 0;

  for (const development of ordered) {
    if (items.length >= bounded) break;
    scanned += 1;

    const developmentId = String(development.development_id || '');
    if (!developmentId) {
      excluded.push({ development_id: null, reason_code: 'missing_development_id', reason: FEED_PROVENANCE_REASONS.missing_development_id });
      continue;
    }
    if (seen.has(developmentId)) {
      excluded.push({ development_id: developmentId, reason_code: 'duplicate_development_id', reason: FEED_PROVENANCE_REASONS.duplicate_development_id });
      continue;
    }
    seen.add(developmentId);

    const run = (runsById || {})[development.run_id] || null;
    const provenance = validateProvenance(development, run);
    if (!provenance.ok) {
      excluded.push({ development_id: developmentId, reason_code: provenance.reason_code, reason: provenance.reason });
      continue;
    }

    const projected = projectDevelopment({ development, claims: (claimsByRun || {})[development.run_id] || [] });
    if (!projected.ok) {
      excluded.push({ development_id: developmentId, reason_code: projected.reason_code, reason: projected.reason });
      continue;
    }
    items.push(projected.item);
  }

  return {
    limit: bounded,
    ordering: FEED_ORDERING,
    items,
    excluded,
    counts: { candidates: ordered.length, scanned, shown: items.length, excluded: excluded.length },
  };
}

// The detail lookup. Exactly one development is resolved, through the same provenance and
// evidence checks the list applies above. An identifier that is unknown, ambiguous or
// ineligible is answered as unavailable: the caller is never given a partially proven
// development, and never a reason to fall back to an administrator-only analysis entity.
export function resolveDevelopment({ developments, runsById = {}, claimsByRun = {}, developmentId } = {}) {
  const fail = (reasonCode, reason) => ({ ok: false, reason_code: reasonCode, reason });

  const id = String(developmentId || '').trim();
  if (!id) return fail('missing_development_id', FEED_DETAIL_REASONS.missing_development_id);

  const matches = (developments || []).filter((row) => row && String(row.development_id || '') === id);
  if (!matches.length) return fail('development_not_found', FEED_DETAIL_REASONS.development_not_found);
  if (matches.length > 1) return fail('duplicate_development_id', FEED_PROVENANCE_REASONS.duplicate_development_id);

  const development = matches[0];
  const provenance = validateProvenance(development, (runsById || {})[development.run_id] || null);
  if (!provenance.ok) return fail(provenance.reason_code, provenance.reason);

  const projected = projectDevelopment({ development, claims: (claimsByRun || {})[development.run_id] || [] });
  if (!projected.ok) return fail(projected.reason_code, projected.reason);

  return { ok: true, item: projected.item };
}

// Reads only: the three filters below are the whole database footprint of the feed. No write,
// no dispatch and no schedule exists in this path.
export async function loadFeedInputs(db, { limit = FEED_LIMIT_DEFAULT, developmentId = '' } = {}) {
  const bounded = clampLimit(limit);
  // A detail lookup reads only the record it was asked for; the list reads the newest page.
  const id = String(developmentId || '').trim();
  const page = id
    ? await db.DevDevelopment.filter({ status: 'accepted', development_id: id }, { limit: 2 })
    : await db.DevDevelopment.filter(
      { status: 'accepted' },
      { limit: FEED_READ_LIMIT, sort: '-primary_published_at' },
    );
  const developments = page.items || [];
  const runIds = Array.from(new Set(developments.map((row) => row.run_id).filter(Boolean)));

  const runsById = {};
  const claimsByRun = {};
  if (runIds.length) {
    const runs = await db.DevAnalysisRun.filter({ run_id: { $in: runIds } }, { limit: runIds.length });
    for (const run of runs.items || []) runsById[run.run_id] = run;

    const claims = await db.DevClaim.filter({ run_id: { $in: runIds } }, { limit: 200, sort: 'published_at' });
    for (const claim of claims.items || []) {
      if (!claim || !claim.run_id) continue;
      if (!claimsByRun[claim.run_id]) claimsByRun[claim.run_id] = [];
      claimsByRun[claim.run_id].push(claim);
    }
  }

  return { developments, runsById, claimsByRun, limit: bounded };
}