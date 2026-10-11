// Phase 3F: ingestion authorization.
//
// Before Phase 3F, ingestTrends treated a request with no signed-in user as trusted
// whenever its body said it came from the schedule. That is caller-controlled evidence,
// so anyone who could reach the endpoint could claim to be the scheduler and run a full
// ingestion. It is removed.
//
// The decision below reads exactly one thing: the authenticated principal the platform
// itself resolved for the request. A body field, a query parameter, a header, a claim of
// being the scheduler and a missing user are all equally worthless as proof, and the
// function takes no request at all - it cannot consult one.
//
// The platform documents no verified scheduler identity for a scheduled backend-function
// call: a scheduled poll is documented to run with no signed-in user, and nothing in the
// platform reference describes an identity that could be verified server-side. Because no
// such proof exists, the fail-closed fallback recorded here is the one that was chosen:
// manual, administrator-only ingestion, with the scheduled workflow paused rather than
// left firing into a refusal.

export const INGESTION_AUTHORIZED_TRIGGER = 'authenticated_administrator';

export const INGESTION_AUTH_DESIGN = {
  stage: 'phase3f-ingestion-authorization',
  // The only proof accepted. Deliberately a list of one.
  accepted_proofs: [
    'an authenticated administrator: base44.auth.me() returns a user whose role is admin',
  ],
  // Every one of these is worthless as proof and is never consulted.
  rejected_proofs: [
    'an unauthenticated request, whatever it claims',
    'a body field such as trigger_source: "schedule"',
    'a query parameter or path segment',
    'a request header, including any scheduler-looking header name',
    'the absence of a user, treated as evidence of a scheduled call',
  ],
  scheduler_identity_documented: false,
  scheduler_identity_note:
    'The platform reference documents that a scheduled poll runs with no signed-in user, and documents no scheduler identity, signature or shared secret that a backend function could verify. No mechanism is asserted here that the platform does not document.',
  fallback: 'admin_only_manual_ingestion',
  fallback_note:
    'With no verifiable scheduler identity available, the fail-closed choice is manual, administrator-only ingestion. The scheduled workflow is paused rather than left invoking a function that must refuse it, so the refusal is an explicit operational decision and not a silent breakage.',
  schedule_state: 'paused',
  schedule_name: 'Trends Ingestion',
  schedule_note:
    'Paused in Phase 3F. The workflow definition is kept so ingestion can be re-armed the moment a documented, verifiable scheduler identity exists; until then a scheduled invocation would receive 401 and do nothing.',
};

export const INGESTION_LIMITATIONS = {
  scheduler_identity:
    'No documented, verifiable scheduler identity exists for scheduled backend-function invocation in this platform, so a scheduled call cannot be distinguished from an anonymous one and is therefore refused.',
  no_caller_trust:
    'Nothing a caller controls - headers, query parameters or request body - is evidence of anything. The authorization decision reads only the principal the platform resolved for the request.',
  schedule_paused:
    'The six-hour ingestion workflow is paused. Ingestion now runs only when an administrator invokes it, so the catalogue stops updating on its own until the schedule is deliberately re-armed.',
  refusal_is_free:
    'A refused request creates no IngestionRun record, contacts no source and writes nothing: the refusal happens before any work.',
  manual_only:
    'Administrator-only manual ingestion is the entire remaining ingestion surface, and it is capped only by the app\'s own per-run batch sizes - not by a scheduler.',
};

// The complete list of paths that can write an Item. It is reported, not enforced here;
// enforcement lives in each path's own authorization and in the entity access rules.
export const ITEM_WRITE_PATHS = [
  {
    path: 'ingestTrends',
    kind: 'backend function: scheduled (paused) and administrator manual',
    writes: 'Item.bulkCreate and Item.bulkUpdate, which may replace a stored excerpt with a longer source-native one',
    authorization: 'authenticated administrator only; a scheduled call is refused because no scheduler identity exists',
  },
  {
    path: 'enrichSourceText',
    kind: 'backend function: administrator manual only, no schedule',
    writes: 'Item.excerpt, under a guarded conditional update whose filter carries the exact excerpt the request read',
    authorization: 'authenticated administrator only',
  },
  {
    path: 'Trends Ingestion',
    kind: 'platform scheduled workflow trigger',
    writes: 'none directly: it only invokes ingestTrends',
    authorization: 'paused in Phase 3F; the definition is retained so it can be re-armed deliberately',
  },
  {
    path: 'administrator entity access',
    kind: 'platform entity access rules',
    writes: 'Item create, update and delete by any administrator, outside any app code path',
    authorization: 'platform-enforced admin role; not reachable from a scheduled or anonymous request',
  },
];

// The one authorization decision. It takes the authenticated principal and nothing else.
export function ingestionAccess(user) {
  if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id) {
    return {
      ok: false,
      status: 401,
      error_category: 'unauthenticated',
      error:
        'Unauthorized: ingestion requires an authenticated administrator. No scheduler identity exists to authenticate a scheduled call, so an unauthenticated request is refused however it describes itself.',
      model_calls: 0,
      provider_calls: 0,
      writes: 0,
    };
  }
  if (user.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error_category: 'forbidden',
      error: 'Forbidden: ingestion is administrator-only.',
      model_calls: 0,
      provider_calls: 0,
      writes: 0,
    };
  }
  return {
    ok: true,
    status: 200,
    operator: {
      operator_id: user.id,
      operator_role: user.role,
      authorization: INGESTION_AUTHORIZED_TRIGGER,
    },
    model_calls: 0,
    provider_calls: 0,
    writes: 0,
  };
}