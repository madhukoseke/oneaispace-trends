// Phase 2A validation, evidence and cost logic.
//
// These are pure functions of what an attempt actually produced, so they live outside
// the function body: the mocked-provider suite calls them directly and the live path
// calls exactly the same code, which is why a passing test can never describe logic
// the live batch does not use.
//
// Four separate ideas are kept apart here, and only the first is a code check:
//   1. the source states the claim  - the evidence quote is present, verbatim, in the
//      stored record (checked here, in code)
//   2. the model assesses support   - the evaluation model's own opinion about whether
//      that quote supports the claim
//   3. independent factual verification - not performed by this pipeline at all
//   4. what is actually stored      - supporting item ids, canonical urls and
//      publication timestamps taken from the stored records, never from the model
//
// Citations are allowlisted to the supplied records: a model-reported url or
// timestamp is recorded only as an audit of the citation it attempted, never used as a
// source. Cost is only ever an estimate, per provider, from that provider's own price
// estimate and that call's returned usage.

import { CONTENT_STATES, DEV_ANALYSIS_CONFIG, DEVELOPMENT_KINDS, RELEASE_VERBS } from './devAnalysisConfig.ts';
import { normalizeForMatch, quoteMatchInRecord } from './modelProofCriteria.ts';
import { canonicalKey } from './normalize.ts';
import {
  contentState, familyTokens, hashString, numericDesignatorTokens, researchEvidenceOf, sourceRecordText,
  sourceText, versionedTokens,
} from './devAnalysisGrouping.ts';

export const CLAIM_REJECTION_REASONS = {
  unknown_item_id: 'the claim cites a record id that was not among the supplied source records',
  empty_claim_text: 'the claim carried no text',
  missing_evidence_quote: 'no usable evidence quote was returned for this claim',
  quote_not_in_stored_record: 'the evidence quote was not found verbatim in the stored source record',
  missing_publication_timestamp: 'the cited record has no stored publication timestamp',
  missing_canonical_url: 'the cited record has no stored canonical url',
  duplicate_claim: 'this claim for this record was already accepted',
  over_claim_cap: 'the claim exceeded the per-record or per-run claim cap',
};

export const DEVELOPMENT_REJECTION_REASONS = {
  empty_title: 'the development carried no title',
  no_identifiable_event: 'the title and stored text name no identifiable event (no named model, version, artefact or release language)',
  no_valid_claims: 'no claim survived validation, so the development has no supporting source record',
  duplicate_development: 'another development in this batch already covers the same normalised title',
  over_development_cap: 'the batch reached its development cap',
};

export const CONTENT_EXCLUSION_REASONS = {
  no_text: 'the stored record has neither a title nor an excerpt, so there is no stored text to analyse and nothing is fetched or generated to fill it',
  title_only: 'the stored record has a title but no excerpt, so an evidence quote could only ever be its own stored title; it is not analysed unless an administrator explicitly includes it',
};

// Which records of a batch may be sent to a model at all, decided from the stored fields.
// A record with no stored text is never sent. A record with a title and no excerpt is not
// sent either, unless the request carries the explicit administrator override - and even
// then it is analysed with the stored title alone. No excerpt is fetched, expanded or
// generated at any point, so a gap in the stored record stays a reported gap.
export function selectAnalysable(items, { includeTitleOnly = false } = {}) {
  const rows = (items || []).map((item) => ({ item, content_state: contentState(item) }));
  const included = [];
  const excluded = [];

  for (const row of rows) {
    const overridden = includeTitleOnly && row.content_state === CONTENT_STATES.title_only;
    if (row.content_state === CONTENT_STATES.has_excerpt || overridden) {
      included.push(row.item);
      continue;
    }
    excluded.push({
      item_id: row.item.id,
      content_state: row.content_state,
      title: cleanText(row.item.title, 140),
      source: cleanText(row.item.source, 80),
      reason_code: `insufficient_stored_text_${row.content_state}`,
      reason: CONTENT_EXCLUSION_REASONS[row.content_state],
    });
  }

  return {
    items: included,
    excluded,
    override_used: included.some((item) => contentState(item) === CONTENT_STATES.title_only),
    counts: {
      requested: rows.length,
      analysed: included.length,
      excluded: excluded.length,
      no_text: rows.filter((row) => row.content_state === CONTENT_STATES.no_text).length,
      title_only: rows.filter((row) => row.content_state === CONTENT_STATES.title_only).length,
      has_excerpt: rows.filter((row) => row.content_state === CONTENT_STATES.has_excerpt).length,
    },
    note: 'content_state is read from the stored fields; a missing excerpt is reported, never filled in',
  };
}

