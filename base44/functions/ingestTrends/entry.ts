// Trends ingestion: fetch -> normalise -> deduplicate -> store.
// Runs upstream of page rendering, never during a page view.
// Integrity rules: every stored value comes from the source itself; no metrics,
// creators or verification results are ever invented.
//
// Phase 3F: authorization comes from exactly one place - the authenticated principal the
// platform itself resolved for the request. A request with no user is not a scheduled call
// and is not trusted as one: it is refused. Nothing a caller controls is evidence of
// anything, because the caller wrote all of it - not a body field such as trigger_source, not
// a query parameter, not a header, and not a claim to be the scheduler. The platform
// documents no verifiable scheduler identity for a scheduled invocation, so the six-hour
// workflow is paused rather than left firing into a refusal, and ingestion now runs only when
// an administrator invokes it. The design is stated once in shared/ingestionAuth.ts.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { INGESTION_AUTH_DESIGN, INGESTION_LIMITATIONS, ingestionAccess } from '../../shared/ingestionAuth.ts';
import { PROVIDERS } from '../../shared/providers/index.ts';
import { TREND_SEEDS, TOPIC_SEEDS, classify } from '../../shared/taxonomy.ts';
import {
  canonicalKey, titleKey, computeScore, detectUncertain, safeUrl,
  clip, cleanExcerpt, toIso,
} from '../../shared/normalize.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;
const KEY_CHUNK = 80;

async function chunked(list, size, handler) {
  for (let index = 0; index < list.length; index += size) {
    await handler(list.slice(index, index + size));
  }
}

