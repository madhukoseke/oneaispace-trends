// Phase 3F: the read-only fixture-cleanup inventory.
//
// The analysis suites used to persist their fixtures into the production analysis entities.
// Phase 3F stopped that at the source (see shared/testIsolation.ts), but the rows those
// earlier runs left behind are still stored. This module reads them and reports exactly
// which rows a cleanup would remove, and why - and it removes nothing.
//
// What makes a row a candidate is an explicit identifier and a stored parent-child link,
// never a guess:
//
//   - a run is a suite fixture only when its run_id or authorization_id matches the
//     explicit suite pattern below;
//   - a development, claim or cache row is a candidate only when its run_id is one of
//     those suite run ids;
//   - the legitimate live run and everything under it are excluded by name;
//   - anything that matches no suite identifier is excluded and reported as unclassified;
//   - a candidate development or claim that a non-candidate cache entry references, and a
//     claim belonging to a protected development, are excluded so nothing is orphaned.
//
// There is no delete, deleteMany or purge call anywhere in this module.

import { DEV_ANALYSIS_CONFIG } from './devAnalysisConfig.ts';

export const SUITE_ID_PATTERN = /^phase2[abc]-suite\d*(?:-|$)/;

// The one legitimate live analysis run. It is named explicitly so no pattern - present or
// future - can ever sweep it up.
export const LIVE_RUN_ID = 'phase2b-live1-1791760000';

export const INVENTORY_PAGE_LIMIT = 200;
export const INVENTORY_MAX_PAGES = 6;
export const INVENTORY_SCAN_CAP = INVENTORY_PAGE_LIMIT * INVENTORY_MAX_PAGES;
export const INVENTORY_SAMPLE_CAP = 40;

export const CLEANUP_CRITERIA = {
  read_only: true,
  delete_performed: false,
  suite_identifier:
    'a run is a suite fixture only when its run_id or authorization_id matches the explicit pattern ^phase2[abc]-suite\\d*(?:-|$)',
  parent_child:
    'a development, claim or cache row is a candidate only when its run_id is one of those suite run ids; a row whose parent is not a suite fixture is never a candidate',
  live_run_exclusion:
    `run_id "${LIVE_RUN_ID}" and every development, claim and cache row stored under it are excluded from every candidate set`,
  unclassified_exclusion:
    'a row that matches no explicit suite identifier is excluded and reported as unclassified: the cleanup never removes a record it cannot name',
  reference_exclusion:
    'a candidate development or claim referenced by a non-candidate cache entry, and a claim whose development is protected, are excluded so no stored analysis is left orphaned',
  execution:
    'no deletion is performed by this module or by the endpoint that reads it: it returns the candidate set and the counts only',
};

export function isSuiteIdentifier(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return Boolean(text) && SUITE_ID_PATTERN.test(text);
}

async function readAllPages(db, collectionName, sort) {
  const collection = db && db[collectionName];
  if (!collection || typeof collection.filter !== 'function') {
    return { rows: [], pages: 0, truncated: false, readable: false };
  }
  const rows = [];
  let cursor;
  let pages = 0;
  let truncated = false;

  for (;;) {
    const options = { limit: INVENTORY_PAGE_LIMIT };
    if (sort) options.sort = sort;
    if (cursor) options.cursor = cursor;
    const page = await collection.filter({}, options);
    const items = (page && page.items) || [];
    rows.push(...items);
    pages += 1;
    cursor = page && page.next_cursor;
    if (!page || !page.has_more || !cursor) break;
    if (pages >= INVENTORY_MAX_PAGES) {
      truncated = true;
      break;
    }
  }

  return { rows, pages, truncated, readable: true };
}

function sampleIds(rows) {
  const ids = rows.map((row) => row.id).filter(Boolean);
  return {
    count: ids.length,
    ids: ids.slice(0, INVENTORY_SAMPLE_CAP),
    truncated: ids.length > INVENTORY_SAMPLE_CAP,
  };
}

