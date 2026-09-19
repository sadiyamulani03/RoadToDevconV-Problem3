// Gated live tests — SKIPPED unless LIVE=1 with BEE_URL + credentials.
// Never runs in ordinary CI (`npm test` excludes this file).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const LIVE = process.env.LIVE === '1';

describe('live Bee integration (gated)', () => {
  it('checks Bee connectivity when LIVE=1', async () => {
    if (!LIVE) { console.log('skip: set LIVE=1 with BEE_URL to run live tests'); return; }
    const { createBeeClient, checkBeeConnectivity } = await import('../src/bee/client.js');
    const bee = createBeeClient(process.env.BEE_URL);
    const result = await checkBeeConnectivity(bee);
    assert.equal(result.ok, true);
  });

  it('lists real postage batches when LIVE=1', async () => {
    if (!LIVE) { console.log('skip: set LIVE=1 with BEE_URL to run live tests'); return; }
    const { createBeeClient } = await import('../src/bee/client.js');
    const { liveInspectBatches } = await import('../src/bee/batches.js');
    const bee = createBeeClient(process.env.BEE_URL);
    const batches = await liveInspectBatches(bee);
    assert.ok(Array.isArray(batches));
  });
});
