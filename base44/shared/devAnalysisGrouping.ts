// Deterministic candidate grouping for Phase 2A.
//
// No model is consulted here. Grouping is a pure function of the stored records, so
// the same inputs always produce the same candidates, and the report can always state
// why two records were linked together - or deliberately left apart.
//
// Three sources of linkage, in this order:
//   1. the same canonical url  -> the same source record ingested twice, deduplicated
//   2. a shared named model or version identifier ("gpt-6", "qwen-3.5") -> candidates
//      for one development
//   3. an identical normalised title -> candidates for one development
// Records that share only generic vocabulary are reported as a refused merge and are
// NOT joined, so "everything mentioning AI agents" cannot collapse into one candidate.
//
// A record fingerprint covers the stored text that analysis actually consumes. It is
// how the pipeline knows a record's analysis is still current, so an unchanged record
// is never sent to a model twice.

import { canonicalKey, clip, titleKey } from './normalize.ts';
import { GENERIC_GROUPING_TOKENS, NAMED_AI_FAMILIES, RELEASE_VERBS } from './devAnalysisConfig.ts';

const MIN_THIN_TEXT_CHARS = 40;

// Stable, order-independent 64-bit-ish digest (two FNV-1a style lanes). Used for
// fingerprints and group keys, which must be reproducible across runs.
export function hashString(value) {
  const text = String(value ?? '');
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

// The stored text a model is allowed to see for one record: its title and its excerpt,
// clipped. Nothing else is sent, and no network fetch is performed.
export function sourceText(item, maxChars = 700) {
  return clip(`${item.title || ''}. ${item.excerpt || ''}`, maxChars);
}

// What the evidence check compares against: the stored title and excerpt, normalised.
export function sourceRecordText(item) {
  return `${item.title || ''} ${item.excerpt || ''}`;
}

export function itemFingerprint(item) {
  return hashString([
    item.id || '',
    canonicalKey(item.canonical_url),
    item.published_at || '',
    titleKey(item.title),
    String(item.excerpt || '').slice(0, 200),
  ].join('|'));
}

export function fingerprintSourceSet(items) {
  return hashString(items.map((item) => itemFingerprint(item)).sort().join('|'));
}

function normalizeTokenText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A known family followed by a version number: "gpt-6", "gpt6", "qwen 3.5",
// "llama-3.2" all normalise to a single comparable token.
export function versionedTokens(text) {
  const normalized = normalizeTokenText(text);
  const found = new Set();
  for (const family of NAMED_AI_FAMILIES) {
    const pattern = new RegExp(`(^| )${escapePattern(family)}[ -]?(\\d+(?:\\.\\d+)*)(?=$| )`, 'g');
    let match = pattern.exec(normalized);
    while (match) {
      found.add(`${family}-${match[2]}`);
      match = pattern.exec(normalized);
    }
  }
  return Array.from(found).sort();
}

// Families named without a version. Weak on their own: only usable for the
// identifiable-event check, never for linking two records.
export function familyTokens(text) {
  const normalized = normalizeTokenText(text);
  return NAMED_AI_FAMILIES.filter((family) => new RegExp(`(^| )${escapePattern(family)}(?=$| )`).test(normalized)).sort();
}

// Tokens that carry both a name and a version-like number, excluding bare years and
// generic vocabulary. Secondary signal beside the family list.
export function numericDesignatorTokens(text) {
  const normalized = normalizeTokenText(text);
  const found = new Set();
  for (const raw of normalized.split(' ')) {
    if (!raw || raw.length < 3) continue;
    if (!/[a-z]/.test(raw) || !/\d/.test(raw)) continue;
    if (/^(19|20)\d\d$/.test(raw)) continue;
    if (GENERIC_GROUPING_TOKENS.has(raw)) continue;
    if (!raw.includes('.') && /^[a-z]*\d+[a-z]*$/.test(raw)) continue;
    found.add(raw);
  }
  return Array.from(found).sort();
}

export function specificTokens(text) {
  return Array.from(new Set([...versionedTokens(text), ...numericDesignatorTokens(text)])).sort();
}

export function genericTokens(text) {
  const normalized = normalizeTokenText(text);
  const found = new Set();
  for (const word of normalized.split(' ')) {
    if (GENERIC_GROUPING_TOKENS.has(word)) found.add(word);
  }
  return Array.from(found).sort();
}

// Does this record describe an identifiable event (a named model or version, or a
// named family together with release language), rather than a generic mention?
// Deterministic, in code, and stated in the report - never decided by a model.
export function identifiableEvent(item) {
  const text = sourceRecordText(item);
  const versions = versionedTokens(text);
  if (versions.length) {
    return { identifiable: true, basis: 'named model or version identifier', tokens: versions };
  }
  const families = familyTokens(text);
  if (families.length && RELEASE_VERBS.test(text)) {
    return { identifiable: true, basis: 'named family with release language', tokens: families };
  }
  const designators = numericDesignatorTokens(text);
  if (designators.length && RELEASE_VERBS.test(text)) {
    return { identifiable: true, basis: 'version-bearing token with release language', tokens: designators };
  }
  return { identifiable: false, basis: 'no named model, version or release language in the stored text', tokens: [] };
}

export function isThin(item) {
  return sourceText(item).length < MIN_THIN_TEXT_CHARS;
}

function dedupeByCanonicalUrl(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = canonicalKey(item.canonical_url) || `id:${item.id}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const kept = [];
  const duplicates = [];
  for (const [key, group] of Array.from(buckets.entries()).sort((left, right) => left[0].localeCompare(right[0]))) {
    const ordered = [...group].sort((left, right) => {
      const leftTime = Date.parse(String(left.published_at || '')) || 0;
      const rightTime = Date.parse(String(right.published_at || '')) || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return String(left.id).localeCompare(String(right.id));
    });
    kept.push(ordered[0]);
    if (ordered.length > 1) {
      duplicates.push({
        canonical_key: key,
        kept_item_id: ordered[0].id,
        duplicate_item_ids: ordered.slice(1).map((item) => item.id),
        reason: 'the same canonical url was already ingested; the newer record is kept and the other is reported, not analysed twice',
      });
    }
  }
  kept.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return { kept, duplicates };
}

// Union-find over the surviving records: two records are linked only by a shared
// specific token, or by an identical normalised title.
function cluster(items) {
  const parent = new Map(items.map((item) => [item.id, item.id]));
  const find = (id) => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current);
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  const byToken = new Map();
  const byTitle = new Map();
  const links = [];

  for (const item of items) {
    const text = sourceRecordText(item);
    for (const token of specificTokens(text)) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(item.id);
    }
    const key = titleKey(item.title);
    if (key) {
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(item.id);
    }
  }

  for (const [token, ids] of byToken.entries()) {
    for (let index = 1; index < ids.length; index += 1) {
      union(ids[0], ids[index]);
      links.push({ basis: 'shared_named_model_or_version', token, item_ids: ids });
    }
  }
  for (const [key, ids] of byTitle.entries()) {
    for (let index = 1; index < ids.length; index += 1) {
      union(ids[0], ids[index]);
      links.push({ basis: 'same_normalized_title', title_key: key, item_ids: ids });
    }
  }

  const groups = new Map();
  for (const item of items) {
    const root = find(item.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  }
  return { groups: Array.from(groups.values()), links };
}

function sharedValues(lists) {
  if (!lists.length) return [];
  const [first, ...rest] = lists;
  return first.filter((value) => rest.every((list) => list.includes(value))).sort();
}

// Candidate groups for one batch. Every surviving record appears in exactly one group;
// a record that links to nothing is its own single-source candidate.
export function groupCandidates(items) {
  const { kept, duplicates } = dedupeByCanonicalUrl(items);
  const { groups, links } = cluster(kept);

  const candidates = groups.map((group) => {
    const itemIds = group.map((item) => item.id).sort();
    const tokens = sharedValues(group.map((item) => specificTokens(sourceRecordText(item))));
    const titles = sharedValues([group.map((item) => titleKey(item.title))]);
    let basis = 'single_source';
    if (itemIds.length > 1) basis = tokens.length ? 'shared_named_model_or_version' : 'same_normalized_title';
    return {
      group_key: hashString(`${basis}|${itemIds.join(',')}`),
      basis,
      item_ids: itemIds,
      supporting_sources: itemIds.length,
      shared_tokens: tokens,
      shared_title_key: titles[0] || '',
      all_records_thin: group.every(isThin),
      identifiable_event: group.some((item) => identifiableEvent(item).identifiable),
      per_item_event_basis: group.map((item) => ({ item_id: item.id, ...identifiableEvent(item) })),
    };
  }).sort((left, right) => left.group_key.localeCompare(right.group_key));

  // Records that share only generic vocabulary: reported, never merged.
  const refusedMerges = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const leftItems = kept.filter((item) => candidates[left].item_ids.includes(item.id));
      const rightItems = kept.filter((item) => candidates[right].item_ids.includes(item.id));
      const leftGeneric = new Set(leftItems.flatMap((item) => genericTokens(sourceRecordText(item))));
      const rightGeneric = new Set(rightItems.flatMap((item) => genericTokens(sourceRecordText(item))));
      const shared = Array.from(leftGeneric).filter((token) => rightGeneric.has(token)).sort();
      if (shared.length) {
        refusedMerges.push({
          group_keys: [candidates[left].group_key, candidates[right].group_key],
          item_ids: candidates[left].item_ids.concat(candidates[right].item_ids).sort(),
          shared_generic_tokens: shared,
          reason: 'these records share only generic vocabulary, which does not identify a development, so they were left as separate candidates',
        });
      }
    }
  }

  return {
    candidates,
    duplicates,
    refused_merges: refusedMerges,
    links,
    item_count: items.length,
    records_analysed: kept.length,
    method: 'deterministic: canonical url dedupe, then a shared named model or version identifier, then an identical normalised title; generic vocabulary never links two records',
  };
}

// Which of these records are already covered by a stored analysis, and therefore need
// no model call at all.
export function cacheCoverage(items, cacheEntries) {
  const coveredFingerprints = new Set();
  const entries = Array.isArray(cacheEntries) ? cacheEntries : [];
  for (const entry of entries) {
    const list = Array.isArray(entry && entry.item_fingerprints) ? entry.item_fingerprints : [];
    for (const fingerprint of list) coveredFingerprints.add(fingerprint);
  }

  const covered = [];
  const uncovered = [];
  for (const item of items) {
    const fingerprint = itemFingerprint(item);
    const hit = coveredFingerprints.has(fingerprint);
    const entry = hit ? entries.find((row) => (row.item_fingerprints || []).includes(fingerprint)) : null;
    const record = {
      item_id: item.id,
      fingerprint,
      covered: hit,
      cached_run_id: entry ? entry.run_id : null,
      cached_development_ids: entry && Array.isArray(entry.development_ids) ? entry.development_ids : [],
    };
    if (hit) covered.push(record); else uncovered.push(record);
  }
  return { covered, uncovered, covered_fingerprints: Array.from(coveredFingerprints).sort() };
}

// Batch-request validation: the caps are checked here, in one place, so the live path
// and the tests exercise the same rules.
export function validateBatchRequest({ itemIds, maxRecords }) {
  const ids = Array.isArray(itemIds) ? itemIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  const unique = Array.from(new Set(ids));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  if (!unique.length) {
    return { ok: false, error_category: 'no_records', reason: 'no source record ids were supplied', item_ids: [] };
  }
  if (unique.length > maxRecords) {
    return {
      ok: false,
      error_category: 'record_cap',
      reason: `${unique.length} source records were requested, the batch cap is ${maxRecords}`,
      item_ids: unique,
      cap: maxRecords,
    };
  }
  return {
    ok: true,
    item_ids: unique,
    requested: ids.length,
    duplicate_ids: Array.from(new Set(duplicateIds)),
    cap: maxRecords,
  };
}

// What a batch would actually do: which records already have analysis for this exact
// stored text (so they need no model call at all) and which would be processed. The
// live path and the tests both go through here, so the idempotency rule has one home.
export function planBatch({ items, cacheEntries }) {
  const coverage = cacheCoverage(items, cacheEntries);
  const toProcessIds = new Set(coverage.uncovered.map((row) => row.item_id));
  const state = !coverage.covered.length ? 'none' : coverage.uncovered.length ? 'partial' : 'cached';

  return {
    to_process: items.filter((item) => toProcessIds.has(item.id)),
    covered: coverage.covered,
    uncovered: coverage.uncovered,
    cache_state: state,
    note: state === 'cached'
      ? 'every requested record already has analysis for this exact stored text, so no model call is made'
      : state === 'partial'
        ? 'some requested records already have analysis for this exact stored text and are skipped; the rest are processed'
        : 'no requested record is covered by earlier analysis',
  };
}