// Phase 3A: read-only source-quality diagnostics.
//
// Answers one question from the records already stored: how much usable source text does the
// catalogue actually hold, per provider, and how many records the existing Phase 2A rules would
// consider analysable. Nothing is fetched, written, generated or inferred, and no model is
// involved - the report is a summary of what is on disk.
//
// Content states, canonical keys and event identifiability are imported from the Phase 2A
// modules rather than re-implemented, so a record cannot be "usable" here and unusable there.

import { CONTENT_STATES } from './devAnalysisConfig.ts';
import { contentState, identifiableEvent } from './devAnalysisGrouping.ts';
import { canonicalKey } from './normalize.ts';
import { providerForItem } from './sourceEnrichment.ts';
import { calibrateSourceRecord, summarizeCalibration } from './devCalibration.ts';

export const QUALITY_MAX_RECORDS = 5000;
export const QUALITY_PAGE_SIZE = 200;
export const DUPLICATE_SAMPLE_LIMIT = 20;
// How many enrichment candidates the report lists: enough to pick a batch from, never the whole
// title-only population.
export const ENRICHMENT_CANDIDATE_LIMIT = 10;
export const QUALITY_ITEM_FIELDS = [
  'title', 'excerpt', 'source', 'source_key', 'canonical_url', 'canonical_key', 'format', 'published_at',
];

export const SOURCE_QUALITY_LIMITATIONS = {
  read_only:
    'This report reads stored records and writes nothing: no item, trend, topic, ingestion, analysis, development, claim or cache record is created or modified, and there is no schedule behind it.',
  no_fetch:
    'Nothing is fetched from any provider and nothing is generated: an excerpt is either already stored or it is missing, and a missing one is counted as missing.',
  scan:
    `The scan is bounded to the newest ${QUALITY_MAX_RECORDS} stored records, read a page at a time. A larger catalogue is reported as truncated rather than walked in full.`,
  eligibility:
    'Analysis eligibility is the Phase 2A rule applied to the stored text: a record needs a stored excerpt and a named model, version, artefact or release signal. It says a record is a candidate for analysis, never that it holds a valid development.',
  duplicates:
    'Duplicates are grouped on the same canonical key the ingestion pipeline deduplicates with (host, path and non-tracking query, lowercased host). They are counted here, never deleted.',
  calibration:
    'The calibration block applies the Phase 3C rules to the same stored records: analysis eligibility, event type and evidence status, all deterministic and read-only. It classifies what the stored text reads as; it never makes a record verified, and it writes nothing.',
};

