// Phase 2C: the public, read-only developments feed.
//
// Public: this function deliberately authenticates nobody, so it can serve the site's
// visitors. It is still the only thing exposed - the analysis entities keep their
// administrator-only access rules, and the feed never returns a record, only a projection of
// the fields listed in shared/devFeed.ts.
//
// Read-only: it performs three filters and nothing else. No write, no model call, no schedule,
// no mutation of any catalogue, Stage 1 or analysis entity.
//
// A development is returned only when its parent run proves it came from an explicitly
// authorized, successfully completed live analysis batch. Mocked-suite fixtures, dry runs,
// partial or failed runs, and records whose provenance is missing or ambiguous are excluded
// and counted, never shown.
//
// The payload accepts two optional fields. { limit } is clamped server-side. { development_id }
// asks for exactly one development by its stable identifier - the same identifier the list
// returns - and is answered through the same provenance and evidence checks; an identifier that
// is unknown, ambiguous or ineligible comes back as found: false with a reason, never as a
// partial record and never through an analysis entity.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  FEED_DISCLOSURE, FEED_LIMIT_DEFAULT, FEED_LIMIT_MAX, FEED_ORDERING, clampLimit, loadFeedInputs,
  resolveDevelopment, resolveFeed,
} from '../../shared/devFeed.ts';
import { sanitizeMessage } from '../../shared/modelAdapters.ts';

export default async function (req) {
  try {
    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }

    const base44 = createClientFromRequest(req);
    const limit = clampLimit(payload.limit);
    const developmentId = String(payload.development_id || '').trim();

    // Detail lookup: one development, resolved through the same provenance and evidence checks
    // the list applies. An unknown, ambiguous or ineligible identifier is answered as
    // unavailable rather than by reaching for an administrator-only analysis entity.
    if (developmentId) {
      const detailInputs = await loadFeedInputs(base44.asServiceRole.entities, { limit, developmentId });
      const detail = resolveDevelopment({ ...detailInputs, developmentId });
      return Response.json({
        ok: true,
        feed: 'accepted-development-feed',
        public: true,
        read_only: true,
        detail_requested: true,
        found: detail.ok === true,
        model_calls: 0,
        writes: 0,
        reason_code: detail.ok ? '' : detail.reason_code,
        reason: detail.ok ? '' : detail.reason,
        independent_verification: 'not_performed',
        disclosure: FEED_DISCLOSURE,
        count: detail.ok ? 1 : 0,
        development: detail.ok ? detail.item : null,
      });
    }

    const inputs = await loadFeedInputs(base44.asServiceRole.entities, { limit });
    const feed = resolveFeed({ ...inputs, limit });

    return Response.json({
      ok: true,
      feed: 'accepted-development-feed',
      public: true,
      read_only: true,
      model_calls: 0,
      writes: 0,
      limit: feed.limit,
      limit_default: FEED_LIMIT_DEFAULT,
      limit_max: FEED_LIMIT_MAX,
      ordering: FEED_ORDERING,
      count: feed.items.length,
      excluded_count: feed.excluded.length,
      counts: feed.counts,
      independent_verification: 'not_performed',
      disclosure: FEED_DISCLOSURE,
      items: feed.items,
    });
  } catch (error) {
    return Response.json({ ok: false, error_category: 'feed_error', error: sanitizeMessage(error) }, { status: 500 });
  }
}