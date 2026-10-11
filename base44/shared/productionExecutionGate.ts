// Phase 3G: the production-execution gate.
//
// The incident this module closes. A routine validation step issued a call to the deployed
// ingestion handler through the platform's own function tester. That harness resolves a real,
// authenticated workspace administrator for every invocation, so the handler's authorization
// check - which was correct, and is unchanged - admitted it, and a full ingestion ran: 12
// records created, 144 refreshed, 9 trend rows and 36 topic rows recomputed, from what was
// intended as a read-only audit step.
//
// Why the isolation regression did not stop it, and cannot. shared/testIsolation.ts protects a
// *suite*: the in-memory store and the SDK tripwire are handed to the code the suite calls, in
// the same process. A validation call names a deployed handler instead, and the platform invokes
// that handler with the real SDK in another process; no double is in that path at all. The
// regression therefore proves that mocked suites cannot reach production, and says nothing
// whatever about a direct handler invocation. Both statements are true, and neither is a
// substitute for the other.
//
// The control that was missing is therefore not in the suites but at the production entry points,
// and this module supplies it:
//
//   1. Execution that reaches production requires a separate, explicit production-execution
//      authorization, on top of the administrator check that already exists.
//   2. Each authorization names ONE path and ONE action, and a valid expiry. An id armed for one
//      run cannot execute a different production action, and an entry with no usable expiry is
//      refused rather than left open by omission.
//   3. The list of armed authorizations is a source-level constant that is EMPTY by default, and
//      nothing but a deliberate human edit can add to it - no request field, no entity, no
//      environment variable, no function action. Routine regression commands carry no id from it,
//      so they cannot execute a production-backed action.
//   4. The production-backed actions and the actions a routine regression command may run are
//      both listed here, and the gate's own regression asserts the two lists are disjoint.
//
// What this gate does NOT do, stated here rather than implied: an armed authorization is not
// single-use. Enforcing one execution per id would require recording that the id was spent, and
// that record is a production write this gate deliberately does not make - a source constant
// cannot be consumed atomically. Replay is therefore possible for as long as an entry remains
// armed and unexpired; what limits it is the required expiry, removal of the entry as the close of
// the run, the per-action scope, and the idempotency of the actions it covers. See
// PRODUCTION_EXECUTION_LIMITATIONS.

export const PRODUCTION_EXECUTION_GATE = {
  stage: 'phase3g-production-execution-gate',
  // On by default and not switchable at runtime: the gate is the control, the list below is what
  // is ever armed and disarmed.
  require_explicit_authorization: true,
  // Empty by default. A deliberate source edit adds one scoped, expiring entry for one run; the
  // run closes when it is removed again or when it expires.
  authorized_runs: [],
  // The only way to arm an entry, and the only thing the gate reads.
  authorization_source: 'source constant only',
  authorization_source_note:
    'No request field, no entity, no environment variable and no function action can add an entry to this list: it is read from this file, so arming is a deliberate source edit.',
  authorization_unit: 'one id, one path, one action, one expiry window, added deliberately before the run and removed when it ends',
  authorization_scope: 'an entry names the one path and the one action it may execute; any other action is refused',
  authorization_expiry: 'required: an entry with no valid future expires_at is refused, so an authorization cannot be left open indefinitely by omission',
  routine_commands_carry_no_authorization: true,
  covered_paths: ['ingestTrends', 'enrichSourceText'],
  covered_by_an_existing_source_constant: [
    'devAnalysis.analyze (an armed execution_enabled constant plus a one-time authorization id)',
    'modelProof.live (an armed execution_enabled constant plus a one-time authorization id)',
  ],
  refusal_is_free:
    'A refused execution contacts no source, calls no model and writes nothing: the refusal is returned before any record is created or read for work.',
  note:
    'Two independent controls, neither replacing the other: shared/testIsolation.ts keeps a mocked suite out of production, and this gate keeps a direct handler invocation out of production unless a human has authorized that one run.',
};