export const EVIDENCE_STATES = {
  source_states_claim: 'checked here, in code: the evidence quote is present verbatim in the stored record text',
  evidence_supported_by_model: "the evaluation model's opinion that the quote supports the claim: an opinion, not a fact",
  independent_factual_verification: 'not_performed: no source outside the stored records is consulted',
};

const NOT_INDEPENDENTLY_VERIFIED = 'not_performed';

// Clip at a word boundary without adding anything: the stored quote must remain a
// literal substring of the text it was verified against.
function clipLiteral(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
}

function cleanText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

// The view a model is allowed to see, plus the record text the evidence check runs
// against and the fingerprint idempotency is keyed on.
export function buildSourceView(items, config = DEV_ANALYSIS_CONFIG) {
  return items.map((item) => ({
    item_id: item.id,
    source: item.source || '',
    source_key: item.source_key || '',
    published_at: item.published_at || '',
    canonical_url: item.canonical_url || '',
    title: cleanText(item.title, 200),
    content_state: contentState(item),
    text: sourceText(item, config.max_source_text_chars),
    record_text: normalizeForMatch(sourceRecordText(item)),
    canonical_key: canonicalKey(item.canonical_url),
  }));
}

function citationCheck(reportedUrl, reportedPublishedAt, source) {
  const reported = String(reportedUrl || '').trim();
  const stored = String((source && source.canonical_url) || '').trim();
  const reportedCanonical = reported ? canonicalKey(reported) : '';
  const storedCanonical = canonicalKey(stored);
  const urlMatches = !reported || (Boolean(reportedCanonical) && reportedCanonical === storedCanonical);

  const reportedTime = String(reportedPublishedAt || '').trim();
  const storedTime = String((source && source.published_at) || '').trim();
  const timestampMatches = !reportedTime || reportedTime.slice(0, 10) === storedTime.slice(0, 10);

  return {
    reported_url: reported || null,
    reported_published_at: reportedTime || null,
    stored_url: stored || null,
    stored_published_at: storedTime || null,
    url_matches_stored: Boolean(urlMatches),
    timestamp_matches_stored: Boolean(timestampMatches),
    used_as_source: false,
    note: 'the citation the model reported is recorded for audit only; every stored source url and timestamp is taken from the stored record',
  };
}

// Requirement: a stored development must describe a specific identifiable event. This is
// decided deterministically from the title and the verified evidence quotes - a named
// model or version, or a named family with release language - never by the model.
export function identifiableEventOf(title, quotes) {
  const text = `${title} ${(quotes || []).join(' ')}`;
  const versions = versionedTokens(text);
  if (versions.length) {
    return { identifiable: true, basis: 'named model or version identifier in the title or evidence', tokens: versions };
  }
  const families = familyTokens(text);
  if (families.length && RELEASE_VERBS.test(text)) {
    return { identifiable: true, basis: 'named family with release language', tokens: families };
  }
  const designators = numericDesignatorTokens(text);
  if (designators.length && RELEASE_VERBS.test(text)) {
    return { identifiable: true, basis: 'version-bearing token with release language', tokens: designators };
  }
  const research = researchEvidenceOf(title, quotes);
  if (research.eligible) {
    return {
      identifiable: true,
      basis: `named artefact with publication language (${research.quoted_artifact_tokens.join(', ')})`,
      tokens: research.quoted_artifact_tokens,
      research_evidence: research,
    };
  }
  return { identifiable: false, basis: 'no named model, version, artefact or release language in the title or evidence', tokens: [] };
}

