// Deterministic candidate grouping for Phase 2A.
//
// No model is consulted here. Grouping is a pure function of the stored records, so
// the same inputs always produce the same candidates, and the report can always state
// why two records were linked together - or deliberately left apart.
//
// Two sources of linkage, in this order:
//   1. the same canonical url  -> the same source record ingested twice, deduplicated
//   2. an identical normalised title -> the same announcement reported by two sources
//   3. the same named model identifier AND the same variant phrase written after it
//      ("gemini-3.8|flash", "gpt-6|astra-ultrafast") -> candidates for one release
// A shared family or version number on its own is NOT linkage: one family ships several
// separate announcements (Gemini 3.8 Flash and Gemini 3.8 Live are different releases,
// and GPT-6 is not "GPT-6 Astra Ultrafast"), so those pairs are reported as a refused
// merge instead of being joined. Records that share only generic vocabulary are refused
// the same way, so "everything mentioning AI agents" cannot collapse into one candidate.
//
// A record fingerprint covers the stored text that analysis actually consumes and the revision
// of the rules that analysed it. It is how the pipeline knows a record's analysis is still
// current, so an unchanged record is never sent to a model twice, and a record analysed under
// older rules is not reported as current.

import { canonicalKey, clip, titleKey } from './normalize.ts';
import { normalizeForMatch } from './modelProofCriteria.ts';
import {
  ANALYSIS_REVISION,
  CONTENT_STATES, GENERIC_GROUPING_TOKENS, NAMED_AI_FAMILIES, RELEASE_VERBS,
  RESEARCH_PUBLICATION_PHRASES, RESEARCH_TITLE_ARTIFACT_STOPWORDS, RESEARCH_TITLE_CONTRIBUTION_WORDS,
  RESEARCH_VENUE_PHRASES,
} from './devAnalysisConfig.ts';

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

// What the evidence check compares against: the stored title and excerpt, joined. The join is
// stated once, here, because the text a model is shown and the text its quote is checked
// against must be the same string. Joining the two fields differently in the prompt builder
// rejected a quote the pipeline had itself shown the model: the check requires the quote to be
// a literal substring of this text, so a faithful copy has to be able to pass.
export function sourceRecordText(item) {
  return `${item.title || ''}. ${item.excerpt || ''}`;
}

// The stored text a model is allowed to see for one record: its title and its excerpt,
// clipped, joined exactly as sourceRecordText joins them. Nothing else is sent, and no network
// fetch is performed.
export function sourceText(item, maxChars = 700) {
  return clip(sourceRecordText(item), maxChars);
}

