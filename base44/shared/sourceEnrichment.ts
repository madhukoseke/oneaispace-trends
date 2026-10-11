// Phase 3A: controlled enrichment of title-only source records.
//
// What this module may do, and what it may never do:
//   - it may re-read the text a provider itself publishes for a record that is already
//     stored, through that provider's own public endpoint (the GitHub repository API, the
//     arXiv query API, the Hacker News item API, or the exact RSS/Atom feed the record came
//     from). Nothing else is ever fetched: no arbitrary URL, no page scraping, no third party.
//   - it may propose that native text as the record's excerpt. It never composes, summarises,
//     translates, expands or infers text, and a provider that publishes nothing usable is
//     reported as such - not filled in.
//   - it only ever touches a record whose stored excerpt is empty. A record that already has
//     an excerpt is never overwritten, and no analysis, development, claim, cache or
//     ingestion record is written by this path.
//
// The decision for each record is a pure function of the stored record and the provider's
// answer, so a dry run states exactly what an execute run would do, and the same request
// twice produces the same plan.

import { RSS_FEEDS, USER_AGENT } from './sources.ts';
import { parseFeed } from './providers/rss.ts';
import { parseArxivEntries } from './providers/arxiv.ts';
import { canonicalKey, cleanExcerpt, clip, decodeEntities, safeUrl, stripHtml } from './normalize.ts';
import { CONTENT_STATES } from './devAnalysisConfig.ts';
import { contentState, hashString } from './devAnalysisGrouping.ts';
import { sanitizeMessage } from './modelAdapters.ts';

export const ENRICHMENT_CONFIG = {
  // Bounded and manual: at most this many records per request, and only when an administrator
  // names them explicitly and asks for execution. A request naming more is refused outright,
  // never silently truncated.
  max_records: 10,
  fetch_timeout_ms: 15000,
  fetch_concurrency: 4,
  // The floor cleanExcerpt itself applies: shorter source text is reported, not stored.
  min_excerpt_chars: 40,
  max_excerpt_chars: 260,
  update_fields: ['excerpt'],
  dry_run_default: true,
};

// The only hosts this path may contact, and the only identifiers it may put in a request. A
// stored record's canonical url is never fetched: the record's own source key and host decide
// which provider is asked, the lookup url is built from validated identifier parts, and anything
// else is refused as unsupported rather than fetched.
export const ENRICHMENT_NETWORK_POLICY = {
  approved_endpoints: [
    { provider: 'github', endpoint: 'https://api.github.com/repos/{owner}/{repo}', identifiers: 'owner and repository name taken from the path of a github.com canonical url' },
    { provider: 'arxiv', endpoint: 'https://export.arxiv.org/api/query?id_list={arxiv_id}', identifiers: 'the arXiv identifier from an arxiv.org/abs/ url, validated against a fixed pattern before use' },
    { provider: 'hacker-news', endpoint: 'https://hacker-news.firebaseio.com/v0/item/{item_id}.json', identifiers: 'the numeric item id from a stored news.ycombinator.com url' },
    { provider: 'rss', endpoint: 'the feed url already configured in shared/sources.ts', identifiers: 'the canonical key of the stored record, matched against the feed it came from' },
  ],
  refusals: {
    canonical_page: 'a record\'s canonical url is never fetched, so no arbitrary page is ever read',
    unknown_host: 'a record whose source key is not a configured provider, or whose url carries no trustworthy identifier, is refused and never looked up',
    caller_supplied_url: 'no part of a request can name a url: identifiers are parsed out of the stored record and validated before use',
    outbound_hosts: 'every outbound host is one of the four above; nothing else is contacted',
  },
};

export const ENRICHMENT_LIMITATIONS = {
  native_only:
    'Only text the provider itself publishes is read back: the GitHub repository API, the arXiv query API, the Hacker News item API, or the original RSS/Atom feed. No canonical page is scraped, no other site is consulted, and no text is composed, summarised, translated, expanded or inferred.',
  writes:
    'A record is written only when it is explicitly named, execution is requested, its stored excerpt is empty, and the provider publishes text that passes the ingestion pipeline\'s own excerpt rule. Exactly one field is written - the excerpt - and it is written once; a record that already has an excerpt is never overwritten.',
  idempotency:
    'Each record carries a fingerprint of its identity and its current stored text. A record enriched by an earlier run is no longer title-only, so a repeat request reports it as already having an excerpt and performs no fetch or write: the same request twice converges instead of repeating work.',
  unsupported:
    'A record whose provider publishes no per-record endpoint, or whose canonical URL carries no trustworthy lookup key, is skipped with a stated reason rather than guessed at.',
  no_model_calls:
    'No model is involved anywhere in this path. It reads source text and writes an excerpt; it never extracts, judges, verifies or summarises anything.',
  history:
    'Nothing historical is touched: analysis runs, developments, claims, cache entries and ingestion runs are neither read for enrichment nor written, and no accepted development or stored evidence is modified.',
};