// Phase 1 of the pipeline: turn the extraction output into claim candidates, each one
// already checked against the stored records. Nothing here trusts the model's ids,
// urls, timestamps or quotes - they are all resolved against the sources.
export function collectClaims({ rawDevelopments, sources, config = DEV_ANALYSIS_CONFIG, runId = '' }) {
  const raw = Array.isArray(rawDevelopments) ? rawDevelopments : [];
  const sourceById = new Map(sources.map((source) => [source.item_id, source]));
  const perItemCount = {};
  const seenClaimKeys = new Set();
  const seenTitleKeys = new Set();

  const candidates = [];
  const rejectedClaims = [];
  const rejectedDevelopments = [];
  const counts = {
    raw_developments: raw.length,
    raw_claims: 0,
    accepted_claims: 0,
    rejected_claims: 0,
    developments_without_evidence: 0,
    fabricated_citations: 0,
    dropped_model_identifiers: 0,
  };

  for (const candidate of raw) {
    const title = cleanText(candidate && candidate.title, 160);
    const reasons = [];
    if (!title) reasons.push(DEVELOPMENT_REJECTION_REASONS.empty_title);

    const rawClaims = candidate && Array.isArray(candidate.claims) ? candidate.claims : [];
    counts.raw_claims += rawClaims.length;
    const claims = [];
    let rejectedForThisDevelopment = 0;

    for (const rawClaim of rawClaims) {
      const itemId = cleanText(rawClaim && rawClaim.item_id, 80);
      const claimText = cleanText(rawClaim && rawClaim.claim, 400);
      const source = sourceById.get(itemId);

      if (!source) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({
          development_title: title,
          item_id: itemId || null,
          claim: claimText,
          reason_code: 'unknown_item_id',
          reason: CLAIM_REJECTION_REASONS.unknown_item_id,
        });
        continue;
      }
      if (!claimText) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({ development_title: title, item_id: itemId, claim: '', reason_code: 'empty_claim_text', reason: CLAIM_REJECTION_REASONS.empty_claim_text });
        continue;
      }
      const quote = clipLiteral(rawClaim && rawClaim.evidence_quote, config.max_evidence_quote_chars);
      if (!quote || quote.length < config.min_evidence_quote_chars) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({ development_title: title, item_id: itemId, claim: claimText, evidence_quote: quote || '', reason_code: 'missing_evidence_quote', reason: CLAIM_REJECTION_REASONS.missing_evidence_quote });
        continue;
      }
      if (!source.published_at) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({ development_title: title, item_id: itemId, claim: claimText, evidence_quote: quote, reason_code: 'missing_publication_timestamp', reason: CLAIM_REJECTION_REASONS.missing_publication_timestamp });
        continue;
      }
      if (!source.canonical_url) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({ development_title: title, item_id: itemId, claim: claimText, evidence_quote: quote, reason_code: 'missing_canonical_url', reason: CLAIM_REJECTION_REASONS.missing_canonical_url });
        continue;
      }

      // The evidence check: is the quote actually in the stored record?
      const match = quoteMatchInRecord(quote, source.record_text);
      if (!match.found) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({
          development_title: title, item_id: itemId, claim: claimText, evidence_quote: quote,
          reason_code: 'quote_not_in_stored_record',
          reason: `${CLAIM_REJECTION_REASONS.quote_not_in_stored_record}: ${match.reason}`,
        });
        continue;
      }

      const dedupeKey = `${itemId}|${normalizeForMatch(claimText)}`;
      if (seenClaimKeys.has(dedupeKey)) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({ development_title: title, item_id: itemId, claim: claimText, evidence_quote: quote, reason_code: 'duplicate_claim', reason: CLAIM_REJECTION_REASONS.duplicate_claim });
        continue;
      }
      perItemCount[itemId] = (perItemCount[itemId] || 0) + 1;
      if (perItemCount[itemId] > config.max_claims_per_item || claims.length >= config.max_claims) {
        counts.rejected_claims += 1;
        rejectedForThisDevelopment += 1;
        rejectedClaims.push({ development_title: title, item_id: itemId, claim: claimText, evidence_quote: quote, reason_code: 'over_claim_cap', reason: CLAIM_REJECTION_REASONS.over_claim_cap });
        continue;
      }
      seenClaimKeys.add(dedupeKey);

      const citation = citationCheck(rawClaim && rawClaim.source_url, rawClaim && rawClaim.published_at, source);
      if (!citation.url_matches_stored || !citation.timestamp_matches_stored) counts.fabricated_citations += 1;

      counts.accepted_claims += 1;
      claims.push({
        claim_id: `claim_${counts.accepted_claims}`,
        item_id: itemId,
        claim_text: claimText,
        evidence_quote: quote,
        quote_in_record: true,
        quote_segments: match.segments,
        quote_match_reason: '',
        citation,
        source,
      });
    }

    const reportedKind = cleanText(candidate && candidate.kind, 40).toLowerCase().replace(/[\s-]+/g, '_');

    // Model identifiers are kept only when they actually appear in the supplied source
    // text: an identifier the records never mention is dropped and counted, never stored
    // as if a source had named it.
    const identifierPool = normalizeForMatch(sources.map((source) => `${source.title} ${source.text}`).join(' '));
    const reportedIdentifiers = Array.isArray(candidate && candidate.model_identifiers) ? candidate.model_identifiers : [];
    const modelIdentifiers = [];
    let droppedIdentifiers = 0;
    for (const rawIdentifier of reportedIdentifiers) {
      const identifier = cleanText(rawIdentifier, 80);
      if (!identifier) continue;
      if (!identifierPool.includes(normalizeForMatch(identifier))) {
        droppedIdentifiers += 1;
        continue;
      }
      if (!modelIdentifiers.includes(identifier)) modelIdentifiers.push(identifier);
    }
    counts.dropped_model_identifiers += droppedIdentifiers;

    const reportedVersions = Array.isArray(candidate && candidate.model_versions) ? candidate.model_versions : [];
    const modelVersions = [];
    for (const rawVersion of reportedVersions) {
      const version = cleanText(rawVersion, 60);
      if (!version) continue;
      if (!identifierPool.includes(normalizeForMatch(version))) {
        counts.dropped_model_identifiers += 1;
        continue;
      }
      if (!modelVersions.includes(version)) modelVersions.push(version);
    }

    // The kind reflects the actual contribution, decided in code from the stored text: a
    // record whose stored text names an artefact and frames it as a research contribution is
    // classified as research even when it also mentions a versioned model, because the paper,
    // method, framework, system or dataset is what the record is about. Everything else keeps
    // the kind the extraction model reported, and a kind outside the recorded list is stored
    // as unspecified rather than invented into one.
    const research = researchEvidenceOf(title, claims.map((claim) => claim.evidence_quote));
    const reportedKindKnown = DEVELOPMENT_KINDS.includes(reportedKind);
    const kind = research.eligible ? 'research' : (reportedKindKnown ? reportedKind : 'unspecified');
    const kindBasis = research.eligible
      ? `research contribution from the stored text: ${research.reason}`
      : `kind as reported by the extraction model${reportedKindKnown ? '' : ' (outside the recorded kinds, so stored as unspecified)'}`;

    const event = identifiableEventOf(title, claims.map((claim) => claim.evidence_quote));
    if (!event.identifiable) reasons.push(`${DEVELOPMENT_REJECTION_REASONS.no_identifiable_event}: ${event.basis}`);

    const titleKey = normalizeForMatch(title);
    if (titleKey && seenTitleKeys.has(titleKey)) {
      reasons.push(DEVELOPMENT_REJECTION_REASONS.duplicate_development);
    }
    if (!claims.length && !reasons.length) reasons.push(DEVELOPMENT_REJECTION_REASONS.no_valid_claims);

    if (reasons.length) {
      rejectedDevelopments.push({ title, kind, reported_kind: reportedKind, reasons, claim_candidates: claims.length });
      continue;
    }
    if (candidates.length >= config.max_developments) {
      rejectedDevelopments.push({ title, kind, reported_kind: reportedKind, reasons: [DEVELOPMENT_REJECTION_REASONS.over_development_cap], claim_candidates: claims.length });
      continue;
    }

    seenTitleKeys.add(titleKey);
    candidates.push({
      development_ref: `dev_ref_${candidates.length + 1}`,
      title,
      summary: cleanText(candidate && candidate.summary, 400),
      why_it_matters: cleanText(candidate && candidate.why_it_matters, 300),
      kind,
      reported_kind: reportedKind,
      kind_basis: kindBasis,
      research_evidence: research,
      model_identifiers: modelIdentifiers,
      model_versions: modelVersions,
      dropped_model_identifiers: droppedIdentifiers,
      group_hint: cleanText(candidate && candidate.group_key, 80),
      claims,
      rejected_for_this_development: rejectedForThisDevelopment,
    });
  }

  return {
    candidates,
    rejected_claims: rejectedClaims,
    rejected_developments: rejectedDevelopments,
    counts: { ...counts, developments_candidate: candidates.length, developments_rejected: rejectedDevelopments.length },
  };
}