// The shape an operator writes into authorized_runs. Documented here so the entry is not invented
// per run.
export const PRODUCTION_EXECUTION_AUTHORIZATION_SHAPE = {
  id: 'a unique id for this run, invented by the operator',
  path: 'the one backend function this id may execute, e.g. ingestTrends',
  action: 'the one action on that function this id may execute, e.g. run or enrich',
  armed_at: 'when the operator armed it (reported, not required)',
  expires_at: 'required: the instant the authorization stops being accepted, e.g. 2026-10-12T03:00:00.000Z',
  note: 'why this run exists; reported by the status action',
};

// Actions that reach the outside world or write catalogue data. Each one requires an explicit
// production-execution authorization (or, where noted, an existing source-level kill switch),
// and none of them may be part of a routine regression command.
export const PRODUCTION_BACKED_ACTIONS = [
  {
    path: 'ingestTrends', action: 'run',
    writes: 'Item, IngestionRun, Trend, Topic',
    reaches: 'RSS, GitHub, arXiv and Hacker News endpoints',
    requires: 'administrator + production-execution authorization',
  },
  {
    path: 'enrichSourceText', action: 'enrich',
    writes: 'Item.excerpt',
    reaches: 'the provider endpoints approved in ENRICHMENT_NETWORK_POLICY',
    requires: 'administrator + production-execution authorization',
  },
  {
    path: 'devAnalysis', action: 'analyze',
    writes: 'DevAnalysisRun, DevDevelopment, DevClaim, DevAnalysisCache',
    reaches: 'the extraction and evaluation models',
    requires: 'administrator + one-time authorization_id + an armed execution_enabled source constant (off)',
  },
  {
    path: 'modelProof', action: 'live',
    writes: 'ModelProofRun, ModelProofResult',
    reaches: 'the two proof providers',
    requires: 'administrator + one-time authorization_id + an armed execution_enabled source constant (off)',
  },
];

// Actions a routine regression command may run. Every one of them either writes nothing at all or
// writes only into an in-memory store that is discarded with the call.
export const ROUTINE_REGRESSION_ACTIONS = [
  { path: 'enrichSourceText', action: 'dry_run', writes: 'nothing', note: 'plans the writes it would make' },
  { path: 'enrichSourceText', action: 'suite', writes: 'nothing (in-memory)', note: 'mocked provider lookups' },
  { path: 'devAnalysis', action: 'dry_run', writes: 'one DevAnalysisRun diagnostic row', note: 'consumes a one-time authorization; no source, no model, no catalogue write' },
  { path: 'devAnalysis', action: 'suite', writes: 'nothing (in-memory)', note: 'mocked providers' },
  { path: 'devAnalysis', action: 'calibration_suite', writes: 'nothing', note: 'pure cases over stored-text fixtures' },
  { path: 'devAnalysis', action: 'source_quality', writes: 'nothing', note: 'read-only diagnostics' },
  { path: 'devAnalysis', action: 'review', writes: 'nothing', note: 'reads stored analysis rows' },
  { path: 'modelProof', action: 'contract', writes: 'nothing (in-memory)', note: 'stubbed transports' },
  { path: 'modelProof', action: 'review', writes: 'nothing', note: 'reads stored proof rows' },
  { path: 'securityAudit', action: 'status', writes: 'nothing', note: 'reports the posture' },
  { path: 'securityAudit', action: 'suite', writes: 'nothing (in-memory)', note: 'the hardening regression' },
  { path: 'securityAudit', action: 'fixture_inventory', writes: 'nothing', note: 'the read-only cleanup dry run' },
  { path: 'devFeed', action: 'read', writes: 'nothing', note: 'the public read-only feed' },
];