function hostOf(raw) {
  try {
    return new URL(String(raw || '')).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// Reads the catalogue a page at a time, newest first, and stops at the scan cap. Only the
// fields the report needs are transferred.
export async function loadItemsForQuality(db, { maxRecords = QUALITY_MAX_RECORDS, pageSize = QUALITY_PAGE_SIZE } = {}) {
  const records = [];
  let cursor;
  let hasMore = true;
  let truncated = false;

  while (hasMore) {
    const page = await db.Item.filter({}, { sort: '-published_at', limit: pageSize, cursor, fields: QUALITY_ITEM_FIELDS });
    const items = (page && page.items) || [];
    records.push(...items);
    cursor = page ? page.next_cursor : undefined;
    hasMore = Boolean(page && page.has_more);
    if (!items.length) break;
    if (records.length >= maxRecords) {
      truncated = hasMore;
      break;
    }
  }

  const limited = records.slice(0, maxRecords);
  return { records: limited, truncated, scan_cap: maxRecords, records_read: limited.length };
}

// One pass over the loaded records: content states, excerpt coverage, canonical duplicates and
// analysis eligibility, overall and per provider.
export function summarizeSourceQuality({ records, truncated = false, scan_cap = QUALITY_MAX_RECORDS } = {}) {
  const items = Array.isArray(records) ? records : [];
  const bySource = new Map();
  const byContentState = { [CONTENT_STATES.no_text]: 0, [CONTENT_STATES.title_only]: 0, [CONTENT_STATES.has_excerpt]: 0 };
  const byKey = new Map();
  const duplicateRows = new Map();

  let analysisEligible = 0;
  let eligibleTitleOnly = 0;
  let identifyableWithoutExcerpt = 0;
  let candidateCount = 0;
  const enrichmentCandidates = [];
  let excerptChars = 0;
  let excerptCharsMin = null;
  let excerptCharsMax = null;

  const rowFor = (item) => {
    const sourceKey = String(item.source_key || '') || 'unknown';
    if (!bySource.has(sourceKey)) {
      bySource.set(sourceKey, {
        source_key: sourceKey,
        source: String(item.source || '') || 'unknown',
        hosts: new Set(),
        records: 0,
        [CONTENT_STATES.no_text]: 0,
        [CONTENT_STATES.title_only]: 0,
        [CONTENT_STATES.has_excerpt]: 0,
        analysis_eligible: 0,
        excerpt_chars_total: 0,
      });
    }
    return bySource.get(sourceKey);
  };

  for (const item of items) {
    const row = rowFor(item);
    const state = contentState(item);
    const excerpt = String(item.excerpt || '').trim();
    const event = identifiableEvent(item);
    const eligible = state === CONTENT_STATES.has_excerpt && event.identifiable;

    row.records += 1;
    row[state] += 1;
    const host = hostOf(item.canonical_url);
    if (host) row.hosts.add(host);
    byContentState[state] += 1;

    if (state === CONTENT_STATES.has_excerpt) {
      row.excerpt_chars_total += excerpt.length;
      excerptChars += excerpt.length;
      excerptCharsMin = excerptCharsMin === null ? excerpt.length : Math.min(excerptCharsMin, excerpt.length);
      excerptCharsMax = excerptCharsMax === null ? excerpt.length : Math.max(excerptCharsMax, excerpt.length);
    }

    if (eligible) {
      analysisEligible += 1;
      row.analysis_eligible += 1;
    }
    if (state === CONTENT_STATES.title_only && event.identifiable) {
      eligibleTitleOnly += 1;
      identifyableWithoutExcerpt += 1;
      // A title-only record whose provider publishes its own text for it: the population Phase 3A
      // enrichment is aimed at. Listed for selection here, never acted on by this report.
      const provider = providerForItem(item);
      if (provider.key !== 'unsupported') {
        candidateCount += 1;
        if (enrichmentCandidates.length < ENRICHMENT_CANDIDATE_LIMIT) {
          enrichmentCandidates.push({
            item_id: item.id,
            title: String(item.title || ''),
            source: String(item.source || ''),
            source_key: row.source_key,
            canonical_url: String(item.canonical_url || ''),
            provider: provider.key,
            provider_label: provider.label,
            event_basis: event.basis,
            event_tokens: event.tokens || [],
            reason: 'title-only record that names an identifiable event, with a provider endpoint that publishes its own text for it',
          });
        }
      }
    }

    const key = String(item.canonical_key || '') || canonicalKey(item.canonical_url);
    if (key) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item.id);
    }
  }

  for (const [key, ids] of byKey.entries()) {
    if (ids.length > 1) duplicateRows.set(key, ids);
  }

  const bySourceRows = Array.from(bySource.values())
    .map((row) => ({
      source_key: row.source_key,
      source: row.source,
      hosts: Array.from(row.hosts).sort().slice(0, 5),
      records: row.records,
      no_text: row[CONTENT_STATES.no_text],
      title_only: row[CONTENT_STATES.title_only],
      has_excerpt: row[CONTENT_STATES.has_excerpt],
      excerpt_coverage: row.records ? Number((row[CONTENT_STATES.has_excerpt] / row.records).toFixed(4)) : 0,
      average_excerpt_chars: row[CONTENT_STATES.has_excerpt]
        ? Math.round(row.excerpt_chars_total / row[CONTENT_STATES.has_excerpt])
        : 0,
      analysis_eligible: row.analysis_eligible,
    }))
    .sort((left, right) => right.records - left.records || left.source_key.localeCompare(right.source_key));

  const recordsInDuplicates = Array.from(duplicateRows.values()).reduce((sum, ids) => sum + ids.length, 0);
  const hasExcerpt = byContentState[CONTENT_STATES.has_excerpt];

  return {
    scan: { records_read: items.length, truncated, scan_cap },
    totals: {
      records: items.length,
      no_text: byContentState[CONTENT_STATES.no_text],
      title_only: byContentState[CONTENT_STATES.title_only],
      has_excerpt: hasExcerpt,
      excerpt_coverage: items.length ? Number((hasExcerpt / items.length).toFixed(4)) : 0,
      analysis_eligible: analysisEligible,
      analysis_eligible_share: items.length ? Number((analysisEligible / items.length).toFixed(4)) : 0,
    },
    excerpt_text: {
      records_with_excerpt: hasExcerpt,
      total_chars: excerptChars,
      average_chars: hasExcerpt ? Math.round(excerptChars / hasExcerpt) : 0,
      min_chars: excerptCharsMin,
      max_chars: excerptCharsMax,
    },
    by_content_state: byContentState,
    by_source: bySourceRows,
    duplicates: {
      duplicate_keys: duplicateRows.size,
      records_in_duplicate_groups: recordsInDuplicates,
      sample: Array.from(duplicateRows.entries())
        .slice(0, DUPLICATE_SAMPLE_LIMIT)
        .map(([canonical_key, item_ids]) => ({ canonical_key, item_ids, count: item_ids.length })),
      note: 'the same canonical key already appears on more than one stored record; the Phase 2A grouping keeps the newest of them and reports the others rather than analysing both',
    },
    analysability: {
      eligible_with_excerpt: analysisEligible,
      eligible_but_title_only: eligibleTitleOnly,
      title_only_with_named_event: identifyableWithoutExcerpt,
      note: 'a title-only record with a named event is exactly the population Phase 3A enrichment is aimed at: it already describes something identifiable, and only its source text is missing',
    },
    enrichment_candidates: {
      count: candidateCount,
      listed: enrichmentCandidates,
      limit: ENRICHMENT_CANDIDATE_LIMIT,
      truncated: candidateCount > enrichmentCandidates.length,
      note: 'title-only records that name an identifiable event and whose provider publishes its own text for them. Listed for selection only: nothing here is fetched, written or enriched, and enrichment stays a separate, explicit, capped request',
    },
    // Phase 3C: the three calibrated stages for every record in the scan, so eligibility, event
    // type and evidence status can be read before and after calibration from one report.
    calibration: summarizeCalibration(items.map(calibrateSourceRecord)),
    limitations: SOURCE_QUALITY_LIMITATIONS,
  };
}