export function validModelState(value) {
  const allowed = ['supported', 'mixed', 'insufficient_evidence', 'contradicted'];
  const state = String(value || '').trim().toLowerCase();
  return allowed.includes(state) ? state : 'not_evaluated';
}

function supportStateOf(modelStates) {
  const has = (state) => modelStates.includes(state);
  if (has('supported')) return has('contradicted') ? 'mixed_support_by_model' : 'evidence_supported_by_model';
  if (has('contradicted')) return 'contradicted_by_evaluator';
  if (has('mixed')) return 'partial_support_by_model';
  return 'source_states_claim_only';
}

// Phase 2: pair the claim candidates with the evaluation model's assessments and build
// the rows that get stored. A claim is stored because a real stored record contains its
// quoted text; the model's opinion is stored beside it, labelled as an opinion, and
// never as verification.
export function finalizeDevelopments({ claimCandidates, evaluations, sources, runId, config = DEV_ANALYSIS_CONFIG }) {
  const sourceById = new Map(sources.map((source) => [source.item_id, source]));
  const verdicts = evaluations || {};
  const developments = [];
  const claims = [];

  claimCandidates.forEach((candidate, index) => {
    const claimRows = candidate.claims.map((claim) => {
      const verdict = verdicts[claim.claim_id] || {};
      const modelState = verdict.model_state ? validModelState(verdict.model_state) : 'not_evaluated';
      const assessmentState = modelState === 'not_evaluated' ? 'not_evaluated' : modelState;
      const source = sourceById.get(claim.item_id) || claim.source;
      return {
        claim_id: claim.claim_id,
        item_id: claim.item_id,
        item_title: source ? source.title : '',
        source: source ? source.source : '',
        canonical_url: source ? source.canonical_url : '',
        published_at: source ? source.published_at : '',
        claim_text: claim.claim_text,
        evidence_quote: claim.evidence_quote,
        quote_in_record: true,
        quote_segments: claim.quote_segments,
        quote_match_reason: '',
        // The three states, never collapsed into one:
        source_states_claim: true,
        evidence_supports_claim: modelState === 'supported',
        model_state: modelState,
        model_confidence: typeof verdict.confidence === 'number' ? verdict.confidence : null,
        model_probabilities: verdict.probabilities || null,
        assessment_state: assessmentState,
        evidence_state: modelState === 'supported' ? 'evidence_supported_by_model' : 'source_states_claim_only',
        downgraded: false,
        citation: claim.citation,
        citation_accepted: claim.citation.url_matches_stored && claim.citation.timestamp_matches_stored,
        citation_rejection_reason: claim.citation.url_matches_stored ? (claim.citation.timestamp_matches_stored ? null : 'timestamp_mismatch') : 'url_mismatch',
        independent_verification: NOT_INDEPENDENTLY_VERIFIED,
        rejection_reason: null,
      };
    });

    const supportingItemIds = Array.from(new Set(claimRows.map((row) => row.item_id))).sort();
    const sourceUrls = Array.from(new Set(claimRows.map((row) => row.canonical_url).filter(Boolean))).sort();
    const timestamps = claimRows.map((row) => row.published_at).filter(Boolean).sort();
    const modelStates = claimRows.map((row) => row.model_state);
    const modelSupported = claimRows.some((row) => row.model_state === 'supported');

    // The id is derived from the run and the candidate it belongs to, so two batches never
    // share one - a run-id tail alone can repeat between runs, which would put two
    // different developments on the same id.
    const developmentId = `dev_${index + 1}_${hashString(`${runId}|${candidate.group_hint || supportingItemIds.join('+')}|${index}`)}`;
    const status = candidate.rejected_for_this_development > 0 ? 'partial' : 'accepted';

    for (const row of claimRows) claims.push({ ...row, development_id: developmentId, run_id: runId });

    developments.push({
      development_id: developmentId,
      run_id: runId,
      group_key: candidate.group_hint || `group_${supportingItemIds.join('_')}`,
      group_basis: supportingItemIds.length > 1 ? 'multiple_supporting_sources' : 'single_supporting_source',
      kind: candidate.kind,
      reported_kind: candidate.reported_kind,
      kind_basis: candidate.kind_basis || '',
      research_evidence: candidate.research_evidence || null,
      title: candidate.title,
      summary: candidate.summary,
      why_it_matters: candidate.why_it_matters,
      model_identifiers: candidate.model_identifiers,
      model_versions: candidate.model_versions,
      dropped_model_identifiers: candidate.dropped_model_identifiers,
      supporting_item_ids: supportingItemIds,
      supporting_sources_count: supportingItemIds.length,
      source_urls: sourceUrls,
      primary_published_at: timestamps[0] || '',
      earliest_published_at: timestamps[0] || '',
      latest_published_at: timestamps[timestamps.length - 1] || '',
      source_stated_claim: claimRows[0] ? claimRows[0].evidence_quote : '',
      claim_ids: claimRows.map((row) => row.claim_id),
      claims_total: claimRows.length,
      claims_rejected: candidate.rejected_for_this_development,
      status,
      // The three states stay separate all the way to storage.
      source_states_claim: claimRows.length > 0,
      evidence_supported_by_model: modelSupported,
      support_state: supportStateOf(modelStates),
      independent_verification: NOT_INDEPENDENTLY_VERIFIED,
      validation: {
        evidence_check: { quotes_checked: claimRows.length, quotes_found_in_stored_record: claimRows.length },
        citations: {
          checked: claimRows.length,
          accepted: claimRows.filter((row) => row.citation_accepted).length,
          rejected: claimRows.filter((row) => !row.citation_accepted).length,
        },
        timestamps_present: claimRows.every((row) => Boolean(row.published_at)),
        canonical_urls_present: claimRows.every((row) => Boolean(row.canonical_url)),
        model_identifiers_dropped: candidate.dropped_model_identifiers,
        model_states: modelStates,
      },
      recorded_at: new Date().toISOString(),
      retention_days: config.retention_days,
    });
  });

  return { developments, claims };
}

