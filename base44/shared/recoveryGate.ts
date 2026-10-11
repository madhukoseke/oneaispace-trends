// Phase 3F: the excerpt-recovery gate.
//
// Phase 3E left the 23-record excerpt recovery blocked. The question Phase 3F had to answer
// is whether a documented atomic update mechanism exists that would make the recovery safe.
// It does not:
//
//   - The entity SDK documents conditional updates (a filter plus an update object with
//     $set and friends) and reports how many records matched. It documents no atomicity, no
//     compare-and-set guarantee and no transaction.
//   - No transaction API is documented anywhere in the platform reference.
//
// So the recovery stays blocked. It is not implemented here, and it must not be implemented
// by assuming that an updateMany() match count proves nothing raced with it - that assumption
// is exactly what Phase 3E could not confirm. If a documented atomic mechanism appears, the
// gate below is what has to change first, deliberately and in one place.

export const RECOVERY_GATE = {
  stage: 'phase3f-recovery-gate',
  status: 'blocked',
  subject: 'recovering the excerpt of 23 stored Item records from their providers\' own published text',
  manifest: {
    records: 23,
    snapshot_at: '2026-10-11T22:47:09Z',
    state: 'report only: the manifest was produced read-only and was never persisted',
  },
  documented_atomic_update: false,
  documented_transaction: false,
  documented_compare_and_set: false,
  documented_evidence:
    'The entity SDK documents a conditional update by filter and reports a changed-record count; it documents neither atomicity nor a compare-and-set guarantee, and no transaction API is documented.',
  prohibited:
    'Treating an updateMany() match count as an atomic compare-and-set. That is an unverified assumption about platform behaviour, and it is the specific reason the recovery is blocked.',
  blocked_because: [
    'ingestTrends can replace an Item excerpt and, until Phase 3F, could be reached anonymously',
    'administrators hold direct Item update rights outside any app code path',
    'the guarded excerpt update in enrichSourceText relies on conditional-update behaviour the platform does not document as atomic',
  ],
  required_before_proceeding: [
    'a documented atomic conditional write, or a documented transaction, that can preserve a precondition and refuse on conflict',
    'a demonstrable control that prevents every competing Item writer for the duration of the recovery',
    'separate, explicit authorization for the recovery run itself, with a freshly validated manifest',
  ],
};

export const RECOVERY_LIMITATIONS = {
  no_mechanism:
    'No documented atomic update, compare-and-set or transaction mechanism is available to this app, so the excerpt recovery remains blocked and is not implemented.',
  no_bypass:
    'The restriction is not bypassed with an undocumented concurrency assumption. The guarded-conditional-update code that exists elsewhere in this app is documented as an observed behaviour and a fail-closed guess, never as an atomic guarantee.',
  writers_remain:
    'Item writers remain: administrator entity access, manual ingestion (administrator-only since Phase 3F) and manual administrator enrichment. Pausing the schedule removed one writer but not the isolation problem.',
  phase_3e_accepted:
    'The Phase 3E writer-isolation finding is accepted unchanged: pausing the schedule alone was never sufficient, and nothing in Phase 3F changes that conclusion.',
};