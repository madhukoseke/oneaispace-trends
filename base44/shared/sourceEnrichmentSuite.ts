// The mocked test suite for Phase 3A source enrichment.
//
// Every case runs against an in-memory database and scripted lookups, so no provider is
// contacted, no credential is used, no record is written and no model is called. The cases
// exercise the same functions the live handler calls - runEnrichment, guardedExcerptUpdate,
// enrichmentAccess, lookupNativeText, the diagnostics report - so a passing case cannot
// describe logic the live path does not use.
//
// The network cases stub global fetch and assert the exact url that would be requested, which
// is how the allowlist is verified without making a single outbound request.

import { ENRICHMENT_CONFIG, ENRICHMENT_NETWORK_POLICY, cleanNativeText, decideEnrichment, enrichmentAccess, enrichmentFingerprint, guardedExcerptUpdate, lookupNativeText, providerForItem, runEnrichment, summarizeDecisions } from './sourceEnrichment.ts';
import { ENRICHMENT_CANDIDATE_LIMIT, summarizeSourceQuality } from './sourceQuality.ts';
import { RSS_FEEDS } from './sources.ts';
import { createCaseRecorder } from './pipelineSupport.ts';

const LONG_TEXT = 'A repository for running local agent workflows: it wraps tool calls in a deterministic scheduler and records every step, so a failing run can be replayed exactly as it happened.';

function item(overrides = {}) {
  return {
    id: 'itm_base', source: 'GitHub', source_key: 'github', title: 'example/agent-runner',
    excerpt: '', canonical_url: 'https://github.com/example/agent-runner', published_at: '2026-10-10T10:00:00.000Z',
    ...overrides,
  };
}

function githubTitleOnly() {
  return item({ id: 'itm_gh', title: 'NousResearch/hermes-agent', canonical_url: 'https://github.com/NousResearch/hermes-agent' });
}

function rssWithExcerpt() {
  return item({
    id: 'itm_rss', source: 'OpenAI', source_key: 'openai', title: 'Introducing a new reasoning mode',
    excerpt: 'The lab describes a slower reasoning mode that spends more tokens before answering.',
    canonical_url: 'https://openai.com/index/new-reasoning-mode',
  });
}

function anonymousSource() {
  return item({
    id: 'itm_mystery', source: 'Mystery News', source_key: 'mystery', title: 'Something shipped that nobody described',
    canonical_url: 'https://mystery.example.org/a-thing',
  });
}

function duplicatePair() {
  return [
    item({ id: 'itm_dup_a', title: 'A duplicated record', canonical_url: 'https://github.com/example/dup?utm_source=feed' }),
    item({ id: 'itm_dup_b', title: 'A duplicated record', canonical_url: 'https://github.com/example/dup' }),
  ];
}

