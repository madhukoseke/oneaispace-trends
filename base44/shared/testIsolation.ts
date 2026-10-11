// Phase 3F: test isolation.
//
// A backend suite must not be able to touch production data. This module is the only
// mechanism that guarantees it, and it does so structurally rather than by convention:
//
//   1. A suite receives an in-memory entity store built for that call and discarded with
//      it. The store exposes exactly the collections the suite declares. Every other
//      production collection is unreachable - reading it throws before any request is
//      made - so a suite cannot reach one by accident, by a typo, or by a later edit.
//   2. A suite receives a tripwire in place of the platform SDK. Reaching the SDK, the AI
//      gateway or a Core integration raises an isolation violation instead of a call, so a
//      test cannot spend credits, call a model or write app data.
//   3. A suite consumes no one-time authorization and creates no run anchor, because it
//      performs no live work. Its result is returned to its caller and stored nowhere.
//
// The guarantees above are what makes the suites in this app safe to run at any time, and
// the isolation regression in shared/phase3fSuite.ts fails if any of them stops holding.

export const ISOLATED_DB_MARKER = 'base44-isolated-in-memory-test-db';

export class IsolationViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IsolationViolationError';
  }
}

// Every entity collection this app stores in production. Nothing here is reachable from an
// isolated test store unless the suite that created it declared that collection.
export const PRODUCTION_COLLECTIONS = [
  'Item', 'Trend', 'Topic', 'IngestionRun', 'Save', 'User',
  'DevAnalysisRun', 'DevDevelopment', 'DevClaim', 'DevAnalysisCache',
  'ModelProofRun', 'ModelProofResult',
];

// What each suite is allowed to keep in its own memory: exactly the collections it exercises.
export const ANALYSIS_SUITE_COLLECTIONS = ['DevAnalysisRun', 'DevDevelopment', 'DevClaim', 'DevAnalysisCache'];
export const PROOF_SUITE_COLLECTIONS = ['ModelProofRun', 'ModelProofResult'];

export const ISOLATION_LIMITATIONS = {
  storage:
    'A backend suite runs against an in-memory entity store created for that call and discarded with it. No suite reads or writes a production entity.',
  unreachable:
    'The isolated store exposes exactly the collections a suite declares. Every other production collection is unreachable: reading one throws before any request is made, so a suite cannot reach it by accident or by a later edit.',
  no_platform_sdk:
    'A suite receives a tripwire in place of the platform SDK. Reaching the SDK, the AI gateway or a Core integration raises an isolation violation instead of a call, so a test cannot spend credits or touch app data.',
  no_records_created:
    'A suite creates no analysis run, development, claim, cache entry, proof record or Item. Its result is returned to the caller and stored nowhere.',
  no_authorization:
    'A suite consumes no one-time authorization and does not require one, because it has nothing to authorise: it performs no live work.',
  production_writes_are_zero:
    'Production writes reported by any suite action are zero by construction, not by observation: no production collection is present in the store the suite is given.',
  in_memory_semantics:
    'The store mirrors the entity surface the code under test uses - filter, create, bulkCreate, update, bulkUpdate, updateMany, get, list, count, delete, deleteMany - with a guarded update reporting how many rows it matched. It is a test double, so it proves the code path, never the platform\'s own concurrency behaviour.',
};

function matchesFilter(row, filter) {
  if (!filter || typeof filter !== 'object') return true;
  return Object.entries(filter).every(([field, condition]) => {
    const value = row[field];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition) return Array.isArray(condition.$in) && condition.$in.includes(value);
      if ('$ne' in condition) return value !== condition.$ne;
      if ('$exists' in condition) return condition.$exists ? value !== undefined : value === undefined;
      return false;
    }
    return value === condition;
  });
}

function sortRows(rows, sort) {
  const spec = String(sort || '').trim();
  if (!spec) return rows;
  const descending = spec.startsWith('-');
  const field = descending ? spec.slice(1) : spec;
  return rows.slice().sort((left, right) => {
    const a = String(left[field] === undefined || left[field] === null ? '' : left[field]);
    const b = String(right[field] === undefined || right[field] === null ? '' : right[field]);
    if (a === b) return 0;
    return descending ? b.localeCompare(a) : a.localeCompare(b);
  });
}

function project(row, fields) {
  if (!Array.isArray(fields) || !fields.length) return row;
  const out = {};
  for (const field of fields) if (field in row) out[field] = row[field];
  if ('id' in row) out.id = row.id;
  return out;
}

