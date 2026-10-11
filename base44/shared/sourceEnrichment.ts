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

export const ENRICHMENT_CONFIG = {
  // Bounded and manual: at most this many records per request, and only when an administrator
  // names them explicitly and asks for execution.
  max_records: 12,
  fetch_timeout_ms: 15000,
  fetch_concurrency: 4,
  // The floor cleanExcerpt itself applies: shorter source text is reported, not stored.
  min_excerpt_chars: 40,
  max_excerpt_chars: 260,
  update_fields: ['excerpt'],
  dry_run_default: true,
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