// An in-memory database with the same surface the live path uses. `beforeUpdateMany` lets a case
// simulate a competing writer landing between the read and the guarded write.
function makeFakeDb(items, hooks = {}) {
  const state = {
    items: (items || []).map((row) => ({ ...row })),
    reads: [],
    writes: [],
    analysis_touched: [],
    analysis_fixtures: {
      DevDevelopment: [{ development_id: 'dev_kept', title: 'GPT-6 Astra Ultrafast available in OpenAI API', status: 'accepted', run_id: 'run_kept' }],
      DevAnalysisRun: [{ run_id: 'run_kept', action: 'analyze', status: 'success', claim_state: 'consumed' }],
      DevClaim: [{ claim_id: 'claim_kept', development_id: 'dev_kept', evidence_quote: 'GPT-6 Astra Ultrafast is available in the OpenAI API today.' }],
      DevAnalysisCache: [{ fingerprint: 'fp_kept', run_id: 'run_kept', item_fingerprints: ['ifp_kept'] }],
    },
  };

  const matches = (row, filter) => {
    if (filter.id !== undefined && filter.id !== row.id) return false;
    if (typeof filter.excerpt === 'string' && String(row.excerpt || '') !== filter.excerpt) return false;
    return true;
  };

  const itemApi = {
    filter: async (query = {}, options = {}) => {
      state.reads.push({ collection: 'Item', query });
      const ids = query.id && Array.isArray(query.id.$in) ? query.id.$in : null;
      const found = state.items.filter((row) => (ids ? ids.includes(row.id) : matches(row, query)));
      return { items: found.slice(0, options.limit || 50), next_cursor: undefined, has_more: false };
    },
    update: async (id, data) => {
      state.writes.push({ collection: 'Item', op: 'update', id, data });
      const row = state.items.find((entry) => entry.id === id);
      if (row) Object.assign(row, data);
      return row || null;
    },
    updateMany: async (filter, update) => {
      if (typeof hooks.beforeUpdateMany === 'function') hooks.beforeUpdateMany(state);
      state.writes.push({ collection: 'Item', op: 'updateMany', filter, update });
      if (hooks.updateManyResult) return hooks.updateManyResult;
      const hits = state.items.filter((row) => matches(row, filter));
      for (const row of hits) Object.assign(row, update.$set || {});
      return { updated: hits.length };
    },
    delete: async (id) => { state.writes.push({ collection: 'Item', op: 'delete', id }); return null; },
    deleteMany: async (filter) => { state.writes.push({ collection: 'Item', op: 'deleteMany', filter }); return { deleted: 0 }; },
  };

  // Every other collection records any attempted write, so preservation is asserted rather than
  // assumed: nothing in this path is supposed to touch analysis, ingestion, trend or topic rows.
  const guardedApi = (name) => ({
    filter: async () => { state.analysis_touched.push({ collection: name, op: 'filter' }); return { items: state.analysis_fixtures[name] || [], has_more: false }; },
    get: async (id) => { state.analysis_touched.push({ collection: name, op: 'get', id }); return null; },
    create: async (data) => { state.analysis_touched.push({ collection: name, op: 'create', data }); return null; },
    update: async (id, data) => { state.analysis_touched.push({ collection: name, op: 'update', id, data }); return null; },
    updateMany: async (filter, update) => { state.analysis_touched.push({ collection: name, op: 'updateMany', filter, update }); return { updated: 0 }; },
    delete: async (id) => { state.analysis_touched.push({ collection: name, op: 'delete', id }); return null; },
    deleteMany: async (filter) => { state.analysis_touched.push({ collection: name, op: 'deleteMany', filter }); return { deleted: 0 }; },
  });

  const db = { Item: itemApi };
  for (const name of ['Trend', 'Topic', 'IngestionRun', 'DevAnalysisRun', 'DevDevelopment', 'DevClaim', 'DevAnalysisCache']) {
    db[name] = guardedApi(name);
  }
  return { db, state };
}

function scriptedLookup(answers) {
  const calls = [];
  const lookup = async (row) => {
    calls.push(row.id);
    const answer = answers[row.id];
    if (!answer) return { ok: false, provider: providerForItem(row).key, lookup: '', native_text: '', error_category: 'no_native_text', error: 'nothing scripted for this record' };
    return answer;
  };
  lookup.calls = calls;
  return lookup;
}

// Runs the real lookup functions with outbound fetch disabled: whatever url they would request
// is recorded, and the request itself throws, so no provider is ever reached.
async function withStubbedFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: (options && options.method) || 'GET' });
    throw new Error('outbound fetch is disabled in this suite');
  };
  try {
    const result = await handler();
    return { result, calls };
  } finally {
    globalThis.fetch = original;
  }
}