export function itemFingerprint(item) {
  return hashString([
    // The analysis revision belongs to the identity of an analysis: a cached entry produced by
    // older rules no longer covers this record.
    ANALYSIS_REVISION,
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
    // Possessives are dropped before punctuation is stripped, so "OpenAI's" and "OpenAI"
    // are one word instead of two.
    .replace(/'s(?=\s|$)/g, '')
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

// Words that carry no identifying power inside a variant phrase: connectors and other
// function words, the companies that publish models, the family names themselves, and
// everything already listed as generic grouping vocabulary.
const CONNECTOR_WORDS = new Set([
  'and', 'with', 'for', 'the', 'that', 'this', 'these', 'those', 'than', 'then', 'but',
  'from', 'into', 'onto', 'over', 'under', 'about', 'after', 'before', 'while', 'when',
  'plus', 'also', 'now', 'today', 'here', 'there', 'its', 'their', 'your', 'our',
  'just', 'only', 'more', 'most', 'very', 'best', 'better', 'first', 'latest', 'next',
  'last', 'newer', 'says', 'said', 'uses', 'use', 'based', 'two', 'three', 'one',
  'again', 'still', 'even', 'well', 'way',
]);

const COMPANY_WORDS = new Set([
  'openai', 'anthropic', 'google', 'deepmind', 'microsoft', 'meta', 'facebook', 'amazon',
  'apple', 'nvidia', 'intel', 'amd', 'qualcomm', 'samsung', 'tesla', 'xai', 'alibaba',
  'baidu', 'tencent', 'bytedance', 'huggingface', 'cohere', 'oracle', 'salesforce',
  'adobe', 'ibm', 'databricks', 'snowflake', 'groq', 'cerebras', 'moonshot', 'labs',
  'inc', 'corp',
]);

// How many words after the identifier are inspected, and how many of them may make up the
// variant phrase. Two words are enough to keep "Gemini 3.8 Live" apart from
// "Gemini 3.8 Live with Live Avatar", which are two separate announcements.
const VARIANT_WINDOW_WORDS = 4;
const MAX_VARIANT_WORDS = 2;

function isDistinctiveWord(word) {
  if (!/^[a-z][a-z-]{2,}$/.test(word)) return false;
  if (CONNECTOR_WORDS.has(word) || COMPANY_WORDS.has(word)) return false;
  if (GENERIC_GROUPING_TOKENS.has(word) || NAMED_AI_FAMILIES.includes(word)) return false;
  return true;
}

// Every named model identifier in the stored text, with the variant phrase written after
// it: the "flash" in "Gemini 3.8 Flash", the "astra ultrafast" in "GPT-6 Astra Ultrafast".
// The window is the few words directly after the identifier, so a variant phrase is what
// the record itself says about which product or edition it is about.
function identifierMatches(text) {
  const normalized = normalizeTokenText(text);
  const matches = [];
  for (const family of NAMED_AI_FAMILIES) {
    const pattern = new RegExp(`(^| )${escapePattern(family)}[ -]?(\\d+(?:\\.\\d+)*)(?=$| )`, 'g');
    let match = pattern.exec(normalized);
    while (match) {
      const window = normalized.slice(match.index + match[0].length).trim().split(' ').filter(Boolean).slice(0, VARIANT_WINDOW_WORDS);
      const variant = [];
      for (const word of window) {
        if (!isDistinctiveWord(word) || variant.includes(word)) continue;
        variant.push(word);
        if (variant.length >= MAX_VARIANT_WORDS) break;
      }
      matches.push({ version_token: `${family}-${match[2]}`, variant });
      match = pattern.exec(normalized);
    }
  }
  return matches;
}

// The anchor a record offers for linking: one named model identifier together with the
// variant phrase it was named with. Two records describe one release only when they offer
// the SAME anchor.
export function variantAnchors(text) {
  const anchors = new Set();
  for (const match of identifierMatches(text)) {
    if (!match.variant.length) continue;
    anchors.add(`${match.version_token}|${match.variant.join('-')}`);
  }
  return Array.from(anchors).sort();
}

function isModelToken(lower) {
  return NAMED_AI_FAMILIES.some((family) => lower === family
    || new RegExp(`^${escapePattern(family)}[ .-]?\\d`).test(lower));
}

// A named artefact a record can be *about*: a paper's own name, a method, framework, system
// or dataset. Only distinctive name-shaped words from the title count, and model
// identifiers, the variant words written after a model identifier, company names and
// generic vocabulary are all excluded - so "Gemini 3.8 Flash" contributes no artefact while
// "Quine", "MERIT" or "Ecology" does.
export function researchArtifactTokens(title) {
  const raw = String(title || '');
  if (!raw.trim()) return [];
  const variantWords = new Set();
  for (const entry of namedIdentifiers(raw)) for (const word of entry.variant) variantWords.add(word);

  const tokens = raw.split(/\s+/)
    .map((token) => token.replace(/^[^\w.+#-]+/, '').replace(/[^\w.+#-]+$/, ''))
    .filter(Boolean);

  const found = new Set();
  tokens.forEach((token, index) => {
    if (!/^[A-Za-z][A-Za-z0-9.'+-]*$/.test(token)) return;
    const lower = token.toLowerCase().replace(/[.+#-]+$/, '');
    if (lower.length < 3) return;
    const shapeLooksNamed = /[A-Z]/.test(token.slice(1)) || /^[A-Z][a-z]{2,}$/.test(token) || /[-.]/.test(token);
    if (!shapeLooksNamed) return;
    if (index === 0 && /ing$/.test(lower)) return;
    if (CONNECTOR_WORDS.has(lower) || COMPANY_WORDS.has(lower)) return;
    if (GENERIC_GROUPING_TOKENS.has(lower) || NAMED_AI_FAMILIES.includes(lower)) return;
    if (isModelToken(lower) || variantWords.has(lower)) return;
    found.add(token);
  });
  return Array.from(found).sort();
}

// The contribution language that frames a named artefact as a research contribution: the
// stored text stating what the work proposes, presents, builds, evaluates or releases. It is
// read from the text the evidence comes from, so a headline alone never makes a record research.
export function publicationLanguageOf(text) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return [];
  return RESEARCH_PUBLICATION_PHRASES.filter((phrase) => normalized.includes(phrase)).sort();
}

// Publication format words, reported as context only. They never qualify a record on their own:
// "this paper" or "a study" says what a text is called, not what it contributes.
export function venueLanguageOf(text) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return [];
  return RESEARCH_VENUE_PHRASES.filter((phrase) => normalized.includes(phrase)).sort();
}

// A stored research title that names its own artefact and then describes it. Only the segment
// before the first colon may carry the artefact, and only a real name counts there - so
// "Dex-One2Many: Learning ..." qualifies while "Introducing ..." or a bare topic line does not.
export function researchTitleContribution(title) {
  const raw = String(title || '').trim();
  const colon = raw.indexOf(':');
  if (colon <= 0) return { ok: false, reason_code: 'no_title_artefact_pattern' };

  const lead = raw.slice(0, colon).trim();
  const subtitle = raw.slice(colon + 1).trim();
  if (!lead || !subtitle) return { ok: false, reason_code: 'no_title_artefact_pattern' };

  const artifacts = researchArtifactTokens(lead)
    .filter((token) => !RESEARCH_TITLE_ARTIFACT_STOPWORDS.includes(token.toLowerCase()));
  if (!artifacts.length) return { ok: false, reason_code: 'no_title_artefact' };

  const words = normalizeTokenText(subtitle).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const contributionWord = words.find((word) => RESEARCH_TITLE_CONTRIBUTION_WORDS.includes(word));
  if (!contributionWord) return { ok: false, reason_code: 'no_title_contribution_subtitle' };

  return {
    ok: true,
    reason_code: 'title_names_artefact_and_contribution_subtitle',
    artifact_tokens: artifacts,
    contribution_word: contributionWord,
  };
}

// A record counts as research provenance only when it was stored as a research record (or from
// the arXiv feed). The title pattern is a statement about a paper's own title, so it is applied
// to records that are papers - never to a news or commentary record that merely looks like one.
function isResearchProvenance(context) {
  const format = String((context && context.format) || '').toLowerCase();
  const sourceKey = String((context && context.source_key) || '').toLowerCase();
  return format === 'research' || sourceKey === 'arxiv';
}

// Research eligibility, decided in code. A record is a research contribution when its stored
// title names an artefact and its stored text carries contribution language, or - for a record
// stored as research - when the title itself is the "Name: <what it is>" statement of a
// contribution. Format words alone never qualify it, and an artefact that appears only in the
// headline while the text says nothing about it is refused. This makes a record eligible for
// analysis; it never makes it accepted, which still requires a valid claim with a verbatim quote.
export function researchEvidenceOf(title, quotes, context = {}) {
  const artifacts = researchArtifactTokens(title);
  const text = (quotes || []).join(' ').trim();
  const publication = publicationLanguageOf(text);
  const venue = venueLanguageOf(text);
  const base = { artifact_tokens: artifacts, publication_language: publication, venue_language: venue };

  if (!artifacts.length) {
    return { ...base, eligible: false, reason_code: 'no_named_artifact', reason: 'the title names no paper, method, framework, benchmark, dataset or system' };
  }

  const normalized = normalizeForMatch(text);
  const quoted = artifacts.filter((artifact) => normalized.includes(normalizeForMatch(artifact)));

  if (publication.length) {
    if (!quoted.length) {
      return { ...base, eligible: false, reason_code: 'artifact_not_in_evidence', reason: 'the named artefact appears in the title but not in the stored text the evidence is taken from' };
    }
    return {
      ...base,
      eligible: true,
      reason_code: 'named_artifact_with_contribution_language',
      reason: 'the stored text names this artefact and states what the work contributes',
      quoted_artifact_tokens: quoted,
      contribution_basis: 'contribution language in the stored text',
    };
  }

  const titleContribution = researchTitleContribution(title);
  if (titleContribution.ok && isResearchProvenance(context)) {
    return {
      ...base,
      eligible: true,
      reason_code: 'title_names_artefact_and_contribution_subtitle',
      reason: `the stored title names the artefact and describes it as a ${titleContribution.contribution_word}`,
      quoted_artifact_tokens: quoted.length ? quoted : titleContribution.artifact_tokens,
      contribution_basis: 'research title: artefact before the colon with a contribution-type subtitle',
      title_contribution: titleContribution,
    };
  }

  return {
    ...base,
    eligible: false,
    // Two different refusals, stated separately: text that carries publication format words but
    // no contribution at all, and text that says nothing about being a publication either.
    reason_code: venue.length ? 'no_contribution_language' : 'no_publication_language',
    reason: venue.length
      ? `the stored text carries publication format words (${venue.join(', ')}) but states no contribution, so the record is not framed as a research contribution`
      : 'the stored text carries no publication language, so the record is not framed as a research contribution',
  };
}

// Named identifiers with the variant words each carried, for the report: a reader can see
// which variant each side of a refused link named.
export function namedIdentifiers(text) {
  const found = new Map();
  for (const match of identifierMatches(text)) {
    const variant = found.get(match.version_token) || new Set();
    for (const word of match.variant) variant.add(word);
    found.set(match.version_token, variant);
  }
  return Array.from(found.entries())
    .map(([version_token, variant]) => ({ version_token, variant: Array.from(variant).sort() }))
    .sort((left, right) => left.version_token.localeCompare(right.version_token));
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
  const research = researchEvidenceOf(item && item.title, [text], {
    format: item && item.format, source_key: item && item.source_key,
  });
  if (research.eligible) {
    return {
      identifiable: true,
      basis: 'named artefact with publication language',
      tokens: research.quoted_artifact_tokens,
      research_evidence: research,
    };
  }
  return { identifiable: false, basis: 'no named model, version, artefact or release language in the stored text', tokens: [] };
}

// What the stored record actually contains, decided from the stored fields alone and never
// from a character threshold: no stored text at all, a title with no excerpt, or a record
// with an excerpt. Nothing is fetched, expanded or generated to fill a gap - a missing
// excerpt stays missing and is reported as such.
export function contentState(item) {
  const title = String((item && item.title) || '').trim();
  const excerpt = String((item && item.excerpt) || '').trim();
  if (!title && !excerpt) return CONTENT_STATES.no_text;
  if (!excerpt) return CONTENT_STATES.title_only;
  return CONTENT_STATES.has_excerpt;
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

// Union-find over the surviving records: two records are linked only by a shared variant
// anchor (the same named model identifier AND the same variant phrase), or by an identical
// normalised title. A shared version number alone never links them.
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

  const byAnchor = new Map();
  const byTitle = new Map();
  const links = [];

  for (const item of items) {
    const text = sourceRecordText(item);
    for (const anchor of variantAnchors(text)) {
      if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
      byAnchor.get(anchor).push(item.id);
    }
    const key = titleKey(item.title);
    if (key) {
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(item.id);
    }
  }

  for (const [anchor, ids] of byAnchor.entries()) {
    for (let index = 1; index < ids.length; index += 1) {
      union(ids[0], ids[index]);
      links.push({ basis: 'same_model_and_variant', anchor, item_ids: ids });
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
    const anchors = sharedValues(group.map((item) => variantAnchors(sourceRecordText(item))));
    // A group shares a title only when every record in it normalises to one identical title
    // key. Anything else was linked by a model-and-variant anchor, and the basis says so.
    const titleKeys = Array.from(new Set(group.map((item) => titleKey(item.title)).filter(Boolean)));
    const titles = titleKeys.length === 1 ? titleKeys : [];
    let basis = 'single_source';
    if (itemIds.length > 1) basis = titles.length ? 'same_normalized_title' : 'same_model_and_variant';
    return {
      group_key: hashString(`${basis}|${itemIds.join(',')}`),
      basis,
      item_ids: itemIds,
      supporting_sources: itemIds.length,
      shared_anchors: anchors,
      shared_tokens: tokens,
      shared_title_key: titles[0] || '',
      content_states: group.map((item) => contentState(item)),
      all_records_insufficient_text: group.every((item) => contentState(item) !== CONTENT_STATES.has_excerpt),
      identifiable_event: group.some((item) => identifiableEvent(item).identifiable),
      per_item_event_basis: group.map((item) => ({ item_id: item.id, ...identifiableEvent(item) })),
    };
  }).sort((left, right) => left.group_key.localeCompare(right.group_key));

  // Two kinds of refusal are reported, and neither pair is merged: records that name the
  // same model identifier but not the same variant, and records that share only generic
  // vocabulary. The first is the more important one - it is what keeps separate
  // announcements of one family apart.
  const itemsByCandidate = candidates.map((candidate) => kept.filter((item) => candidate.item_ids.includes(item.id)));
  const anchorsByCandidate = itemsByCandidate.map((records) => Array.from(new Set(records.flatMap((item) => variantAnchors(sourceRecordText(item))))));
  const identifiersByCandidate = itemsByCandidate.map((records) => {
    const merged = new Map();
    for (const record of records) {
      for (const entry of namedIdentifiers(sourceRecordText(record))) {
        const variant = merged.get(entry.version_token) || new Set();
        for (const word of entry.variant) variant.add(word);
        merged.set(entry.version_token, variant);
      }
    }
    return merged;
  });

  const variantRefusals = [];
  const genericRefusals = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const itemIds = candidates[left].item_ids.concat(candidates[right].item_ids).sort();
      const sharedAnchors = anchorsByCandidate[left].filter((anchor) => anchorsByCandidate[right].includes(anchor));
      const sharedVersions = Array.from(identifiersByCandidate[left].keys())
        .filter((version) => identifiersByCandidate[right].has(version)).sort();

      if (sharedVersions.length && !sharedAnchors.length) {
        const side = (identifiers) => sharedVersions.map((version) => ({
          version_token: version, variant: Array.from(identifiers.get(version)).sort(),
        }));
        variantRefusals.push({
          group_keys: [candidates[left].group_key, candidates[right].group_key],
          item_ids: itemIds,
          shared_version_tokens: sharedVersions,
          variants_left: side(identifiersByCandidate[left]),
          variants_right: side(identifiersByCandidate[right]),
          reason: 'the same model identifier is named on both sides but not the same variant phrase, so the stored text does not establish that these records describe one release; they were left as separate candidates',
        });
        continue;
      }

      const leftGeneric = new Set(itemsByCandidate[left].flatMap((item) => genericTokens(sourceRecordText(item))));
      const rightGeneric = new Set(itemsByCandidate[right].flatMap((item) => genericTokens(sourceRecordText(item))));
      const shared = Array.from(leftGeneric).filter((token) => rightGeneric.has(token)).sort();
      if (shared.length) {
        genericRefusals.push({
          group_keys: [candidates[left].group_key, candidates[right].group_key],
          item_ids: itemIds,
          shared_generic_tokens: shared,
          reason: 'these records share only generic vocabulary, which does not identify a development, so they were left as separate candidates',
        });
      }
    }
  }
  const refusedMerges = [...variantRefusals, ...genericRefusals];

  return {
    candidates,
    duplicates,
    refused_merges: refusedMerges,
    links,
    item_count: items.length,
    records_analysed: kept.length,
    method: 'deterministic: canonical url dedupe, then the same named model identifier together with the same variant phrase written after it, then an identical normalised title; a shared family or version number alone never links two records, generic vocabulary never links two records, and a named research artefact links nothing by itself',
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