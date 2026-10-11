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
// The payload accepts one optional field: { limit }. It is clamped server-side.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  FEED_DISCLOSURE, FEED_LIMIT_DEFAULT, FEED_LIMIT_MAX, FEED_ORDERING, clampLimit, loadFeedInputs, resolveFeed,
} from '../../shared/devFeed.ts';
import { sanitizeMessage } from '../../shared/modelAdapters.ts';

export default async function (req) {
  try {
    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }

    const base44 = createClientFromRequest(req);
    const limit = clampLimit(payload.limit);

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