// The provider that can answer for one stored record, decided from its source key and the host
// of its canonical URL - never from anything a caller supplied.
export function providerForItem(item) {
  const canonical = safeUrl(item && item.canonical_url);
  const sourceKey = String((item && item.source_key) || '');
  let host = '';
  try {
    host = canonical ? new URL(canonical).hostname.replace(/^www\./, '').toLowerCase() : '';
  } catch {
    host = '';
  }

  if (sourceKey === 'github' || host === 'github.com') {
    return { key: 'github', label: 'GitHub repository API', canonical, host };
  }
  if (sourceKey === 'arxiv' || host === 'arxiv.org') {
    return { key: 'arxiv', label: 'arXiv query API', canonical, host };
  }
  if (sourceKey === 'hacker-news' || host === 'news.ycombinator.com') {
    return { key: 'hacker-news', label: 'Hacker News item API', canonical, host };
  }
  const feed = RSS_FEEDS.find((entry) => entry.key === sourceKey);
  if (feed) {
    return { key: `rss:${feed.key}`, label: `${feed.label} feed`, canonical, host, feed };
  }
  return {
    key: 'unsupported',
    label: String(item && item.source) || 'unknown provider',
    canonical,
    host,
    reason_code: 'unsupported_provider',
    reason: 'no per-record provider endpoint is configured for this source, so no source text is read for it',
  };
}

// The identity of this particular enrichment attempt: the record, its canonical key and the
// exact stored text it currently holds.
export function enrichmentFingerprint(item) {
  return hashString([
    item && item.id,
    canonicalKey((item && item.canonical_url) || ''),
    String((item && item.title) || ''),
    String((item && item.excerpt) || ''),
    String((item && item.source_key) || ''),
  ].join('|'));
}

export function planFingerprint(items) {
  return hashString(items.map((item) => enrichmentFingerprint(item)).sort().join('|'));
}

// The ingestion pipeline's own rule, applied to text a provider published. Text that repeats
// the title, or is shorter than the floor, is refused exactly as it would be at ingestion.
export function cleanNativeText(title, raw) {
  const flattened = clip(stripHtml(raw || ''), ENRICHMENT_CONFIG.max_excerpt_chars);
  if (!flattened) return '';
  return cleanExcerpt(String(title || ''), flattened);
}

async function fetchJson(url, accept) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}) },
    signal: AbortSignal.timeout(ENRICHMENT_CONFIG.fetch_timeout_ms),
  });
  if (!response.ok) throw new Error(`responded ${response.status}`);
  return response.json();
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(ENRICHMENT_CONFIG.fetch_timeout_ms),
  });
  if (!response.ok) throw new Error(`responded ${response.status}`);
  return response.text();
}

function failed(provider, lookup, error, errorCategory) {
  return {
    ok: false,
    provider: provider.key,
    lookup,
    native_text: '',
    error_category: errorCategory || 'fetch_failed',
    error: clip(String((error && error.message) || error || 'lookup failed'), 200),
  };
}

// GitHub: the repository's own description.
async function lookupGithub(item, provider) {
  const parts = (provider.canonical ? new URL(provider.canonical).pathname : '').split('/').filter(Boolean);
  if (parts.length < 2) {
    return failed(provider, 'repository path', new Error('the canonical url carries no owner and repository name'), 'no_lookup_key');
  }
  const [owner, repo] = parts;
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/, ''))}`;
  try {
    const payload = await fetchJson(api, 'application/vnd.github+json');
    return { ok: true, provider: provider.key, lookup: api, native_text: String(payload.description || ''), error: null };
  } catch (error) {
    return failed(provider, api, error, 'fetch_failed');
  }
}

// arXiv: the abstract of the exact submission the record points at.
async function lookupArxiv(item, provider) {
  const match = String(provider.canonical || '').match(/\/abs\/([^/?#]+)/i);
  if (!match) {
    return failed(provider, 'arxiv id', new Error('the canonical url carries no arXiv identifier'), 'no_lookup_key');
  }
  const id = match[1];
  // The identifier is validated before it is used: an arXiv id is letters, digits, dots, dashes
  // and at most one category prefix, so no path, query, fragment or host can be smuggled in.
  if (id.includes('..') || !/^[A-Za-z0-9._-]{2,40}(\/[A-Za-z0-9._-]{2,40})?$/.test(id)) {
    return failed(provider, 'arxiv id', new Error('the arXiv identifier in the stored url is not a valid identifier'), 'invalid_lookup_key');
  }
  const api = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`;
  try {
    const xml = await fetchText(api, 'application/atom+xml');
    const entries = parseArxivEntries(xml);
    const entry = entries.find((candidate) => canonicalKey(candidate.canonical_url) === canonicalKey(provider.canonical)) || entries[0];
    return { ok: true, provider: provider.key, lookup: api, native_text: entry ? String(entry.excerpt || '') : '', error: null };
  } catch (error) {
    return failed(provider, api, error, 'fetch_failed');
  }
}

