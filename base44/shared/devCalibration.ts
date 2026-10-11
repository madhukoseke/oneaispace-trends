// Phase 3C: development quality calibration.
//
// Three outcomes, computed separately and never collapsed into one another:
//
//   1. analysis_eligible - does this stored record describe a specific, identifiable
//      development that is worth analysing at all?
//   2. event_type        - what kind of development does it describe?
//   3. evidence_status   - what does the stored source text actually carry?
//
// Every value here is a deterministic function of the stored fields (title, excerpt,
// format, source key and the stored claim quotes). No model is consulted, nothing is
// fetched, nothing is written and no value is invented: a record whose excerpt is missing
// stays title_only and is reported as an evidence limitation rather than given text.
//
// Why the three stages are separate: a model identifier in the stored text is evidence of
// what a record is *about*, never by itself evidence that a model was released there. A
// customer story that names a model version is an adoption case study; a repository that
// merely exists is not a release; a research paper is recognised by a named artefact plus
// contribution evidence in its own stored text. Classification never upgrades a record: it
// records what the stored text supports, and states the basis it used.

import { CONTENT_STATES, RELEASE_VERBS } from './devAnalysisConfig.ts';
import {
  contentState, familyTokens, researchEvidenceOf, versionedTokens,
} from './devAnalysisGrouping.ts';

export const EVENT_TYPES = [
  'model_release',
  'research_contribution',
  'software_release',
  'product_announcement',
  'adoption_case_study',
  'analysis_commentary',
  'other',
];

export const EVENT_TYPE_LABELS = {
  model_release: 'Model release',
  research_contribution: 'Research contribution',
  software_release: 'Software release',
  product_announcement: 'Product announcement',
  adoption_case_study: 'Adoption case study',
  analysis_commentary: 'Analysis or commentary',
  other: 'Other',
};

// Stage 3. What the stored text carries, never a judgement about the world:
//   no_stored_text           - neither title nor excerpt is stored
//   insufficient_stored_text - only the title is stored, so an evidence quote could only
//                              ever be that stored title
//   stored_text_available    - an excerpt is stored, so a claim can be quoted from it
//   claim_quote_verified     - a stored claim's quote was found verbatim in the record
// Whether that quote *supports* the claim stays a separate, model-stated opinion
// (support_state), and independent verification is never performed.
export const EVIDENCE_STATUSES = {
  not_evaluated: 'nothing was analysed for this record, so no stored text was examined',
  no_stored_text: 'the record stores neither a title nor an excerpt',
  insufficient_stored_text: 'only the title is stored, so an evidence quote could only be that stored title',
  stored_text_available: 'an excerpt is stored, so a claim can be quoted from the record itself',
  claim_quote_verified: 'a stored claim quote was verified verbatim against the stored record text',
};

export const CALIBRATION_REASONS = {
  no_stored_text: 'the record stores neither a title nor an excerpt, so there is nothing to classify',
  hiring_notice: 'the record is a hiring notice, which states no development',
  collaboration_announcement: 'the record announces a collaboration or partnership and names no model, artefact or release of its own',
  analysis_or_commentary: 'the record is analysis, commentary or an interview about something, rather than the announcement of a development',
  repository_without_release_evidence: 'the record is a repository whose stored text carries no release evidence: existence, popularity and recent activity are not a release',
  no_identifiable_development: 'the stored text names no model, version, artefact, research contribution or release',
};

export const CALIBRATION_LIMITATIONS = {
  deterministic:
    'analysis_eligible, event_type and evidence_status are deterministic functions of the stored fields. No model is consulted for them, nothing is fetched and no value is inferred.',
  kind_unchanged:
    'the stored kind remains what the extraction model reported for a live batch; event_type is this deterministic classification of the same stored text. The two are recorded side by side and neither overwrites the other.',
  not_a_claim_about_the_world:
    'an event_type says what the stored text reads as. It is not verification: independent_verification stays not_performed and no event_type makes a development verified.',
  adoption_detection:
    'adoption is recognised from the stored title: a case-study phrasing, or a reduction the title states about a named adopter. A record whose title carries no such signal is not called an adoption, and a model name inside an adoption story never turns it into a model release.',
  software_release:
    'a software release requires release evidence in the stored text (a version identifier such as v1.0, release notes, a changelog or general availability). A repository whose stored text has none is classified other and is not analysis eligible.',
  research_recognition:
    'a research contribution needs a named artefact from the stored title plus contribution evidence: contribution language in the stored text, or a research title that names the artefact and a contribution-type subtitle. Bare words such as "paper", "study" or "research" never qualify on their own.',
  missing_text:
    'a record whose excerpt is missing is reported as insufficient_stored_text and stays excluded from analysis by the content-state rule. Classification of its title does not make its text exist.',
  historical_records:
    'nothing here rewrites a stored development, claim or cache entry: the three stages are recorded on records written from now on, and existing rows keep the values they already carry.',
};