export const PRODUCTION_EXECUTION_LIMITATIONS = {
  empty_by_default:
    'The authorized-run list is empty in source and no request, record, flag or environment variable can add to it. A production-backed action therefore refuses every invocation until a human edits this file.',
  not_single_use:
    'An armed authorization is NOT single-use. One execution per id would require recording that the id was spent, and that record is a production write this gate deliberately does not make; a source constant cannot be consumed atomically. An entry that stays armed and unexpired can execute its one action again.',
  replay_protection:
    'What limits replay, in order: the structurally required expiry, removal of the entry as the close of the run, the per-action scope that confines an id to a single path and action, and the idempotency of the covered actions - a repeated ingestion deduplicates by canonical url and title, so it refreshes source-reported metrics rather than creating a second copy of a record.',
  expiry_is_structural:
    'An entry with no usable expires_at is refused, so an authorization cannot be left open indefinitely by omission, and an expired entry is refused without any further action from the operator.',
  scope_is_checked:
    'An entry names one path and one action. Using that id for any other action is refused, so an authorization armed for one run cannot execute a different production action, and reusing it elsewhere produces a refusal rather than an execution.',
  stale_entry_risk:
    'A stale entry that is neither removed nor expired is a standing authorization for its one action until its expiry passes. It is not silent: the status action lists every armed entry, and the gate regression asserts the source list is empty.',
  new_writer_risk:
    'The gate covers the two paths wired to it (ingestTrends.run and enrichSourceText.enrich). A future function that writes production data would not be covered until it is added here and to its own entry point; the production-backed action list is where that is declared.',
  configuration_risk:
    'The gate itself is not switchable at runtime, so the only configuration risk is the content of the source list: an entry that is armed with a wrong path or action is refused rather than misapplied, and one armed before its run and left behind is bounded by its expiry.',
  suites_unaffected:
    'Diagnostics, dry runs, mocked suites and read-only reports stay reachable with no authorization at all, because they perform no live work. The gate covers execution, not inspection, so nothing about it prevents the regression itself from running.',
  not_a_substitute_for_isolation:
    'The in-memory store and the SDK tripwire protect a mocked suite from production; this gate protects production from a direct handler invocation. They cover different paths and neither one replaces the other.',
  covering_the_incident_path:
    'The incident reached production through ingestTrends, which is covered here, and through the enrichment write path, which is covered here too. devAnalysis.analyze and modelProof.live are already behind an off-by-default source constant and a one-time authorization.',
};

// The scoped decision, as a pure function: is this id armed for exactly this path and action, and
// still inside its window? Returns the reason, so a refusal can say which condition failed.
export function productionExecutionAuthorized(authorization, {
  path, action, entries = PRODUCTION_EXECUTION_GATE.authorized_runs, now = Date.now(),
} = {}) {
  const id = typeof authorization === 'string' ? authorization.trim() : '';
  if (!id) return { authorized: false, reason: 'no_authorization_supplied' };
  if (!Array.isArray(entries)) return { authorized: false, reason: 'no_authorization_entries' };

  const byId = entries.filter((entry) => entry && typeof entry === 'object' && String(entry.id || '').trim() === id);
  if (!byId.length) return { authorized: false, reason: 'id_not_on_the_authorization_list' };

  const inScope = byId.filter((entry) => String(entry.path || '') === String(path || '')
    && String(entry.action || '') === String(action || ''));
  if (!inScope.length) return { authorized: false, reason: 'authorization_is_scoped_to_another_action' };

  const live = inScope.filter((entry) => {
    const expiry = Date.parse(String(entry.expires_at || ''));
    return Number.isFinite(expiry) && expiry > now;
  });
  if (!live.length) return { authorized: false, reason: 'authorization_expired_or_missing_an_expiry' };

  return { authorized: true, reason: 'authorized', entry: live[0] };
}