// Worst-case pre-call estimate, so the batch ceiling can be enforced before any call.
export function estimateBatchWorstCase({ sources, maxClaims, config = DEV_ANALYSIS_CONFIG }) {
  const sourceChars = sources.reduce((sum, source) => sum + String(source.text || '').length, 0);
  const perToken = config.estimate_tokens.chars_per_token;
  const parts = [];
  let total = 0;

  const priceA = config.price_table['base44-core:gpt_6_luna'];
  const inA = Math.ceil(sourceChars / perToken) + 700;
  const outA = maxClaims * config.estimate_tokens.output_tokens_per_claim;
  const costA = (inA / 1e6) * priceA.input + (outA / 1e6) * priceA.output;
  parts.push({ provider: 'base44-core', model: 'gpt_6_luna', input_tokens: inA, output_tokens: outA, estimate_usd: costA });
  total += costA;

  const priceB = config.price_table['typesafe:jev'];
  const inB = Math.ceil((sourceChars + maxClaims * 300) / perToken) + 400;
  const outB = maxClaims * config.estimate_tokens.output_tokens_per_question;
  const costB = (inB / 1e6) * priceB.input + (outB / 1e6) * priceB.output;
  parts.push({ provider: 'typesafe', model: 'jev', input_tokens: inB, output_tokens: outB, estimate_usd: costB });
  total += costB;

  const estimate = Number(total.toFixed(6));
  return {
    estimated_usd: estimate,
    within_ceiling: estimate <= config.spend_ceiling_usd,
    ceiling_usd: config.spend_ceiling_usd,
    source_chars: sourceChars,
    max_claims_assumed: maxClaims,
    parts,
    basis: 'worst case before the call: stored excerpt length, the maximum claim count this batch may store, published price estimates and assumed output tokens. No billed cost is available from the platform.',
  };
}