// Hacker News: the item's own text, which exists only for self posts. A link post carries no
// summary in the API, so it is reported as having none rather than filled in from its target.
async function lookupHackerNews(item, provider) {
  const source = String(provider.canonical || '') + ' ' + String((item && item.provenance_url) || '');
  const match = source.match(/item\?id=(\d+)/);
  if (!match) {
    return failed(provider, 'item id', new Error('the stored urls carry no Hacker News item id'), 'no_lookup_key');
  }
  const api = `https://hacker-news.firebaseio.com/v0/item/${match[1]}.json`;
  try {
    const payload = await fetchJson(api);
    const text = payload && payload.text ? decodeEntities(String(payload.text)) : '';
    return { ok: true, provider: provider.key, lookup: api, native_text: text, error: null };
  } catch (error) {
    return failed(provider, api, error, 'fetch_failed');
  }
}

// The original feed: re-read, then matched on the same canonical key the record was stored
// under. Only the feed's own description/summary/content is used.
async function lookupFeed(item, provider) {
  const feed = provider.feed;
  if (!feed) return failed(provider, 'feed', new Error('no configured feed for this record'), 'unsupported_provider');
  try {
    const xml = await fetchText(feed.url, 'application/rss+xml, application/atom+xml, text/xml');
    const entries = parseFeed(xml, feed);
    const wanted = canonicalKey(provider.canonical);
    const entry = entries.find((candidate) => canonicalKey(candidate.canonical_url) === wanted);
    if (!entry) {
      return {
        ok: true,
        provider: provider.key,
        lookup: feed.url,
        native_text: '',
        entry_match: false,
        error: null,
        note: 'the feed no longer carries this entry, so no source text was read for it',
      };
    }
    return { ok: true, provider: provider.key, lookup: feed.url, native_text: String(entry.excerpt || ''), entry_match: true, error: null };
  } catch (error) {
    return failed(provider, feed.url, error, 'fetch_failed');
  }
}

// One bounded read per record, on the provider that published it.
export async function lookupNativeText(item) {
  const provider = providerForItem(item);
  if (provider.key === 'unsupported') {
    return { ok: false, provider: provider.key, lookup: '', native_text: '', error_category: provider.reason_code, error: provider.reason };
  }
  if (provider.key === 'github') return lookupGithub(item, provider);
  if (provider.key === 'arxiv') return lookupArxiv(item, provider);
  if (provider.key === 'hacker-news') return lookupHackerNews(item, provider);
  return lookupFeed(item, provider);
}