// The pure classification. It is a function of the stored rows alone, so the live inventory
// and the regression suite that checks it run exactly the same rule.
export function classifyFixtures({ runs = [], developments = [], claims = [], cacheEntries = [] } = {}) {
  const suiteRunIds = new Set();
  const liveRunIds = new Set();
  const unclassifiedRunIds = new Set();
  const candidateRuns = [];
  const protectedRuns = [];
  const unclassifiedRuns = [];

  for (const run of runs || []) {
    const identifier = String(run.run_id || '').trim();
    if (identifier && identifier === LIVE_RUN_ID) {
      liveRunIds.add(identifier);
      protectedRuns.push({ id: run.id, run_id: identifier, reason_code: 'live_run_excluded' });
      continue;
    }
    if (isSuiteIdentifier(identifier) || isSuiteIdentifier(run.authorization_id)) {
      if (identifier) suiteRunIds.add(identifier);
      candidateRuns.push({ id: run.id, run_id: identifier, reason_code: 'suite_identifier' });
      continue;
    }
    if (identifier) unclassifiedRunIds.add(identifier);
    unclassifiedRuns.push({ id: run.id, run_id: identifier, reason_code: 'no_suite_identifier' });
  }

  const classifyChild = (row) => {
    const runId = String(row.run_id || '').trim();
    if (runId && liveRunIds.has(runId)) return 'live_run_excluded';
    if (runId && suiteRunIds.has(runId)) return 'suite_identifier';
    return 'parent_not_a_suite_fixture';
  };

  const candidateCacheIds = new Set(
    (cacheEntries || []).filter((row) => classifyChild(row) === 'suite_identifier').map((row) => row.id),
  );

  // A development referenced by a cache entry outside this candidate set is protected: that
  // entry is analysis the cleanup is not removing, so its subject must survive with it.
  const referencedDevelopmentIds = new Set();
  for (const entry of cacheEntries || []) {
    if (candidateCacheIds.has(entry.id)) continue;
    for (const developmentId of Array.isArray(entry.development_ids) ? entry.development_ids : []) {
      referencedDevelopmentIds.add(developmentId);
    }
  }

  const candidateDevelopments = [];
  const protectedDevelopments = [];
  const protectedDevelopmentIds = new Set();

  for (const row of developments || []) {
    const base = classifyChild(row);
    const referenced = row.development_id && referencedDevelopmentIds.has(row.development_id);
    if (base === 'suite_identifier' && !referenced) {
      candidateDevelopments.push({ id: row.id, development_id: row.development_id, run_id: row.run_id, reason_code: base });
      continue;
    }
    const reason = referenced ? 'referenced_by_a_non_candidate_cache_entry' : base;
    if (row.development_id) protectedDevelopmentIds.add(row.development_id);
    protectedDevelopments.push({ id: row.id, development_id: row.development_id, run_id: row.run_id, reason_code: reason });
  }

  const candidateClaims = [];
  const protectedClaims = [];
  for (const row of claims || []) {
    const base = classifyChild(row);
    const orphan = row.development_id && protectedDevelopmentIds.has(row.development_id);
    if (base === 'suite_identifier' && !orphan) {
      candidateClaims.push({ id: row.id, claim_id: row.claim_id, run_id: row.run_id, reason_code: base });
      continue;
    }
    protectedClaims.push({
      id: row.id, claim_id: row.claim_id, run_id: row.run_id,
      reason_code: orphan ? 'development_is_protected' : base,
    });
  }

  const candidateCache = [];
  const protectedCache = [];
  for (const row of cacheEntries || []) {
    const base = classifyChild(row);
    if (base === 'suite_identifier') {
      candidateCache.push({ id: row.id, fingerprint: row.fingerprint, run_id: row.run_id, reason_code: base });
      continue;
    }
    protectedCache.push({ id: row.id, fingerprint: row.fingerprint, run_id: row.run_id, reason_code: base });
  }

  const liveRunIdsInChildren = (rows) => (rows || []).filter((row) => String(row.run_id || '').trim() === LIVE_RUN_ID).map((row) => row.id);

  return {
    criteria: CLEANUP_CRITERIA,
    read_only: true,
    delete_performed: false,
    suite_run_ids: Array.from(suiteRunIds).sort(),
    live_run: {
      run_id: LIVE_RUN_ID,
      present: liveRunIds.has(LIVE_RUN_ID),
      excluded: true,
      run_row_ids: protectedRuns.filter((row) => row.reason_code === 'live_run_excluded').map((row) => row.id),
      development_row_ids: liveRunIdsInChildren(developments),
      claim_row_ids: liveRunIdsInChildren(claims),
      cache_row_ids: liveRunIdsInChildren(cacheEntries),
    },
    totals: {
      runs_read: (runs || []).length,
      suite_runs: candidateRuns.length,
      live_runs: protectedRuns.filter((row) => row.reason_code === 'live_run_excluded').length,
      unclassified_runs: unclassifiedRuns.length,
      developments_read: (developments || []).length,
      claims_read: (claims || []).length,
      cache_entries_read: (cacheEntries || []).length,
    },
    candidates: {
      DevAnalysisRun: sampleIds(candidateRuns),
      DevDevelopment: sampleIds(candidateDevelopments),
      DevClaim: sampleIds(candidateClaims),
      DevAnalysisCache: sampleIds(candidateCache),
      sampled: candidateRuns.slice(0, INVENTORY_SAMPLE_CAP),
      sampled_truncated: candidateRuns.length > INVENTORY_SAMPLE_CAP,
    },
    protected: {
      DevAnalysisRun: protectedRuns.length,
      DevDevelopment: protectedDevelopments.length,
      DevClaim: protectedClaims.length,
      DevAnalysisCache: protectedCache.length,
      run_reason_codes: protectedRuns.reduce((acc, row) => {
        acc[row.reason_code] = (acc[row.reason_code] || 0) + 1;
        return acc;
      }, {}),
      development_reason_codes: protectedDevelopments.reduce((acc, row) => {
        acc[row.reason_code] = (acc[row.reason_code] || 0) + 1;
        return acc;
      }, {}),
      claim_reason_codes: protectedClaims.reduce((acc, row) => {
        acc[row.reason_code] = (acc[row.reason_code] || 0) + 1;
        return acc;
      }, {}),
      development_sample: protectedDevelopments.slice(0, INVENTORY_SAMPLE_CAP),
    },
    note: 'dry run only: this is the set a cleanup would remove, computed from stored identifiers and stored parent-child links. Nothing has been deleted or changed.',
  };
}