// Success is a conjunction of explicit criteria, never the absence of an error. A batch
// whose second model was skipped, failed or returned nothing usable cannot report
// success. A batch that legitimately found nothing to extract reports no_findings rather
// than success or failure.
export function evaluateBatchCriteria({ callA, callB, developments, claims, sources, spendWithinCeiling, config = DEV_ANALYSIS_CONFIG }) {
  const developmentList = Array.isArray(developments) ? developments : [];
  const claimList = Array.isArray(claims) ? claims : [];
  const sourceList = Array.isArray(sources) ? sources : [];
  const accepted = developmentList.filter((row) => row.status !== 'rejected');

  const sourcesComplete = sourceList.length > 0 && sourceList.every((source) => Boolean(source.item_id)
    && Boolean(source.canonical_url) && Boolean(source.published_at) && String(source.text || '').length > 0);
  const claimsPointAtSources = claimList.every((claim) => sourceList.some((source) => source.item_id === claim.item_id));
  const storedUrls = new Set(sourceList.map((source) => source.canonical_url));
  const storedTimestamps = new Set(sourceList.map((source) => source.published_at));
  const noForeignUrls = developmentList.every((row) => (row.source_urls || []).every((url) => storedUrls.has(url)));
  const noForeignTimestamps = developmentList.every((row) => !row.primary_published_at || storedTimestamps.has(row.primary_published_at));
  const supported = accepted.every((row) => (row.supporting_item_ids || []).length > 0
    && (row.source_urls || []).length > 0 && Boolean(row.primary_published_at)
    && (row.claim_ids || []).length > 0);
  const neverVerified = developmentList.every((row) => row.independent_verification === NOT_INDEPENDENTLY_VERIFIED);
  const needsAssessment = claimList.length > 0;
  const allAssessed = needsAssessment && claimList.every((claim) => claim.assessment_state !== 'not_evaluated');
  const modelCalls = (callA && callA.dispatches ? callA.dispatches : 0) + (callB && callB.dispatches ? callB.dispatches : 0);

  const criteria = {
    model_a_dispatched: Boolean(callA && callA.dispatches === 1),
    model_a_valid_extraction: Boolean(callA && callA.ok === true && callA.output && Array.isArray(callA.output.developments)),
    model_b_dispatched: needsAssessment ? Boolean(callB && callB.dispatches === 1) : false,
    model_b_valid_assessments: needsAssessment ? Boolean(callB && callB.ok === true && allAssessed) : false,
    no_unsupported_or_unassessed_claim_stored: claimList.every((claim) => claim.quote_in_record === true),
    stored_source_references_valid: sourcesComplete && claimsPointAtSources,
    citations_allowlisted: noForeignUrls && noForeignTimestamps,
    every_accepted_development_has_support: supported,
    nothing_marked_independently_verified: neverVerified,
    spend_within_ceiling: spendWithinCeiling !== false,
    call_budget_respected: modelCalls <= config.max_calls_total,
  };

  const failed = Object.keys(criteria).filter((key) => !criteria[key]);
  const total = Object.keys(criteria).length;
  const anyUsable = Boolean((callA && callA.ok === true) || (callB && callB.ok === true));

  let status;
  if (!needsAssessment && callA && callA.ok === true && !developmentList.length) {
    status = 'no_findings';
  } else if (callA && callA.ok !== true) {
    status = 'failed';
  } else {
    status = failed.length === 0 ? 'success' : anyUsable ? 'partial' : 'failed';
  }

  return { criteria, failed_criteria: failed, passed: total - failed.length, total, status };
}