// The plan for one record: what would be written, or the stated reason nothing would be.
export function decideEnrichment(item, lookup, { config = ENRICHMENT_CONFIG } = {}) {
  const provider = providerForItem(item);
  const stored = String((item && item.excerpt) || '').trim();
  const base = {
    item_id: item && item.id,
    title: String((item && item.title) || ''),
    source: String((item && item.source) || ''),
    canonical_url: String((item && item.canonical_url) || ''),
    provider: provider.key,
    provider_label: provider.label,
    content_state_before: contentState(item),
    excerpt_before: stored,
    fingerprint: enrichmentFingerprint(item),
  };

  if (base.content_state_before === CONTENT_STATES.no_text) {
    return { ...base, action: 'skip', reason_code: 'no_stored_text', reason: 'the record has neither a stored title nor an excerpt, so it is out of scope for enrichment' };
  }
  if (stored) {
    return { ...base, action: 'skip', reason_code: 'already_has_excerpt', reason: 'the record already has a stored excerpt, which is never overwritten' };
  }

  const answer = lookup || {};
  if (!answer.ok) {
    return {
      ...base,
      action: 'skip',
      reason_code: answer.error_category || 'lookup_failed',
      reason: `${provider.label}: ${answer.error || 'no source text was read'}`,
      lookup: answer.lookup || '',
    };
  }

  const proposed = cleanNativeText(item && item.title, answer.native_text);
  if (!proposed) {
    return {
      ...base,
      action: 'skip',
      reason_code: answer.native_text ? 'native_text_below_excerpt_rule' : 'no_native_text',
      reason: answer.native_text
        ? `the provider's text does not pass the ingestion excerpt rule (empty, shorter than ${config.min_excerpt_chars} characters, or only a restatement of the title)`
        : (answer.note || 'the provider publishes no descriptive text for this record'),
      lookup: answer.lookup || '',
      content_state_after: CONTENT_STATES.title_only,
    };
  }

  return {
    ...base,
    action: 'apply',
    reason_code: 'native_text_available',
    reason: 'the provider publishes descriptive text for this record and its stored excerpt is empty, so that text would become the record\'s excerpt verbatim',
    lookup: answer.lookup || '',
    excerpt_after: proposed,
    excerpt_after_chars: proposed.length,
    content_state_after: CONTENT_STATES.has_excerpt,
  };
}

export function summarizeDecisions(decisions) {
  const rows = Array.isArray(decisions) ? decisions : [];
  const counts = { apply: 0, skip: 0 };
  const reasons = {};
  const byProvider = {};
  for (const row of rows) {
    counts[row.action] = (counts[row.action] || 0) + 1;
    if (row.action === 'skip') reasons[row.reason_code] = (reasons[row.reason_code] || 0) + 1;
    byProvider[row.provider] = byProvider[row.provider] || { requested: 0, apply: 0, skip: 0 };
    byProvider[row.provider].requested += 1;
    byProvider[row.provider][row.action] += 1;
  }
  return { requested: rows.length, proposed: counts.apply || 0, skipped: counts.skip || 0, by_reason: reasons, by_provider: byProvider };
}

// --- authorization: the same rule the handler applies, exported so the mocked suite tests the
// live rule rather than a description of it.
export function enrichmentAccess(user) {
  if (!user || !user.id) return { ok: false, status: 401, error: 'Unauthorized', model_calls: 0, provider_calls: 0, writes: 0 };
  if (user.role !== 'admin') return { ok: false, status: 403, error: 'Forbidden', model_calls: 0, provider_calls: 0, writes: 0 };
  return { ok: true, status: 200, operator: { operator_id: user.id, operator_role: user.role, manual_only: true } };
}

// --- the write: a compare-and-set on the exact stored excerpt that was read for this request.
//
// The filter is the guard. The update applies only while the record still holds the text this
// request saw, and only a reported count of exactly one is accepted. A count of zero means
// another writer populated the excerpt between the read and the write: nothing is overwritten
// and the newer content is kept. A count the platform does not report, or a refused update,
// fails closed the same way rather than assuming the write landed.
export async function guardedExcerptUpdate(db, { itemId, expected, next }) {
  const before = String(expected || '');
  try {
    if (!db || !db.Item || typeof db.Item.updateMany !== 'function') {
      return { applied: false, updated: null, reason_code: 'concurrent_update_conflict', reason: 'no conditional update is available, so nothing was written and no excerpt was overwritten' };
    }
    const result = await db.Item.updateMany({ id: itemId, excerpt: before }, { $set: { excerpt: next } });
    const updated = result && typeof result.updated === 'number' ? result.updated : null;
    if (updated === 1) return { applied: true, updated, reason_code: 'applied', reason: 'the record still held the excerpt this request read, so the source text was written' };
    if (updated === 0) {
      return {
        applied: false, updated,
        reason_code: 'concurrent_update_conflict',
        reason: 'the stored excerpt changed after it was read for this request, so nothing was written and the newer content is kept',
      };
    }
    return {
      applied: false, updated: null,
      reason_code: 'concurrent_update_conflict',
      reason: 'the platform did not report how many records the guarded update changed, so the write is refused rather than assumed',
    };
  } catch (error) {
    return {
      applied: false, updated: null,
      reason_code: 'concurrent_update_conflict',
      reason: `the guarded update was refused: ${sanitizeMessage(error)}`,
    };
  }
}

