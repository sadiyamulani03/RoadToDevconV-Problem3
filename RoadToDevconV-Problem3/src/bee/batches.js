// Postage batch management.
// Pure planning/selection logic is fully testable offline. Live Bee calls
// (bee.stamp.*) are isolated in the `live*` functions and never run in `npm test`.

export function remainingBytes(batch) {
  if (typeof batch?.remainingSize?.toBytes === 'function') return Number(batch.remainingSize.toBytes());
  if (typeof batch?.remainingSize === 'number') return batch.remainingSize;
  if (typeof batch?.remainingSize === 'bigint') return Number(batch.remainingSize);
  if (typeof batch?.remainingCapacity === 'number') return batch.remainingCapacity;
  return NaN;
}

export function batchIdOf(batch) {
  try {
    return String(batch?.batchID?.toString?.() ?? batch?.batchID ?? '').toLowerCase();
  } catch {
    return '';
  }
}

/** Select the first usable batch with remaining space. Returns undefined when none match. */
export function selectUsableBatch(batches, minRemainingBytes = 1) {
  if (!Array.isArray(batches)) throw new Error('Postage batches must be an array.');
  return batches.find((b) => b?.usable === true && remainingBytes(b) >= minRemainingBytes);
}

export function findBatchById(batches, batchId) {
  if (!Array.isArray(batches)) throw new Error('Postage batches must be an array.');
  const needle = String(batchId ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(needle)) throw new Error('Batch id must be a 64-char hex string.');
  return batches.find((b) => batchIdOf(b) === needle);
}

export function formatBatchSummary(batch) {
  if (!batch) throw new Error('Cannot summarize an empty batch.');
  const id = batchIdOf(batch) || 'unknown';
  const usage = batch.usageText ?? String(batch.usage ?? 'unknown');
  let depth = batch.depth ?? 'unknown';
  let amount = batch.amount ?? 'unknown';
  return `batch ${id} | usable=${batch.usable} | depth=${depth} | amount=${amount} | usage=${usage}`;
}

// ---- Extension / top-up planning (pure, offline) ----

export function planTopUp({ batch, additionalAmount }) {
  if (!batch) throw new Error('Configured batch does not exist. Refusing unsafe top-up of an unknown batch.');
  const amount = BigInt(additionalAmount ?? 0);
  if (amount <= 0n) throw new Error('Top-up amount must be a positive integer (in postage-amount units).');
  if (batch.immutable === true) {
    return { operation: 'topUp', allowed: true, note: 'immutable batch: top-up extends duration without changing capacity' };
  }
  return { operation: 'topUp', allowed: true, note: 'top-up extends duration' };
}

/**
 * Plan a DILUTE (capacity extension = increase depth). Diluting is the
 * "extend" half of extend/top-up: it increases capacity, which also extends
 * effective duration per chunk. Distinct from creating a new batch.
 */
export function planDilute({ batch, newDepth }) {
  if (!batch) throw new Error('Configured batch does not exist. Refusing unsafe dilute of an unknown batch.');
  const depth = Number(newDepth);
  if (!Number.isInteger(depth) || depth < 17 || depth > 255) {
    throw new Error('New depth must be an integer between 17 and 255.');
  }
  const current = Number(batch.depth);
  if (Number.isInteger(current) && depth <= current) {
    throw new Error(`Refusing dilute: new depth (${depth}) must be greater than current depth (${current}). Dilute only extends.`);
  }
  return { operation: 'dilute', allowed: true, fromDepth: current, toDepth: depth };
}

/** Describe the required distinction: CREATE vs EXTEND/TOP-UP an existing batch. */
export function describeBatchStrategy({ configuredBatchId, batches }) {
  const existing = batches?.find((b) => batchIdOf(b) === String(configuredBatchId ?? '').toLowerCase());
  if (existing) {
    return { strategy: 'extend-or-topup-existing', batchId: configuredBatchId, reason: 'configured batch exists on the node; maintain it instead of buying a new one' };
  }
  return { strategy: 'create-new', reason: 'configured batch not found on the node; a new batch must be purchased by the FUNDING identity' };
}

// ---- Live Bee operations (gated; require a running node) ----

export async function liveInspectBatches(bee) {
  try {
    return await bee.stamp.getAll();
  } catch (error) {
    throw new Error(`Bee node unavailable or stamp listing failed: ${error?.message ?? error}`);
  }
}

export async function liveTopUpBatch(bee, batchId, amount) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(batchId ?? '').trim())) {
    throw new Error('Configured batch does not exist or batch id is malformed. Provide BATCH_ID as 64 hex chars.');
  }
  if (BigInt(amount ?? 0) <= 0n) throw new Error('Top-up amount must be positive.');
  return bee.stamp.topUp(String(batchId).trim(), BigInt(amount));
}

export async function liveDiluteBatch(bee, batchId, newDepth) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(batchId ?? '').trim())) {
    throw new Error('Configured batch does not exist or batch id is malformed. Provide BATCH_ID as 64 hex chars.');
  }
  const depth = Number(newDepth);
  if (!Number.isInteger(depth) || depth < 17 || depth > 255) throw new Error('New depth must be an integer 17..255.');
  return bee.stamp.dilute(String(batchId).trim(), depth);
}
