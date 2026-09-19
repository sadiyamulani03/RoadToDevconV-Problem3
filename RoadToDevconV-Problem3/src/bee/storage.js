// Live upload/download of catalogue bytes (gated; require Bee + batch).
import { validateCatalogue } from '../catalogue/validate.js';
import { canonicalBytes } from '../catalogue/canonicalize.js';

export async function uploadCatalogue(bee, { batchId, catalogue }) {
  validateCatalogue(catalogue);
  if (!/^[0-9a-fA-F]{64}$/.test(String(batchId ?? '').trim())) {
    throw new Error('Configured batch does not exist or batch id is malformed. Provide BATCH_ID as 64 hex chars.');
  }
  const data = canonicalBytes(catalogue);
  // bee.uploadData is the v13 data-bytes upload; tag/options omitted for determinism.
  const result = await bee.uploadData(String(batchId).trim(), data);
  return { reference: result.reference.toHex(), bytes: data.length };
}

export async function downloadCatalogue(bee, reference) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(reference ?? '').trim())) {
    throw new Error('Catalogue reference must be a 64-char hex string.');
  }
  const data = await bee.downloadData(String(reference).trim());
  const parsed = JSON.parse(Buffer.from(data).toString('utf8'));
  validateCatalogue(parsed);
  return parsed;
}