export function productionExecutionGateDeclaration() {
  return {
    stage: PRODUCTION_EXECUTION_GATE.stage,
    require_explicit_authorization: PRODUCTION_EXECUTION_GATE.require_explicit_authorization,
    armed_entries: PRODUCTION_EXECUTION_GATE.authorized_runs,
    armed_entry_count: PRODUCTION_EXECUTION_GATE.authorized_runs.length,
    authorization_source: PRODUCTION_EXECUTION_GATE.authorization_source,
    authorization_unit: PRODUCTION_EXECUTION_GATE.authorization_unit,
    authorization_scope: PRODUCTION_EXECUTION_GATE.authorization_scope,
    authorization_expiry: PRODUCTION_EXECUTION_GATE.authorization_expiry,
    single_use: false,
    covered_paths: PRODUCTION_EXECUTION_GATE.covered_paths,
    covered_by_an_existing_source_constant: PRODUCTION_EXECUTION_GATE.covered_by_an_existing_source_constant,
    refusal_is_free: PRODUCTION_EXECUTION_GATE.refusal_is_free,
  };
}

// The decision a production-backed entry point applies, after the administrator check it already
// performs. It takes the principal, the caller's authorization field, and the one action being
// requested - never a caller-supplied scope, which would be worth nothing.
//
// `authorizedRuns` and `now` are in-process seams for the regression only: no handler passes
// either one, the request path never reaches them, and a request body cannot supply the list.
export function productionExecutionAccess({ authorization, principal, path, action, authorizedRuns, now } = {}) {
  const operator = {
    operator_id: principal && principal.id ? principal.id : null,
    operator_role: principal && principal.role ? principal.role : null,
  };
  const gate = productionExecutionGateDeclaration();

  if (!operator.operator_id) {
    return {
      ok: false, status: 401, stage: 'production_execution',
      error_category: 'production_execution_requires_an_authenticated_administrator',
      error: 'a production-backed execution requires an authenticated administrator',
      authorization_accepted: false, authorization_supplied: 'not_considered: no authenticated principal',
      operator, gate,
    };
  }
  if (operator.operator_role !== 'admin') {
    return {
      ok: false, status: 403, stage: 'production_execution',
      error_category: 'production_execution_requires_an_authenticated_administrator',
      error: 'a production-backed execution requires an administrator',
      authorization_accepted: false, authorization_supplied: 'not_considered: the principal is not an administrator',
      operator, gate,
    };
  }

  const scope = String(path || '');
  const requestedAction = String(action || '');
  const decision = productionExecutionAuthorized(authorization, { path: scope, action: requestedAction, entries: authorizedRuns, now });
  if (!decision.authorized) {
    const supplied = typeof authorization === 'string' ? authorization.trim() : '';
    const category = decision.reason === 'authorization_is_scoped_to_another_action'
      ? 'production_execution_not_authorized_for_this_action'
      : decision.reason === 'authorization_expired_or_missing_an_expiry'
        ? 'production_execution_authorization_expired'
        : 'production_execution_not_authorized';
    const explanation = {
      no_authorization_supplied: 'a production-execution authorization id is required and none was supplied, and routine regression commands carry none',
      id_not_on_the_authorization_list: 'the supplied id is not on the production-execution list, which is empty by default and only a deliberate source edit can arm',
      authorization_is_scoped_to_another_action: `this authorization is scoped to a different action and cannot execute ${scope}.${requestedAction}`,
      authorization_expired_or_missing_an_expiry: 'this authorization has expired or carries no usable expiry, and an entry without one is refused rather than left open',
      no_authorization_entries: 'the production-execution list is not readable',
    }[decision.reason] || 'this execution is not authorized';
    return {
      ok: false, status: 403, stage: 'production_execution',
      error_category: category,
      error: `${explanation}; no source was contacted and nothing was written`,
      authorization_accepted: false,
      authorization_reason: decision.reason,
      authorization_supplied: supplied ? 'present_but_not_accepted' : 'absent',
      requested_scope: { path: scope, action: requestedAction },
      operator, gate,
    };
  }

  return {
    ok: true, status: 200, stage: 'authorized', error_category: '', error: '',
    authorization_accepted: true,
    authorization_id: String(authorization).trim(),
    authorization_reason: decision.reason,
    authorization_expires_at: decision.entry.expires_at,
    requested_scope: { path: scope, action: requestedAction },
    operator: { ...operator, authorization: 'administrator_with_an_explicit_production_execution_authorization' },
    gate,
  };
}