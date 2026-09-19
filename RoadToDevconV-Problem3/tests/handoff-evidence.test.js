// K. hand-off evidence validation — offline records are well-formed and
// honest (mode: offline, live: pending); nothing is presented as live.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemorySwarm } from '../src/succession/store.js';
import { performHandoff, buildHandoffEvidence } from '../src/succession/handoff.js';
import { AUTHORITY_KEY, PUBLISHER_A_KEY, PUBLISHER_B_KEY, AUTHORITY, PUB_A, PUB_B, ROOT_TOPIC, PUB_TOPIC, loadSeed } from './fixtures.js';
import { publishCatalogueOffline } from '../src/catalogue/publish.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function isAddress(v) {
  return typeof v === 'string' && /^(0x)?[0-9a-fA-F]{40}$/.test(v);
}

function assertEvidenceShape(ev) {
  for (const field of ['previousPublisher', 'incomingPublisher', 'rootOwner', 'rootTopic', 'authorisedAt', 'verificationMethod', 'commands', 'live', 'mechanism']) {
    assert.ok(ev[field] !== undefined, `evidence missing ${field}`);
  }
  assert.ok(isAddress(ev.incomingPublisher), 'incomingPublisher must be an address');
  assert.ok(isAddress(ev.rootOwner), 'rootOwner must be an address');
  assert.ok(Array.isArray(ev.commands) && ev.commands.length > 0, 'commands must be recorded');
  assert.equal(ev.live.executed, false);
  assert.equal(ev.live.status, 'pending');
}

describe('hand-off evidence', () => {
  it('offline hand-off produces verifiable, honestly-labelled evidence', () => {
    const store = new MemorySwarm();
    publishCatalogueOffline(store, { owner: PUB_A, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_A_KEY, catalogue: loadSeed(1) });
    // Note: catalogue published before root authorisation is fine offline; the
    // resolution test below authorises first. Here we only check evidence shape.
    const record = performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_A, incomingPublisherTopic: PUB_TOPIC,
    });
    const record2 = performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_B, incomingPublisherTopic: PUB_TOPIC,
    });
    assert.equal(record2.previousPublisher.toLowerCase(), PUB_A.toLowerCase());
    const evidence = buildHandoffEvidence(record2, { commands: ['node src/cli.js succession:handoff --incoming-address <addr>'] });
    assertEvidenceShape(evidence);
  });

  it('tracked evidence file (if present) never claims live execution it cannot prove', () => {
    const p = join(ROOT, 'evidence', 'handoff.json');
    if (!existsSync(p)) return; // pending first hand-off: acceptable, documented as pending
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    assert.ok(Array.isArray(doc.offline ?? []), 'evidence doc must carry an offline array');
    for (const ev of doc.offline ?? []) assertEvidenceShape(ev);
    if (doc.live !== null && doc.live !== undefined) {
      assert.equal(doc.live.executed, true);
      assert.ok(doc.live.txHash ?? doc.live.feedIndex !== undefined, 'live evidence must carry real network artefacts');
    }
  });
});