function createCollection(name, state) {
  const rows = [];
  let sequence = 0;
  const stamp = () => new Date().toISOString();
  const copy = (row) => (row ? { ...row } : row);

  const api = {
    async create(data) {
      const row = { id: `${name}_${++sequence}`, created_date: stamp(), updated_date: stamp(), ...(data || {}) };
      rows.push(row);
      state.operations.push({ collection: name, op: 'create' });
      state.writes.push({ collection: name, op: 'create', id: row.id });
      return copy(row);
    },
    async bulkCreate(list) {
      const created = [];
      for (const entry of list || []) created.push(await api.create(entry));
      return created;
    },
    async get(id) {
      state.operations.push({ collection: name, op: 'get' });
      const row = rows.find((entry) => entry.id === id);
      return copy(row || null);
    },
    async filter(query = {}, options = {}) {
      state.operations.push({ collection: name, op: 'filter' });
      state.reads.push({ collection: name });
      const matched = rows.filter((row) => matchesFilter(row, query));
      const limited = sortRows(matched, options.sort).slice(0, options.limit || 50);
      return { items: limited.map((row) => copy(project(row, options.fields))), next_cursor: undefined, has_more: false };
    },
    async list(options) {
      if (options === undefined) {
        state.operations.push({ collection: name, op: 'list' });
        return rows.map(copy);
      }
      return api.filter({}, options);
    },
    async count(query = {}) {
      state.operations.push({ collection: name, op: 'count' });
      return rows.filter((row) => matchesFilter(row, query)).length;
    },
    async update(id, data) {
      state.operations.push({ collection: name, op: 'update' });
      state.writes.push({ collection: name, op: 'update', id });
      const row = rows.find((entry) => entry.id === id);
      if (!row) return null;
      Object.assign(row, data || {}, { updated_date: stamp() });
      return copy(row);
    },
    async bulkUpdate(list) {
      const updated = [];
      for (const entry of list || []) {
        const { id, ...fields } = entry || {};
        updated.push(await api.update(id, fields));
      }
      return updated;
    },
    async updateMany(query = {}, update = {}) {
      state.operations.push({ collection: name, op: 'updateMany' });
      const matched = rows.filter((row) => matchesFilter(row, query));
      const patch = update && update.$set ? update.$set : (update || {});
      for (const row of matched) Object.assign(row, patch, { updated_date: stamp() });
      state.writes.push({ collection: name, op: 'updateMany', matched: matched.length });
      return { updated: matched.length };
    },
    async delete(id) {
      state.operations.push({ collection: name, op: 'delete' });
      state.writes.push({ collection: name, op: 'delete', id });
      const index = rows.findIndex((entry) => entry.id === id);
      if (index >= 0) rows.splice(index, 1);
      return null;
    },
    async deleteMany(query = {}) {
      state.operations.push({ collection: name, op: 'deleteMany' });
      const keep = rows.filter((row) => !matchesFilter(row, query));
      const removed = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      state.writes.push({ collection: name, op: 'deleteMany', removed });
      return { deleted: removed };
    },
  };

  return api;
}

// The isolated store. Collections outside the declared list are unreachable by design.
export function createIsolatedTestDb({ collections = [], label = 'isolated-suite' } = {}) {
  const allowed = Array.from(new Set(collections));
  const blocked = PRODUCTION_COLLECTIONS.filter((name) => !allowed.includes(name));
  const state = {
    marker: ISOLATED_DB_MARKER,
    label,
    allowed_collections: allowed,
    blocked_collections: blocked,
    reads: [],
    writes: [],
    operations: [],
  };

  const stores = {};
  for (const name of allowed) stores[name] = createCollection(name, state);

  const db = new Proxy(stores, {
    get(target, property) {
      if (typeof property === 'symbol') return target[property];
      if (property === 'then') return undefined;
      if (typeof property !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
      throw new IsolationViolationError(
        `the isolated test store "${label}" exposes only ${allowed.join(', ') || 'no collections'}; "${property}" is not one of them, so a test suite cannot read or write it`,
      );
    },
    has(target, property) {
      return Object.prototype.hasOwnProperty.call(target, property);
    },
  });

  return {
    db,
    state,
    describe: () => ({
      marker: ISOLATED_DB_MARKER,
      label,
      storage: 'in-memory',
      allowed_collections: allowed,
      blocked_collections: blocked,
      operations: state.operations.length,
      reads: state.reads.length,
      writes: state.writes.length,
      writes_by_collection: state.writes.reduce((acc, entry) => {
        acc[entry.collection] = (acc[entry.collection] || 0) + 1;
        return acc;
      }, {}),
      production_writes: 0,
      note: 'this store exists only for the duration of the suite call that created it',
    }),
  };
}

// A probe used by the isolation regression: it reports whether a collection is reachable at
// all, without throwing into the case that is checking it.
export function probeCollection(db, name) {
  try {
    const value = db[name];
    return { collection: name, reached: value !== undefined && value !== null, reason: '' };
  } catch (error) {
    return { collection: name, reached: false, reason: String((error && error.message) || error) };
  }
}

// The tripwire handed to a suite in place of the platform SDK. Any property the code under
// test could use to reach the platform raises an isolation violation instead.
export function createLiveCallTripwire(label = 'a backend suite') {
  const refuse = (path) => () => {
    throw new IsolationViolationError(`${label} must not reach the platform: ${path} was called, and a test makes no platform call`);
  };
  const unreachable = (path) => new Proxy({}, {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      return unreachable(`${path}.${String(property)}`);
    },
    apply: () => refuse(path)(),
  });

  return {
    __test_tripwire: true,
    label,
    auth: { me: refuse('auth.me') },
    users: { inviteUser: refuse('users.inviteUser') },
    entities: unreachable('entities'),
    integrations: { Core: unreachable('integrations.Core') },
    asServiceRole: {
      entities: unreachable('asServiceRole.entities'),
      integrations: { Core: unreachable('asServiceRole.integrations.Core') },
      aiGateway: { connection: refuse('asServiceRole.aiGateway.connection') },
    },
    functions: { invoke: refuse('functions.invoke') },
  };
}