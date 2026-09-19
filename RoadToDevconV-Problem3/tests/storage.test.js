// I. storage extension/top-up command path (pure planning + live isolation).
// CREATE vs EXTEND/TOP-UP are distinct, tested operations.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectUsableBatch, findBatchById, planTopUp, planDilute, describeBatchStrategy, formatBatchSummary,
} from '../src/bee/batches.js';

const BATCH = 'ab'.repeat(32);
function fakeBatch(overrides = {}) {
  return { batchID: { toString: () => BATCH }, usable: true, remainingSize: 1000n, depth: 20, amount: '100', ...overrides };
}

describe('batch selection', () => {
  it('selects a usable batch and refuses when none match', () => {
    const batch = fakeBatch();
    assert.equal(selectUsableBatch([batch]), batch);
    assert.equal(selectUsableBatch([{ ...fakeBatch(), usable: false }]), undefined);
    assert.equal(selectUsableBatch([]), undefined);
    assert.throws(() => selectUsableBatch('nope'), /array/i);
  });

  it('finds a batch by id and rejects malformed ids', () => {
    assert.ok(findBatchById([fakeBatch()], BATCH));
    assert.equal(findBatchById([fakeBatch()], 'cd'.repeat(32)), undefined);
    assert.throws(() => findBatchById([fakeBatch()], 'short'), /64-char hex/i);
  });

  it('summarises a batch and refuses empty input', () => {
    assert.match(formatBatchSummary(fakeBatch()), new RegExp(BATCH.slice(0, 8)));
    assert.throws(() => formatBatchSummary(null), /empty batch/i);
  });
});

describe('extend (dilute) vs top-up vs create', () => {
  it('top-up plans duration extension and rejects non-positive amounts', () => {
    const plan = planTopUp({ batch: fakeBatch({ immutable: true }), additionalAmount: 100n });
    assert.equal(plan.operation, 'topUp');
    assert.throws(() => planTopUp({ batch: fakeBatch(), additionalAmount: 0n }), /positive/i);
    assert.throws(() => planTopUp({ batch: null, additionalAmount: 10n }), /does not exist/i);
  });

  it('dilute plans capacity extension and refuses shrink/same-depth', () => {
    const plan = planDilute({ batch: fakeBatch({ depth: 20 }), newDepth: 21 });
    assert.equal(plan.operation, 'dilute');
    assert.deepEqual([plan.fromDepth, plan.toDepth], [20, 21]);
    assert.throws(() => planDilute({ batch: fakeBatch({ depth: 20 }), newDepth: 20 }), /greater than current/i);
    assert.throws(() => planDilute({ batch: fakeBatch({ depth: 20 }), newDepth: 19 }), /greater than current/i);
    assert.throws(() => planDilute({ batch: fakeBatch(), newDepth: 5 }), /17.*255|integer/i);
    assert.throws(() => planDilute({ batch: null, newDepth: 21 }), /does not exist/i);
  });

  it('strategy distinguishes maintaining an existing batch from buying new', () => {
    const keep = describeBatchStrategy({ configuredBatchId: BATCH, batches: [fakeBatch()] });
    assert.equal(keep.strategy, 'extend-or-topup-existing');
    const create = describeBatchStrategy({ configuredBatchId: BATCH, batches: [] });
    assert.equal(create.strategy, 'create-new');
  });
});
