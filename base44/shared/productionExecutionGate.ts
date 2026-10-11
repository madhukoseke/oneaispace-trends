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
//   2. That authorization is a per-run id held in a source-level list that is EMPTY by default.
//      Only a deliberate human edit adds one, for one run; removing it closes the run. Because it
//      is a source constant rather than a stored flag, no request can arm it, no run can leave it
//      armed, and it cannot be confused with a value the caller supplies in any other field.
//   3. The production-backed actions and the actions a routine regression command may run are
//      both listed here, and the gate's own regression asserts the two lists are disjoint - so a
//      production-backed action is never part of a routine regression command.

export const PRODUCTION_EXECUTION_GATE = {
  stage: 'phase3g-production-execution-gate',
  // On by default and not switchable at runtime: the gate is the control, the list below is what
  // is ever armed and disarmed.
  require_explicit_authorization: true,
  // Empty by default. A deliberate source edit adds one id for one run; the run closes when it is
  // removed again. Nothing else can add to it - there is no admin flag, no environment variable
  // and no request field that arms this list.
  authorized_runs: [],
  authorization_unit: 'one id per run, added deliberately before it starts and removed when it ends',
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
  per_run:
    'Authorization is per run: one id, added deliberately before the run starts and removed when it ends. There is no standing authorization and no wildcard.',
  routine_commands:
    'Routine regression commands carry no id from that list, so they cannot execute a production-backed action. This is what makes a validation call harmless even though the platform harness authenticates as a real administrator.',
  identity_still_required:
    'The gate is additive, not a replacement: the administrator check still runs first, so an unauthenticated request is refused 401 and a non-administrator 403 before the authorization is even considered.',
  suites_unaffected:
    'Diagnostics, dry runs and mocked suites stay reachable without any authorization, because they perform no live work. The gate covers execution, not inspection.',
  not_a_substitute_for_isolation:
    'The in-memory store and the SDK tripwire protect a mocked suite from production; this gate protects production from a direct handler invocation. They cover different paths and neither one replaces the other.',
  covering_the_incident_path:
    'The incident reached production through ingestTrends, which is now covered here, and through the enrichment write path, which is covered here too. devAnalysis.analyze and modelProof.live are already behind an off-by-default source constant and a one-time authorization.',
};

// The pure decision: is this id on the supplied list? Exported so the regression can prove that an
// armed list admits exactly its own id, without editing the constant above.
export function productionExecutionAuthorized(authorization, authorizedRuns = PRODUCTION_EXECUTION_GATE.authorized_runs) {
  const id = typeof authorization === 'string' ? authorization.trim() : '';
  if (!id) return false;
  return Array.isArray(authorizedRuns) && authorizedRuns.includes(id);
}

export function productionExecutionGateDeclaration() {
  return {
    stage: PRODUCTION_EXECUTION_GATE.stage,
    require_explicit_authorization: PRODUCTION_EXECUTION_GATE.require_explicit_authorization,
    authorized_runs: PRODUCTION_EXECUTION_GATE.authorized_runs,
    authorization_unit: PRODUCTION_EXECUTION_GATE.authorization_unit,
    covered_paths: PRODUCTION_EXECUTION_GATE.covered_paths,
    covered_by_an_existing_source_constant: PRODUCTION_EXECUTION_GATE.covered_by_an_existing_source_constant,
    refusal_is_free: PRODUCTION_EXECUTION_GATE.refusal_is_free,
  };
}

// The decision a production-backed entry point applies, after the administrator check it already
// performs. It takes the principal and the caller's authorization field, and nothing else.
export function productionExecutionAccess({ authorization, principal, path } = {}) {
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

  const supplied = typeof authorization === 'string' ? authorization.trim() : '';
  if (!productionExecutionAuthorized(supplied)) {
    return {
      ok: false, status: 403, stage: 'production_execution',
      error_category: 'production_execution_not_authorized',
      error: supplied
        ? 'this execution is not authorized: the supplied id is not on the production-execution list, which is empty by default and only a deliberate source edit can arm'
        : 'this execution is not authorized: a production-execution authorization id is required and none was supplied, and routine regression commands carry none',
      authorization_accepted: false,
      authorization_supplied: supplied ? 'present_but_not_authorized' : 'absent',
      operator, gate,
    };
  }

  return {
    ok: true, status: 200, stage: 'authorized', error_category: '', error: '',
    authorization_accepted: true,
    authorization_id: supplied,
    path: String(path || ''),
    operator: { ...operator, authorization: 'administrator_with_an_explicit_production_execution_authorization' },
    gate,
  };
}