// --- stage 2 signals ---------------------------------------------------------------------

const HIRING_PATTERNS = [
  /\b(?:is|are|we'?re|now) hiring\b/i,
  /\bhiring\b/i,
  /\bjobs?\b/i,
  /\bcareers?\b/i,
  /\brecruiting\b/i,
];

const COLLABORATION_PATTERNS = [
  /\bpartnership\b/i,
  /\bpartner(?:s|ing|ed)?\b/i,
  /\bcollaborat\w*\b/i,
  /\bco-engineer\w*\b/i,
  /\bj oint venture\b/i,
  /\bteams? up\b/i,
  /\bjoin(?:s|ed)? forces\b/i,
  /\bkick(?:s|ed)? off\b/i,
  /\bmemorandum\b/i,
];

// Analysis and commentary are recognised from the stored title: a headline that reports
// somebody's view, or asks its own question, is about a development rather than being one.
const COMMENTARY_PATTERNS = [
  /\b(?:says?|said|argues?|argued|believes?|thinks?|claims?|claimed|warns?|warned|explains?|explained|asks?|asked|answers?|weighs?)\b/i,
  /\b(?:opinion|commentary|interview|editorial|analysis|explainer|perspective|roundup|podcast|newsletter|recap)\b/i,
  /\b(?:in talks|reportedly|rumou?rs?|rumou?red|allegedly|unconfirmed)\b/i,
  /^(?:why|how|what|is|are|does|do|did|should|can|could|will|would|when|where|who)\b/i,
  /\?\s*$/,
];

// Adoption is recognised from the stored title and requires a stated adoption shape: a
// case-study phrasing, or a change a named adopter's title claims about its own work.
const ADOPTION_PATTERNS = [
  /\bcase stud(?:y|ies)\b/i,
  /\bcustomer stor(?:y|ies)\b/i,
  /\b(cuts?|cutting|reduces?|reducing|saves?|saving|improves?|improving|boosts?|boosting|accelerat\w*)\b[^.]{0,40}?\b(?:\d+(?:\.\d+)?\s?(?:%|x|percent)|by \d)/i,
  /\bhow [A-Z][\w.&'-]+ .{0,60}?\b(?:turns?|cuts?|saves?|reduces?|uses?|scales?|deployed|automates?)\b/,
  /\b(?:deployed|adopted|rolled out|in production) (?:by|at) [A-Z][\w.&'-]+/,
];

const SOFTWARE_VERSION_PATTERNS = [
  /\bv\d+(?:\.\d+)+\b/i,
  /\bversion \d+(?:\.\d+)?\b/i,
  /\brelease notes\b/i,
  /\bchangelog\b/i,
  /\bchange log\b/i,
  /\bgenerally available\b/i,
  /\bgeneral availability\b/i,
];

const PRODUCT_TOKENS = /\b(?:platform|product|service|suite|feature|tool|api|app|dashboard|assistant|integration|availability|pricing|hardware|device|workstation|pc)\b/i;

function anyMatch(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

// --- the three stages, for one stored record ---------------------------------------------

export function classifyEvent({ title, excerpt, format, source_key } = {}) {
  const storedTitle = String(title || '').replace(/\s+/g, ' ').trim();
  const storedExcerpt = String(excerpt || '').replace(/\s+/g, ' ').trim();
  const text = `${storedTitle} ${storedExcerpt}`.trim();
  const base = { stored_title: storedTitle, content_state: contentState({ title, excerpt }) };

  if (!storedTitle && !storedExcerpt) {
    return { ...base, event_type: 'other', analysis_eligible: false, reason_code: 'no_stored_text', reason: CALIBRATION_REASONS.no_stored_text, basis: 'no stored text' };
  }

  const versions = versionedTokens(text);
  const families = familyTokens(text);
  const research = researchEvidenceOf(storedTitle, [text], { format, source_key });

  if (anyMatch(HIRING_PATTERNS, `${storedTitle} ${storedExcerpt}`)) {
    return { ...base, event_type: 'other', analysis_eligible: false, reason_code: 'hiring_notice', reason: CALIBRATION_REASONS.hiring_notice, basis: 'hiring language in the stored text' };
  }

  // A collaboration is only refused as a development when it names nothing of its own: a
  // partnership that announces a named model is still that model's announcement.
  if (anyMatch(COLLABORATION_PATTERNS, storedTitle) && !versions.length && !families.length && !research.eligible) {
    return { ...base, event_type: 'other', analysis_eligible: false, reason_code: 'collaboration_announcement', reason: CALIBRATION_REASONS.collaboration_announcement, basis: 'collaboration language in the stored title and no named model, artefact or release' };
  }

  if (research.eligible) {
    return {
      ...base,
      event_type: 'research_contribution',
      analysis_eligible: true,
      reason_code: research.reason_code,
      reason: research.reason,
      basis: `named artefact with contribution evidence: ${(research.quoted_artifact_tokens || research.artifact_tokens).join(', ')}`,
      research_evidence: research,
    };
  }

  // Commentary before any release shape: a headline that reports a view about a model is
  // about that model, not the announcement of it - even when the model version is named.
  if (anyMatch(COMMENTARY_PATTERNS, storedTitle)) {
    return { ...base, event_type: 'analysis_commentary', analysis_eligible: false, reason_code: 'analysis_or_commentary', reason: CALIBRATION_REASONS.analysis_or_commentary, basis: 'analysis, question or attributed-view language in the stored title' };
  }

  if (anyMatch(ADOPTION_PATTERNS, storedTitle)) {
    return {
      ...base,
      event_type: 'adoption_case_study',
      analysis_eligible: true,
      reason_code: 'adoption_case_study',
      reason: 'the stored title reports what a named adopter did with a technology, which is adoption rather than the release of it',
      basis: 'adoption shape in the stored title (case-study phrasing or a stated reduction by an adopter)',
      model_identifiers: versions.concat(families),
    };
  }

  if (versions.length || (families.length && RELEASE_VERBS.test(text))) {
    return {
      ...base,
      event_type: 'model_release',
      analysis_eligible: true,
      reason_code: 'named_model_or_version',
      reason: 'the stored text names a model or version together with release language',
      basis: versions.length ? `named model or version identifier: ${versions.join(', ')}` : `named model family with release language: ${families.join(', ')}`,
      model_identifiers: versions.concat(families),
    };
  }

  if (anyMatch(SOFTWARE_VERSION_PATTERNS, text)) {
    return {
      ...base,
      event_type: 'software_release',
      analysis_eligible: true,
      reason_code: 'software_version_release_evidence',
      reason: 'the stored text carries release evidence for a piece of software (a version identifier, release notes, a changelog or general availability)',
      basis: 'version or release-notes evidence in the stored text',
    };
  }

  if (RELEASE_VERBS.test(text) && PRODUCT_TOKENS.test(text)) {
    return {
      ...base,
      event_type: 'product_announcement',
      analysis_eligible: true,
      reason_code: 'product_or_feature_announcement',
      reason: 'the stored text announces availability of a product, service or feature without naming a model, version or artefact',
      basis: 'release language together with a product, service or feature',
    };
  }

  if (String(format || '') === 'project') {
    return { ...base, event_type: 'other', analysis_eligible: false, reason_code: 'repository_without_release_evidence', reason: CALIBRATION_REASONS.repository_without_release_evidence, basis: 'a repository record with no release evidence in its stored text' };
  }

  return { ...base, event_type: 'other', analysis_eligible: false, reason_code: 'no_identifiable_development', reason: CALIBRATION_REASONS.no_identifiable_development, basis: 'no model, version, artefact, research contribution or release in the stored text' };
}

export function evidenceStatusOf({ content_states = [], claim_quotes_checked = 0, claim_quotes_verified = 0, evaluated = true } = {}) {
  const states = (content_states || []).map(String);
  if (!states.length) return evaluated ? 'stored_text_available' : 'not_evaluated';
  if (claim_quotes_verified > 0) return 'claim_quote_verified';
  if (states.every((state) => state === CONTENT_STATES.no_text)) return 'no_stored_text';
  if (states.every((state) => state !== CONTENT_STATES.has_excerpt)) return 'insufficient_stored_text';
  return 'stored_text_available';
}

// The three stages for one stored catalogue record. Used by the read-only diagnostics, so a
// catalogue can be reported before and after calibration without any write.
export function calibrateSourceRecord(item) {
  const classification = classifyEvent(item || {});
  return {
    item_id: item ? item.id : null,
    title: classification.stored_title,
    source_key: String((item && item.source_key) || ''),
    format: String((item && item.format) || ''),
    content_state: classification.content_state,
    analysis_eligible: classification.analysis_eligible,
    event_type: classification.event_type,
    event_type_basis: classification.basis,
    reason_code: classification.reason_code,
    reason: classification.reason,
    evidence_status: evidenceStatusOf({ content_states: [classification.content_state] }),
  };
}

// The three stages for one development, from the developments's own supporting records and
// stored claims. Deterministic, and evaluated at the moment the row is built.
export function calibrateDevelopment({ title, sources = [], claims = [] }) {
  const supporting = (sources || []).filter(Boolean);
  const texts = supporting.map((source) => String(source.text || source.record_text || '')).join(' ');
  const formats = supporting.map((source) => String(source.format || ''));
  const classification = classifyEvent({
    title,
    excerpt: texts,
    format: formats.includes('project') ? 'project' : (formats[0] || ''),
    source_key: String((supporting[0] && supporting[0].source_key) || ''),
  });
  const contentStates = supporting.map((source) => String(source.content_state || CONTENT_STATES.title_only));
  const claimQuotesChecked = (claims || []).length;
  const claimQuotesVerified = (claims || []).filter((claim) => claim && claim.quote_in_record === true).length;

  return {
    analysis_eligible: classification.analysis_eligible,
    event_type: classification.event_type,
    event_type_basis: classification.basis,
    evidence_status: evidenceStatusOf({
      content_states: contentStates.length ? contentStates : [classification.content_state],
      claim_quotes_checked: claimQuotesChecked,
      claim_quotes_verified: claimQuotesVerified,
    }),
    calibration_reason: classification.reason,
    calibration_reason_code: classification.reason_code,
    calibration_basis: classification.basis,
    calibrated_content_states: contentStates,
    claim_quotes_checked: claimQuotesChecked,
    claim_quotes_verified: claimQuotesVerified,
  };
}

// A run-level summary of the three stages, for the diagnostics a batch returns.
export function summarizeCalibration(rows, { sampleCap = 20 } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const byEventType = {};
  const byEvidenceStatus = {};
  const byReason = {};
  let eligible = 0;

  for (const row of list) {
    const eventType = String(row.event_type || 'other');
    const evidenceStatus = String(row.evidence_status || 'not_evaluated');
    byEventType[eventType] = (byEventType[eventType] || 0) + 1;
    byEvidenceStatus[evidenceStatus] = (byEvidenceStatus[evidenceStatus] || 0) + 1;
    if (row.analysis_eligible === true) eligible += 1;
    else {
      const code = String(row.reason_code || row.calibration_reason_code || 'unstated');
      byReason[code] = (byReason[code] || 0) + 1;
    }
  }

  return {
    records: list.length,
    analysis_eligible: eligible,
    analysis_eligible_share: list.length ? Number((eligible / list.length).toFixed(4)) : 0,
    ineligible: list.length - eligible,
    by_event_type: byEventType,
    by_evidence_status: byEvidenceStatus,
    ineligible_reasons: byReason,
    samples: list.slice(0, sampleCap).map((row) => ({
      item_id: row.item_id || row.development_id || null,
      title: String(row.title || '').slice(0, 120),
      analysis_eligible: row.analysis_eligible === true,
      event_type: row.event_type || 'other',
      evidence_status: row.evidence_status || 'not_evaluated',
      basis: String(row.event_type_basis || '').slice(0, 200),
      reason_code: row.reason_code || row.calibration_reason_code || '',
    })),
    sample_cap: sampleCap,
    truncated: list.length > sampleCap,
    note: 'the three stages are computed separately: eligibility, event type and what the stored text carries. None of them makes a development verified.',
    limitations: CALIBRATION_LIMITATIONS,
  };
}