function momentumFor(total, recent) {
  if (!total) return 'steady';
  const share = recent / total;
  if (share >= 0.75) return 'surging';
  if (share >= 0.45) return 'rising';
  if (share < 0.15) return 'cooling';
  return 'steady';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // The one authorization input: the principal the platform resolved from the request. A
    // missing user, a non-administrator and a caller claiming to be the scheduler all reach
    // the same refusal here - before any record is created, any source is contacted or
    // anything is written - so a refused request costs nothing and leaves no trace in the
    // database beyond this function's own runtime log line.
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    const access = ingestionAccess(user);
    if (!access.ok) {
      console.log(JSON.stringify({
        ingestion_audit: 'refused_before_any_work',
        error_category: access.error_category,
        status: access.status,
        scheduler_identity_documented: INGESTION_AUTH_DESIGN.scheduler_identity_documented,
        schedule_state: INGESTION_AUTH_DESIGN.schedule_state,
        at: new Date().toISOString(),
      }));
      return Response.json({
        ok: false,
        error_category: access.error_category,
        error: access.error,
        authorization: {
          accepted_proofs: INGESTION_AUTH_DESIGN.accepted_proofs,
          rejected_proofs: INGESTION_AUTH_DESIGN.rejected_proofs,
          scheduler_identity_documented: INGESTION_AUTH_DESIGN.scheduler_identity_documented,
          schedule_state: INGESTION_AUTH_DESIGN.schedule_state,
          fallback: INGESTION_AUTH_DESIGN.fallback,
        },
        model_calls: 0,
        provider_calls: 0,
        writes: 0,
      }, { status: access.status });
    }

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    // A caller-supplied trigger source is a label for the audit trail and nothing else: it
    // grants no access and selects no behaviour. The run is recorded as what it was - a
    // request an administrator made by hand - and the caller's own label is reported beside it.
    const requestedTriggerSource = clip(body && body.trigger_source, 40);
    const triggerSource = 'manual';

    const db = base44.asServiceRole.entities;
    const run = await db.IngestionRun.create({
      started_at: new Date().toISOString(),
      status: 'running',
      trigger_source: triggerSource,
    });

    // 1. Fetch each provider independently; a failing source never stops the run.
    const sourceResults = [];
    const raw = [];
    for (const provider of PROVIDERS) {
      try {
        const items = await provider.fetchItems();
        for (const item of items) raw.push({ ...item, default_trend: provider.defaultTrend });
        sourceResults.push({ key: provider.key, label: provider.label, status: 'ok', fetched: items.length });
      } catch (error) {
        sourceResults.push({
          key: provider.key,
          label: provider.label,
          status: 'error',
          fetched: 0,
          error: String((error && error.message) || error).slice(0, 200),
        });
      }
    }

    // 2. Normalise, clip, classify and score. Nothing is stored unvalidated.
    const seen = new Set();
    const candidates = [];
    for (const entry of raw) {
      const url = safeUrl(entry.canonical_url);
      if (!url) continue;
      const key = canonicalKey(url);
      if (!key || seen.has(key)) continue;

      const title = clip(String(entry.title || '').replace(/\s+/g, ' ').trim(), 200);
      const title_key = titleKey(title);
      if (title.length < 12 || !title_key) continue;

      seen.add(key);
      const excerpt = cleanExcerpt(title, entry.excerpt);
      const classification = classify(`${title} ${excerpt}`, entry.default_trend);
      const metricValue = Number(entry.metric_value) || 0;
      const published = toIso(entry.published_at) || new Date().toISOString();
      const thumbnail = safeUrl(entry.thumbnail_url);

      candidates.push({
        title,
        excerpt,
        canonical_url: url,
        canonical_key: key,
        title_key,
        source: entry.source,
        source_key: entry.source_key,
        format: entry.format,
        creator: entry.creator ? clip(String(entry.creator), 120) : '',
        published_at: published,
        thumbnail_url: thumbnail,
        media_kind: thumbnail ? (entry.media_kind || 'landscape') : 'none',
        duration_seconds: entry.duration_seconds || undefined,
        metric_label: entry.metric_label || '',
        metric_value: metricValue,
        metrics: entry.metrics || {},
        verification: 'unverified',
        claim_uncertain: detectUncertain(`${title} ${excerpt}`),
        provenance_url: safeUrl(entry.provenance_url) || '',
        provenance_label: entry.provenance_label || '',
        tags: classification.tags,
        trend_slug: classification.trend_slug,
        topic_slug: classification.topic_slug,
        score: computeScore(published, metricValue),
        run_id: run.id,
      });
    }

    // 3. Deduplicate against what is already stored: canonical URL first, then title.
    const existingByKey = new Map();
    await chunked(candidates.map((item) => item.canonical_key), KEY_CHUNK, async (keys) => {
      const page = await db.Item.filter({ canonical_key: { $in: keys } }, {
        limit: 200,
        fields: ['id', 'canonical_key', 'metric_value', 'score', 'excerpt'],
      });
      for (const row of page.items || []) existingByKey.set(row.canonical_key, row);
    });

    const fresh = candidates.filter((item) => !existingByKey.has(item.canonical_key));
    const knownTitles = new Set();
    await chunked(fresh.map((item) => item.title_key), KEY_CHUNK, async (keys) => {
      const page = await db.Item.filter({ title_key: { $in: keys } }, {
        limit: 200,
        fields: ['title_key'],
      });
      for (const row of page.items || []) knownTitles.add(row.title_key);
    });

    const toCreate = fresh.filter((item) => !knownTitles.has(item.title_key));
    let created = 0;
    await chunked(toCreate, BATCH, async (batch) => {
      await db.Item.bulkCreate(batch);
      created += batch.length;
    });

    // 4. Refresh source-reported values for items we already hold.
    const updates = [];
    for (const item of candidates) {
      const row = existingByKey.get(item.canonical_key);
      if (!row) continue;
      if (Number(row.metric_value) !== item.metric_value || row.score !== item.score) {
        const update = {
          id: row.id,
          metric_value: item.metric_value,
          metrics: item.metrics,
          score: item.score,
          title: item.title,
          tags: item.tags,
          trend_slug: item.trend_slug,
          topic_slug: item.topic_slug,
          claim_uncertain: item.claim_uncertain,
        };
        // A stored excerpt is only ever replaced by a longer source-native one: a feed that has
        // dropped its description must not erase text this catalogue already holds.
        if (item.excerpt && item.excerpt.length >= String(row.excerpt || '').length) {
          update.excerpt = item.excerpt;
        }
        updates.push(update);
      }
    }
    let updated = 0;
    await chunked(updates, BATCH, async (batch) => {
      await db.Item.bulkUpdate(batch);
      updated += batch.length;
    });

    // 5. Recompute Trend / Topic records from what is actually stored.
    const iso7 = new Date(Date.now() - 7 * DAY_MS).toISOString();
    const [totalRows, recentRows, topicRows] = await Promise.all([
      db.Item.aggregate({ groupBy: 'trend_slug' }),
      db.Item.aggregate({ query: { published_at: { $gte: iso7 } }, groupBy: 'trend_slug' }),
      db.Item.aggregate({ groupBy: 'topic_slug' }),
    ]);
    const totalByTrend = new Map((totalRows.rows || []).map((row) => [row.trend_slug, row.count]));
    const recentByTrend = new Map((recentRows.rows || []).map((row) => [row.trend_slug, row.count]));
    const countByTopic = new Map((topicRows.rows || []).map((row) => [row.topic_slug, row.count]));

    const trendRecords = TREND_SEEDS.map((seed) => {
      const total = totalByTrend.get(seed.slug) || 0;
      const recent = recentByTrend.get(seed.slug) || 0;
      const momentum = momentumFor(total, recent);
      return {
        ...seed,
        item_count: total,
        recent_count: recent,
        momentum,
        status: total === 0 ? 'quiet' : momentum === 'surging' ? 'emerging' : 'active',
        momentum_basis: `${recent} of ${total} items were published in the last 7 days`,
        claim_type: false,
        verification: 'unverified',
        verification_note: 'Items link to their original sources; claims are not independently verified by this product.',
      };
    });
    await db.Trend.upsert(trendRecords, { key: 'slug' });

    const topicRecords = TOPIC_SEEDS.map((seed) => ({
      ...seed,
      item_count: countByTopic.get(seed.slug) || 0,
    }));
    await db.Topic.upsert(topicRecords, { key: 'slug' });

    const okSources = sourceResults.filter((result) => result.status === 'ok').length;
    const status = okSources === 0 ? 'failed' : okSources < sourceResults.length ? 'partial' : 'success';

    await db.IngestionRun.update(run.id, {
      finished_at: new Date().toISOString(),
      status,
      fetched: raw.length,
      created,
      skipped: raw.length - created,
      source_results: sourceResults,
      note: `${candidates.length} distinct items normalised from ${sourceResults.length} sources; requested by an authenticated administrator${requestedTriggerSource ? ` (caller label: ${requestedTriggerSource})` : ''}`,
    });

    return Response.json({
      ok: true,
      run_id: run.id,
      status,
      authorization: {
        ...access.operator,
        requested_trigger_source: requestedTriggerSource,
        trigger_source_recorded: triggerSource,
      },
      scheduler_identity_documented: INGESTION_AUTH_DESIGN.scheduler_identity_documented,
      schedule_state: INGESTION_AUTH_DESIGN.schedule_state,
      fetched: raw.length,
      normalised: candidates.length,
      created,
      updated,
      skipped: raw.length - created,
      sources: sourceResults,
      limitations: INGESTION_LIMITATIONS,
    });
  } catch (error) {
    return Response.json({ error: String((error && error.message) || error) }, { status: 500 });
  }
}