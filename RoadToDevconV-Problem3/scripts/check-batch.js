// Batch inspection (live, gated). Read-only; reports real node state.
import { config as loadDotenv } from 'dotenv';
import { createBeeClient } from '../src/bee/client.js';
import { liveInspectBatches, formatBatchSummary, findBatchById } from '../src/bee/batches.js';

loadDotenv();
const beeUrl = process.env.BEE_URL ?? 'http://localhost:1633';
const bee = createBeeClient(beeUrl);
let batches;
try {
  batches = await liveInspectBatches(bee);
} catch (error) {
  console.error(`Error: Bee node unavailable at BEE_URL (${beeUrl}). ${error.message}`);
  process.exit(2);
}
if (batches.length === 0) {
  console.log('No postage batches on this node. The FUNDING identity must buy one (bee.storage.buy) before publishing.');
  process.exit(0);
}
for (const b of batches) console.log(formatBatchSummary(b));
if (process.env.BATCH_ID) {
  const found = (() => { try { return findBatchById(batches, process.env.BATCH_ID); } catch { return undefined; } })();
  console.log(found ? `Configured BATCH_ID found on node.` : `Configured BATCH_ID NOT found on node — inspect before publishing.`);
}