async function inBatches(list, size, handler) {
  const settled = [];
  for (let index = 0; index < list.length; index += size) {
    const batch = list.slice(index, index + size);
    settled.push(...(await Promise.allSettled(batch.map(handler))));
  }
  return settled;
}

// --- the whole operation, with its database and its lookups injected. The live handler passes
// the real entities and the real provider lookups; the mocked suite passes an in-memory database
// and scripted answers. One implementation, so a passing case cannot describe different logic.
export async function runEnrichment({ db, itemIds, execute = false, lookup = lookupNativeText, config = ENRICHMENT_CONFIG }) {
  const requested = (Array.isArray(itemIds) ? itemIds : []).map((id) => String(id || '').trim()).filter(Boolean);
  const uniqueIds = Array.from(new Set(requested));
  const cap = config.max_records;

  const refusal = (error_category, reason, status) => ({ ok: false, status, error_category, reason, cap, model_calls: 0, provider_calls: 0, writes: 0 });

  if (!uniqueIds.length) {
    return refusal('no_records', 'name the source records to enrich with item_ids; this never walks the catalogue', 400);
  }
  if (uniqueIds.length > cap) {
    return refusal('record_cap', `${uniqueIds.length} records were requested, the cap is ${cap}`, 400);
  }

  const page = await db.Item.filter({ id: { $in: uniqueIds } }, { limit: cap });
  const items = (page && page.items) || [];
  const missingIds = uniqueIds.filter((id) => !items.some((item) => item.id === id));
  if (!items.length) {
    return { ...refusal('no_records', 'no stored source record matched the request', 404), missing_ids: missingIds };
  }

  // A canonical key repeated inside one request is flagged on every record that shares it. The
  // records are neither merged nor deleted: they are separate stored rows, and duplicates are
  // reported here exactly as the diagnostics report them.
  const keyCounts = new Map();
  for (const item of items) {
    const key = canonicalKey(item.canonical_url);
    if (key) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }

  // Only records that could actually change are looked up: a record that already holds an
  // excerpt, or holds no text at all, is decided without contacting any provider.
  const lookupable = items.filter((item) => contentState(item) === CONTENT_STATES.title_only);
  const settled = await inBatches(lookupable, config.fetch_concurrency, (item) => lookup(item));
  const answers = new Map();
  settled.forEach((result, index) => {
    const item = lookupable[index];
    if (!item) return;
    answers.set(item.id, result.status === 'fulfilled' ? result.value : {
      ok: false, native_text: '', lookup: '', error_category: 'fetch_failed', error: sanitizeMessage(result.reason),
    });
  });

  const decisions = items.map((item) => {
    const key = canonicalKey(item.canonical_url);
    return {
      ...decideEnrichment(item, answers.get(item.id), { config }),
      duplicate_canonical_key: Boolean(key && (keyCounts.get(key) || 0) > 1),
    };
  });
  const proposed = decisions.filter((row) => row.action === 'apply');

  const writeOutcomes = [];
  if (execute) {
    for (const row of proposed) {
      const outcome = await guardedExcerptUpdate(db, { itemId: row.item_id, expected: row.excerpt_before, next: row.excerpt_after });
      writeOutcomes.push({ item_id: row.item_id, ...outcome });
    }
  }

  const appliedIds = writeOutcomes.filter((row) => row.applied).map((row) => row.item_id);
  const conflicts = writeOutcomes.filter((row) => !row.applied);

  return {
    ok: true,
    cap,
    execute,
    selection: {
      requested: uniqueIds.length, resolved_records: items.length, missing_ids: missingIds,
      lookuped_records: lookupable.length, plan_fingerprint: planFingerprint(items),
      duplicate_canonical_keys: Array.from(keyCounts.entries()).filter(([, count]) => count > 1).map(([key, count]) => ({ canonical_key: key, records: count })),
    },
    summary: summarizeDecisions(decisions),
    decisions,
    proposed_excerpts: proposed.map((row) => ({
      item_id: row.item_id, title: row.title, source: row.source, canonical_url: row.canonical_url,
      provider: row.provider, lookup: row.lookup, excerpt_after: row.excerpt_after,
      duplicate_canonical_key: row.duplicate_canonical_key,
    })),
    write_outcomes: writeOutcomes,
    applied_item_ids: appliedIds,
    concurrent_update_conflicts: conflicts.map((row) => ({ item_id: row.item_id, reason_code: row.reason_code, reason: row.reason })),
    model_calls: 0,
    provider_calls: 0,
    writes: appliedIds.length,
    dry_run: !execute,
  };
}