// The live inventory: reads the four analysis collections and classifies what it finds. It
// reads only, and it reports rather than acting.
export async function loadFixtureInventory(db) {
  const [runs, developments, claims, cacheEntries] = await Promise.all([
    readAllPages(db, 'DevAnalysisRun', '-created_date'),
    readAllPages(db, 'DevDevelopment', '-created_date'),
    readAllPages(db, 'DevClaim', '-created_date'),
    readAllPages(db, 'DevAnalysisCache', '-created_date'),
  ]);

  const scan = {
    stage: DEV_ANALYSIS_CONFIG.stage,
    scan_cap: INVENTORY_SCAN_CAP,
    page_limit: INVENTORY_PAGE_LIMIT,
    read_only: true,
    collections: {
      DevAnalysisRun: { pages: runs.pages, rows: runs.rows.length, truncated: runs.truncated },
      DevDevelopment: { pages: developments.pages, rows: developments.rows.length, truncated: developments.truncated },
      DevClaim: { pages: claims.pages, rows: claims.rows.length, truncated: claims.truncated },
      DevAnalysisCache: { pages: cacheEntries.pages, rows: cacheEntries.rows.length, truncated: cacheEntries.truncated },
    },
    truncated: runs.truncated || developments.truncated || claims.truncated || cacheEntries.truncated,
  };

  return {
    scan,
    classification: classifyFixtures({
      runs: runs.rows,
      developments: developments.rows,
      claims: claims.rows,
      cacheEntries: cacheEntries.rows,
    }),
  };
}