export async function runEnrichmentSuite() {
  const cases = [];
  const record = createCaseRecorder(cases);

  // --- 1. authorization -------------------------------------------------------------------
  await record('access.only_administrators_may_call', async () => {
    const anonymous = enrichmentAccess(null);
    const nonAdmin = enrichmentAccess({ id: 'u2', role: 'user' });
    const admin = enrichmentAccess({ id: 'u1', role: 'admin' });
    return {
      ok: anonymous.ok === false && anonymous.status === 401
        && nonAdmin.ok === false && nonAdmin.status === 403
        && admin.ok === true && admin.operator.operator_role === 'admin',
      note: { anonymous: anonymous.status, non_admin: nonAdmin.status, admin: admin.ok },
    };
  });

  // --- 2. batch limits --------------------------------------------------------------------
  await record('limits.batch_cap_is_ten_records', async () => {
    const many = Array.from({ length: 11 }, (_, index) => item({ id: `itm_${index}`, title: `Record ${index}`, canonical_url: `https://github.com/example/repo-${index}` }));
    const { db } = makeFakeDb(many);
    // Two separate spies: one for the two refused calls, one for the accepted call, so a refusal
    // cannot be credited with the lookups the accepted run legitimately makes.
    const refusedLookup = scriptedLookup({});
    const eleven = await runEnrichment({ db, itemIds: many.map((row) => row.id), execute: true, lookup: refusedLookup });
    const empty = await runEnrichment({ db, itemIds: [], execute: true, lookup: refusedLookup });
    const { db: exactDb, state } = makeFakeDb(many.slice(0, 10));
    const acceptedLookup = scriptedLookup({});
    const ten = await runEnrichment({ db: exactDb, itemIds: many.slice(0, 10).map((row) => row.id), execute: true, lookup: acceptedLookup });
    return {
      ok: ENRICHMENT_CONFIG.max_records === 10
        && eleven.ok === false && eleven.error_category === 'record_cap' && eleven.writes === 0
        && empty.ok === false && empty.error_category === 'no_records'
        && ten.ok === true && ten.selection.requested === 10 && ten.selection.lookuped_records === 10
        && refusedLookup.calls.length === 0 && acceptedLookup.calls.length === 10
        && state.writes.length === 0 && state.analysis_touched.length === 0,
      note: {
        cap: ENRICHMENT_CONFIG.max_records, eleven: eleven.error_category, empty: empty.error_category,
        ten_ok: ten.ok, lookups_after_refusals: refusedLookup.calls.length,
        lookups_in_accepted_run: acceptedLookup.calls.length, writes_after_accepted_run: state.writes.length,
      },
    };
  });

  // --- 3. read-only diagnostics ------------------------------------------------------------
  await record('diagnostics.report_is_read_only_and_counts_content_states', async () => {
    const records = [githubTitleOnly(), rssWithExcerpt(), anonymousSource(), item({ id: 'itm_empty', title: '', excerpt: '', source_key: 'github', canonical_url: 'https://github.com/example/nothing' })];
    const { db, state } = makeFakeDb(records);
    const scan = await db.Item.filter({}, { limit: 200 });
    const report = summarizeSourceQuality({ records: scan.items, truncated: false, scan_cap: 5000 });
    return {
      ok: report.totals.records === 4 && report.totals.title_only === 2 && report.totals.has_excerpt === 1
        && report.totals.no_text === 1 && report.by_source.length >= 3
        && report.by_source.every((row) => typeof row.excerpt_coverage === 'number' && row.records > 0)
        && state.writes.length === 0 && state.analysis_touched.length === 0
        && report.enrichment_candidates.listed.length <= ENRICHMENT_CANDIDATE_LIMIT,
      note: {
        totals: report.totals, sources: report.by_source.map((row) => ({ source: row.source_key, records: row.records, has_excerpt: row.has_excerpt })),
        candidates_listed: report.enrichment_candidates.listed.length, db_writes: state.writes.length,
      },
    };
  });

  await record('diagnostics.duplicates_are_reported_and_never_deleted', async () => {
    const { db, state } = makeFakeDb(duplicatePair());
    const scan = await db.Item.filter({}, { limit: 200 });
    const report = summarizeSourceQuality({ records: scan.items, truncated: false, scan_cap: 5000 });
    return {
      ok: report.duplicates.duplicate_keys === 1 && report.duplicates.records_in_duplicate_groups === 2
        && report.duplicates.sample[0].count === 2
        && state.items.length === 2 && state.writes.filter((entry) => entry.op.includes('delete')).length === 0,
      note: { duplicates: report.duplicates.sample, records_after: state.items.length, deletes: state.writes.length },
    };
  });

  // --- 4. dry run performs no write --------------------------------------------------------
  await record('dry_run.proposes_writes_and_performs_none', async () => {
    const { db, state } = makeFakeDb([githubTitleOnly()]);
    const lookup = scriptedLookup({ itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null } });
    const run = await runEnrichment({ db, itemIds: ['itm_gh'], execute: false, lookup });
    return {
      ok: run.ok === true && run.dry_run === true && run.summary.proposed === 1 && run.writes === 0
        && run.write_outcomes.length === 0 && state.writes.length === 0
        && state.items[0].excerpt === ''
        && run.proposed_excerpts[0].excerpt_after === cleanNativeText(state.items[0].title, LONG_TEXT)
        && run.proposed_excerpts[0].excerpt_after.length > 40
        && state.analysis_touched.length === 0,
      note: { proposed: run.summary.proposed, writes: state.writes.length, stored_excerpt: state.items[0].excerpt, proposed_chars: run.proposed_excerpts[0].excerpt_after.length },
    };
  });

  // --- 5. provider failures and rate limiting ----------------------------------------------
  await record('providers.failures_and_rate_limits_are_reported_not_retried', async () => {
    const rows = [
      item({ id: 'itm_ok', title: 'example/ok', canonical_url: 'https://github.com/example/ok' }),
      item({ id: 'itm_500', title: 'example/failing', canonical_url: 'https://github.com/example/failing' }),
      item({ id: 'itm_429', title: 'example/limited', canonical_url: 'https://github.com/example/limited' }),
      item({ id: 'itm_throw', title: 'example/throwing', canonical_url: 'https://github.com/example/throwing' }),
    ];
    const { db, state } = makeFakeDb(rows);
    const lookup = scriptedLookup({
      itm_ok: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/example/ok', native_text: LONG_TEXT, error: null },
      itm_500: { ok: false, provider: 'github', lookup: 'https://api.github.com/repos/example/failing', native_text: '', error_category: 'fetch_failed', error: 'responded 500' },
      itm_429: { ok: false, provider: 'github', lookup: 'https://api.github.com/repos/example/limited', native_text: '', error_category: 'rate_limited', error: 'responded 429' },
    });
    const throwing = async (row) => {
      if (row.id === 'itm_throw') throw new Error('the provider connection failed');
      return lookup(row);
    };
    const run = await runEnrichment({ db, itemIds: rows.map((row) => row.id), execute: true, lookup: throwing });
    const byId = Object.fromEntries(run.decisions.map((row) => [row.item_id, row]));
    return {
      ok: byId.itm_ok.action === 'apply' && run.writes === 1
        && byId.itm_500.reason_code === 'fetch_failed' && !byId.itm_500.lookup.includes('undefined')
        && byId.itm_429.reason_code === 'rate_limited'
        && byId.itm_throw.reason_code === 'fetch_failed'
        && state.writes.filter((entry) => entry.op === 'updateMany').length === 1
        && run.decisions.filter((row) => row.action === 'skip').length === 3,
      note: {
        outcomes: run.decisions.map((row) => ({ id: row.item_id, action: row.action, reason: row.reason_code })),
        writes: state.writes.filter((entry) => entry.op === 'updateMany').length,
      },
    };
  });

  // --- 6. unsupported sources are never fetched --------------------------------------------
  await record('network.unsupported_source_is_never_fetched', async () => {
    const row = anonymousSource();
    const { db } = makeFakeDb([row]);
    const { result: run, calls } = await withStubbedFetch(() => runEnrichment({ db, itemIds: [row.id], execute: true, lookup: lookupNativeText }));
    return {
      ok: providerForItem(row).key === 'unsupported' && run.writes === 0
        && run.decisions[0].reason_code === 'unsupported_provider' && calls.length === 0,
      note: { provider: providerForItem(row).key, decision: run.decisions[0].reason_code, outbound_calls: calls.length },
    };
  });

  // --- network allowlist: the exact urls the real lookups would request --------------------
  await record('network.github_lookup_uses_only_the_stored_path', async () => {
    const row = item({ id: 'itm_gh3', title: 'NousResearch/hermes-agent', canonical_url: 'https://github.com/NousResearch/hermes-agent?utm_source=feed#readme' });
    const { result: answer, calls } = await withStubbedFetch(() => lookupNativeText(row));
    const noParts = item({ id: 'itm_gh4', source_key: 'github', title: 'A bare github url', canonical_url: 'https://github.com/' });
    const { result: bare, calls: bareCalls } = await withStubbedFetch(() => lookupNativeText(noParts));
    return {
      ok: calls.length === 1 && calls[0].url === 'https://api.github.com/repos/NousResearch/hermes-agent'
        && !calls[0].url.includes('utm_source') && new URL(calls[0].url).hostname === 'api.github.com'
        && answer.ok === false && answer.error_category === 'fetch_failed'
        && bare.ok === false && bare.error_category === 'no_lookup_key' && bareCalls.length === 0,
      note: { requested_url: calls[0] ? calls[0].url : null, bare_record: { error: bare.error_category, calls: bareCalls.length } },
    };
  });

  await record('network.arxiv_identifier_is_validated_before_use', async () => {
    const valid = item({ id: 'itm_ax', source_key: 'arxiv', source: 'arXiv', title: 'Quine: a system for reproducible agent traces', canonical_url: 'https://arxiv.org/abs/2401.12345v2' });
    const traversal = item({ id: 'itm_ax2', source_key: 'arxiv', title: 'A paper about something', canonical_url: 'https://arxiv.org/abs/..%2F..%2Fetc%2Fpasswd' });
    const injection = item({ id: 'itm_ax3', source_key: 'arxiv', title: 'A paper about something else', canonical_url: 'https://arxiv.org/abs/cs%2F0701001%3Fx%3D1' });
    const { result: good, calls } = await withStubbedFetch(() => lookupNativeText(valid));
    const { result: bad, calls: badCalls } = await withStubbedFetch(() => lookupNativeText(traversal));
    const { result: third, calls: thirdCalls } = await withStubbedFetch(() => lookupNativeText(injection));
    return {
      ok: calls.length === 1 && calls[0].url.startsWith('https://export.arxiv.org/api/query?id_list=2401.12345v2')
        && new URL(calls[0].url).hostname === 'export.arxiv.org'
        && badCalls.length === 0 && bad.error_category === 'invalid_lookup_key'
        && thirdCalls.length === 0 && third.error_category === 'invalid_lookup_key',
      note: { valid_url: calls[0] ? calls[0].url : null, traversal: { error: bad.error_category, calls: badCalls.length }, injection: { error: third.error_category, calls: thirdCalls.length } },
    };
  });

  await record('network.hacker_news_and_feeds_only_use_configured_endpoints', async () => {
    const hn = item({ id: 'itm_hn', source_key: 'hacker-news', source: 'Hacker News', title: 'Ask HN: how do you trace agent runs?', canonical_url: 'https://news.ycombinator.com/item?id=12345' });
    const hnBad = item({ id: 'itm_hn2', source_key: 'hacker-news', title: 'Ask HN: something else', canonical_url: 'https://news.ycombinator.com/item?id=abc' });
    const feed = item({ id: 'itm_feed', source_key: 'openai', source: 'OpenAI', title: 'A lab announcement', canonical_url: 'https://evil.example.org/somewhere/else' });
    const { result: first, calls: hnCalls } = await withStubbedFetch(() => lookupNativeText(hn));
    const { result: second, calls: badCalls } = await withStubbedFetch(() => lookupNativeText(hnBad));
    const { result: third, calls: feedCalls } = await withStubbedFetch(() => lookupNativeText(feed));
    const feedUrl = RSS_FEEDS.find((entry) => entry.key === 'openai').url;
    return {
      ok: hnCalls.length === 1 && hnCalls[0].url === 'https://hacker-news.firebaseio.com/v0/item/12345.json'
        && badCalls.length === 0 && second.error_category === 'no_lookup_key'
        && feedCalls.length === 1 && feedCalls[0].url === feedUrl && !feedCalls[0].url.includes('evil.example')
        && first.ok === false && third.ok === false,
      note: { hacker_news_url: hnCalls[0] ? hnCalls[0].url : null, unknown_id: { error: second.error_category, calls: badCalls.length }, feed_url: feedCalls[0] ? feedCalls[0].url : null, record_host_ignored: !feedCalls[0]?.url.includes('evil.example') },
    };
  });

  await record('network.policy_lists_approved_endpoints_only', async () => {
    const hosts = ENRICHMENT_NETWORK_POLICY.approved_endpoints.map((entry) => {
      const match = entry.endpoint.match(/^https:\/\/([^/]+)/);
      return match ? match[1] : entry.endpoint;
    });
    return {
      ok: hosts.includes('api.github.com') && hosts.includes('export.arxiv.org')
        && hosts.includes('hacker-news.firebaseio.com') && hosts.length === 4
        && Boolean(ENRICHMENT_NETWORK_POLICY.refusals.canonical_page),
      note: { approved_hosts: hosts, refusals: ENRICHMENT_NETWORK_POLICY.refusals },
    };
  });

  // --- 7. idempotency ----------------------------------------------------------------------
  await record('idempotency.a_repeat_request_finds_nothing_to_do', async () => {
    const { db, state } = makeFakeDb([githubTitleOnly()]);
    const lookup = scriptedLookup({ itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null } });
    const first = await runEnrichment({ db, itemIds: ['itm_gh'], execute: true, lookup });
    const writesAfterFirst = state.writes.length;
    const lookupsAfterFirst = lookup.calls.length;
    const second = await runEnrichment({ db, itemIds: ['itm_gh'], execute: true, lookup });
    return {
      ok: first.writes === 1 && first.applied_item_ids.length === 1
        && second.writes === 0 && second.summary.proposed === 0
        && second.decisions[0].reason_code === 'already_has_excerpt'
        && lookup.calls.length === lookupsAfterFirst && state.writes.length === writesAfterFirst
        && state.items[0].excerpt === first.proposed_excerpts[0].excerpt_after,
      note: {
        first: { applied: first.writes, lookups: lookupsAfterFirst },
        second: { applied: second.writes, reason: second.decisions[0].reason_code, lookups: lookup.calls.length - lookupsAfterFirst },
      },
    };
  });

  await record('idempotency.fingerprints_track_the_stored_text', async () => {
    const before = enrichmentFingerprint(githubTitleOnly());
    const afterEnrichment = enrichmentFingerprint(item({ id: 'itm_gh', title: 'NousResearch/hermes-agent', canonical_url: 'https://github.com/NousResearch/hermes-agent', excerpt: LONG_TEXT }));
    const sameAgain = enrichmentFingerprint(item({ id: 'itm_gh', title: 'NousResearch/hermes-agent', canonical_url: 'https://github.com/NousResearch/hermes-agent', excerpt: LONG_TEXT }));
    return {
      ok: before !== afterEnrichment && afterEnrichment === sameAgain,
      note: { before, after: afterEnrichment, stable: afterEnrichment === sameAgain },
    };
  });

  // --- 8. duplicates inside one request ---------------------------------------------------
  await record('duplicates.in_one_request_are_flagged_not_merged', async () => {
    const { db, state } = makeFakeDb(duplicatePair());
    const lookup = scriptedLookup({
      itm_dup_a: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/example/dup', native_text: LONG_TEXT, error: null },
      itm_dup_b: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/example/dup', native_text: LONG_TEXT, error: null },
    });
    const run = await runEnrichment({ db, itemIds: ['itm_dup_a', 'itm_dup_b'], execute: true, lookup });
    return {
      ok: run.decisions.length === 2 && run.decisions.every((row) => row.duplicate_canonical_key === true)
        && run.selection.duplicate_canonical_keys.length === 1 && run.selection.duplicate_canonical_keys[0].records === 2
        && state.items.length === 2
        && state.writes.every((entry) => entry.op === 'updateMany')
        && state.writes.length === 2,
      note: {
        flagged: run.decisions.map((row) => ({ id: row.item_id, duplicate: row.duplicate_canonical_key, action: row.action })),
        duplicate_keys: run.selection.duplicate_canonical_keys, records_after: state.items.length, writes: state.writes.length,
      },
    };
  });

  // --- 9. concurrent excerpt updates ------------------------------------------------------
  await record('concurrency.a_newer_excerpt_survives_the_attempted_write', async () => {
    const { db, state } = makeFakeDb([githubTitleOnly()], {
      beforeUpdateMany: (inner) => {
        const row = inner.items.find((entry) => entry.id === 'itm_gh');
        row.excerpt = 'another writer stored this excerpt first';
      },
    });
    const lookup = scriptedLookup({ itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null } });
    const run = await runEnrichment({ db, itemIds: ['itm_gh'], execute: true, lookup });
    const stored = state.items[0].excerpt;
    return {
      ok: run.summary.proposed === 1 && run.writes === 0 && run.applied_item_ids.length === 0
        && run.concurrent_update_conflicts.length === 1 && run.concurrent_update_conflicts[0].reason_code === 'concurrent_update_conflict'
        && stored === 'another writer stored this excerpt first',
      note: { proposed: run.summary.proposed, applied: run.writes, conflict: run.concurrent_update_conflicts[0], stored_excerpt: stored },
    };
  });

  await record('concurrency.an_unreported_match_count_fails_closed', async () => {
    const { db, state } = makeFakeDb([githubTitleOnly()], { updateManyResult: {} });
    const lookup = scriptedLookup({ itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null } });
    const run = await runEnrichment({ db, itemIds: ['itm_gh'], execute: true, lookup });
    const guarded = await guardedExcerptUpdate({ Item: { updateMany: async () => { throw new Error('update refused'); } } }, { itemId: 'itm_gh', expected: '', next: 'x' });
    return {
      ok: run.writes === 0 && run.concurrent_update_conflicts.length === 1
        && state.items[0].excerpt === '' && state.writes.length === 1
        && guarded.applied === false && guarded.reason_code === 'concurrent_update_conflict',
      note: { applied: run.writes, conflict: run.concurrent_update_conflicts[0].reason_code, stored_excerpt: state.items[0].excerpt, thrown_update: guarded.reason_code },
    };
  });

  await record('concurrency.the_guard_is_part_of_the_update_itself', async () => {
    const { db, state } = makeFakeDb([githubTitleOnly()]);
    const lookup = scriptedLookup({ itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null } });
    const run = await runEnrichment({ db, itemIds: ['itm_gh'], execute: true, lookup });
    const write = state.writes.find((entry) => entry.op === 'updateMany');
    return {
      ok: run.writes === 1 && state.writes.length === 1 && Boolean(write)
        && write.filter.id === 'itm_gh' && write.filter.excerpt === ''
        && Object.keys(write.update.$set).length === 1 && Object.keys(write.update.$set)[0] === 'excerpt',
      note: { filter: write ? write.filter : null, set_fields: write ? Object.keys(write.update.$set) : [], applied: run.writes },
    };
  });

  // --- 10. only the excerpt is ever written, and nothing historical is touched --------------
  await record('writes.only_the_excerpt_field_is_written', async () => {
    const { db, state } = makeFakeDb([githubTitleOnly()]);
    const lookup = scriptedLookup({ itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null } });
    await runEnrichment({ db, itemIds: ['itm_gh'], execute: true, lookup });
    const unconditional = state.writes.filter((entry) => entry.op === 'update');
    return {
      ok: unconditional.length === 0 && state.writes.length === 1
        && JSON.stringify(Object.keys(state.writes[0].update.$set)) === JSON.stringify(['excerpt']),
      note: { unconditional_updates: unconditional.length, writes: state.writes.map((entry) => ({ op: entry.op, fields: Object.keys(entry.update ? entry.update.$set : entry.data || {}) })) },
    };
  });

  await record('history.analysis_and_ingestion_records_are_never_touched', async () => {
    const rows = [githubTitleOnly(), rssWithExcerpt(), anonymousSource(), ...duplicatePair()];
    const { db, state } = makeFakeDb(rows);
    const before = JSON.stringify(state.analysis_fixtures);
    const lookup = scriptedLookup({
      itm_gh: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/NousResearch/hermes-agent', native_text: LONG_TEXT, error: null },
      itm_dup_a: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/example/dup', native_text: LONG_TEXT, error: null },
      itm_dup_b: { ok: true, provider: 'github', lookup: 'https://api.github.com/repos/example/dup', native_text: LONG_TEXT, error: null },
    });
    const run = await runEnrichment({ db, itemIds: rows.map((row) => row.id), execute: true, lookup });
    const untouchedCollections = state.analysis_touched.length === 0;
    return {
      ok: run.ok === true && untouchedCollections && JSON.stringify(state.analysis_fixtures) === before
        && state.reads.every((entry) => entry.collection === 'Item')
        && state.writes.every((entry) => entry.collection === 'Item')
        && rows.filter((row) => row.source_key === 'openai').length === 1,
      note: {
        analysis_collections_touched: state.analysis_touched.length,
        fixtures_unchanged: JSON.stringify(state.analysis_fixtures) === before,
        collections_read: Array.from(new Set(state.reads.map((entry) => entry.collection))),
        collections_written: Array.from(new Set(state.writes.map((entry) => entry.collection))),
        applied: run.writes,
      },
    };
  });

  await record('history.an_existing_excerpt_is_never_replaced', async () => {
    const { db, state } = makeFakeDb([rssWithExcerpt()]);
    const lookup = scriptedLookup({ itm_rss: { ok: true, provider: 'rss:openai', lookup: 'https://openai.com/news/rss.xml', native_text: LONG_TEXT, error: null } });
    const run = await runEnrichment({ db, itemIds: ['itm_rss'], execute: true, lookup });
    const decision = decideEnrichment(rssWithExcerpt(), { ok: true, native_text: LONG_TEXT, lookup: 'x' });
    return {
      ok: run.writes === 0 && run.decisions[0].reason_code === 'already_has_excerpt'
        && lookup.calls.length === 0 && state.writes.length === 0
        && state.items[0].excerpt === rssWithExcerpt().excerpt
        && decision.action === 'skip' && summarizeDecisions(run.decisions).by_reason.already_has_excerpt === 1,
      note: { reason: run.decisions[0].reason_code, lookups: lookup.calls.length, stored_excerpt_unchanged: state.items[0].excerpt === rssWithExcerpt().excerpt },
    };
  });

  const passed = cases.filter((entry) => entry.ok).length;
  return {
    suite: 'phase3a-source-enrichment-suite',
    cases_run: cases.length,
    passed,
    failed: cases.length - passed,
    live_path_provider_calls: 0,
    live_path_writes: 0,
    cases,
  };
}