// The dry-run report: what a batch would process, why those records were grouped the
// way they were, what is already covered by cached analysis, and what the worst-case
// spend would be. It is built by the same code the live batch uses, and it is produced
// without any provider call at all.
export function buildDryRunReport({
  selection, requestedIds, duplicateIds, missingIds, items, sources, grouping, plan, estimate, cacheEntriesRead,
  content = null, config = DEV_ANALYSIS_CONFIG,
}) {
  const sourceById = new Map(sources.map((source) => [source.item_id, source]));
  const coveredIds = new Set(plan.covered.map((row) => row.item_id));

  return {
    dry_run: true,
    selection,
    content: content || null,
    batch: {
      requested_ids: requestedIds || [],
      resolved_records: items.length,
      missing_ids: missingIds || [],
      duplicate_ids: duplicateIds || [],
      record_cap: config.max_records,
      within_cap: items.length <= config.max_records,
    },
    cache: {
      state: plan.cache_state,
      note: plan.note,
      entries_read: cacheEntriesRead,
      covered_count: plan.covered.length,
      uncovered_count: plan.uncovered.length,
      covered_item_ids: plan.covered.map((row) => row.item_id),
      cached_development_ids: Array.from(new Set(plan.covered.flatMap((row) => row.cached_development_ids || []))),
    },
    grouping: {
      method: grouping.method,
      records_analysed: grouping.records_analysed,
      candidates: grouping.candidates.slice(0, config.max_records).map((candidate) => ({
        group_key: candidate.group_key,
        basis: candidate.basis,
        item_ids: candidate.item_ids,
        supporting_sources: candidate.supporting_sources,
        shared_anchors: candidate.shared_anchors,
        shared_tokens: candidate.shared_tokens,
        all_records_thin: candidate.all_records_thin,
        identifiable_event: candidate.identifiable_event,
      })),
      candidate_count: grouping.candidates.length,
      duplicates: grouping.duplicates,
      refused_merge_count: grouping.refused_merges.length,
      refused_merges: grouping.refused_merges.slice(0, 8),
      multi_source_candidates: grouping.candidates.filter((candidate) => candidate.item_ids.length > 1).length,
    },
    sources: items.map((item) => {
      const source = sourceById.get(item.id);
      return {
        item_id: item.id,
        source: item.source || '',
        canonical_url: item.canonical_url || '',
        published_at: item.published_at || '',
        excerpt_chars: String(item.excerpt || '').length,
        text_chars: source ? String(source.text || '').length : 0,
        cache_covered: coveredIds.has(item.id),
      };
    }),
    planned: {
      model_a: { provider: config.model_a.provider, requested_model: config.model_a.model, task: 'extract source-grounded developments from the stored excerpt text', calls: plan.to_process.length ? 1 : 0 },
      model_b: { provider: config.model_b.provider, requested_model: config.model_b.model, task: 'assess whether the supplied excerpts support the extracted claims', calls: plan.to_process.length ? 1 : 0 },
      model_calls_planned: plan.to_process.length ? config.max_calls_total : 0,
      call_budget: { per_provider: config.max_calls_per_provider, total: config.max_calls_total },
      retries: config.allow_retries,
      records_to_process: plan.to_process.map((item) => item.id),
      records_skipped_as_cached: plan.covered.map((row) => row.item_id),
    },
    estimate,
    provider_calls: 0,
    note: 'dry run: nothing was sent to any model. This report is the batch plan, its grouping and its worst-case estimate, not analysis output.',
  };
}