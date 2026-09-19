// D. stable pointer resolution · E. publisher rotation · F. funding/publisher
// separation · G. authority separation · H. parameterised incoming identity
// L. A->B->C succession · M. reader continuity after rotation
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemorySwarm } from '../src/succession/store.js';
import { publishCatalogueOffline } from '../src/catalogue/publish.js';
import { authorizeSuccessor, verifyAuthority } from '../src/succession/authority.js';
import { performHandoff } from '../src/succession/handoff.js';
import { resolveCatalogue } from '../src/succession/resolve.js';
import { readerResolveOffline } from '../src/reader/resolve.js';
import {
  AUTHORITY_KEY, FUNDING_KEY, PUBLISHER_A_KEY, PUBLISHER_B_KEY, PUBLISHER_C_KEY,
  AUTHORITY, FUNDING, PUB_A, PUB_B, PUB_C, ROOT_TOPIC, PUB_TOPIC, loadSeed,
} from './fixtures.js';

function setupWithA() {
  const store = new MemorySwarm();
  authorizeSuccessor(store, {
    rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
    incomingPublisherAddress: PUB_A, incomingPublisherTopic: PUB_TOPIC, successionVersion: 1,
  });
  publishCatalogueOffline(store, { owner: PUB_A, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_A_KEY, catalogue: loadSeed(1) });
  return store;
}

describe('stable pointer resolution (reader root invariant)', () => {
  it('initial publisher is reachable through the stable root', () => {
    const store = setupWithA();
    const resolved = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    assert.equal(resolved.catalogue.catalogueVersion, 1);
    assert.equal(resolved.publisher.address.toLowerCase(), PUB_A.toLowerCase());
    assert.equal(resolved.readerRoot.owner.toLowerCase(), AUTHORITY.toLowerCase());
    assert.equal(resolved.readerRoot.topic, ROOT_TOPIC);
  });

  it('same reader root resolves new publisher + new content after rotation', () => {
    const store = setupWithA();
    const before = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_B, incomingPublisherTopic: PUB_TOPIC,
    });
    publishCatalogueOffline(store, { owner: PUB_B, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_B_KEY, catalogue: loadSeed(2, '2026-09-02T00:00:00.000Z') });
    const after = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    assert.equal(after.publisher.address.toLowerCase(), PUB_B.toLowerCase());
    assert.equal(after.catalogue.catalogueVersion, 2);
    assert.deepEqual(after.readerRoot.owner, before.readerRoot.owner);
    assert.deepEqual(after.readerRoot.topic, before.readerRoot.topic);
  });

  it('third-party reader needs only the public root (no private keys)', () => {
    const store = setupWithA();
    const resolved = readerResolveOffline(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    assert.equal(resolved.catalogue.catalogueVersion, 1);
    assert.throws(() => readerResolveOffline(store, { rootOwner: 'not-an-address', rootTopic: ROOT_TOPIC }), /root owner/i);
    assert.throws(() => readerResolveOffline(store, { rootOwner: AUTHORITY, rootTopic: '' }), /root topic/i);
  });
});

describe('publisher rotation enforcement', () => {
  it('publisher cannot write to the root feed (only authority key derives to root owner)', () => {
    const store = setupWithA();
    assert.throws(() => authorizeSuccessor(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: PUBLISHER_A_KEY,
      incomingPublisherAddress: PUB_B, incomingPublisherTopic: PUB_TOPIC,
    }), /Authority signature rejected/i);
  });

  it('old publisher cannot hijack the reader after rotation (reader follows authority)', () => {
    const store = setupWithA();
    performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_B, incomingPublisherTopic: PUB_TOPIC,
    });
    publishCatalogueOffline(store, { owner: PUB_B, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_B_KEY, catalogue: loadSeed(2, '2026-09-02T00:00:00.000Z') });
    // A can still append to A's OWN feed (cryptographically possible), but the
    // reader no longer follows A — authorisation moved to B.
    publishCatalogueOffline(store, { owner: PUB_A, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_A_KEY, catalogue: loadSeed(9, '2026-09-09T00:00:00.000Z') });
    const resolved = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    assert.equal(resolved.publisher.address.toLowerCase(), PUB_B.toLowerCase());
    assert.equal(resolved.catalogue.catalogueVersion, 2);
  });

  it('authority cannot be the publisher (separation is executable)', () => {
    const store = new MemorySwarm();
    assert.throws(() => authorizeSuccessor(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: AUTHORITY, incomingPublisherTopic: PUB_TOPIC,
    }), /distinct/i);
  });
});

describe('separate identities', () => {
  it('funding, publisher, and authority are three distinct addresses', () => {
    const roles = [FUNDING.toLowerCase(), PUB_A.toLowerCase(), AUTHORITY.toLowerCase()];
    assert.equal(new Set(roles).size, 3);
  });

  it('authority verification distinguishes publisher from authority', () => {
    const store = setupWithA();
    const v = verifyAuthority(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, expectedPublisher: PUB_A });
    assert.equal(v.ok, true);
    assert.equal(v.checks.authorityDistinctFromPublisher, true);
    assert.equal(v.checks.pointerAuthorisedByRootOwner, true);
  });

  it('funding key cannot publish (derives to a different owner)', () => {
    const store = setupWithA();
    assert.throws(() => publishCatalogueOffline(store, {
      owner: PUB_A, topic: PUB_TOPIC, publisherPrivateKey: FUNDING_KEY, catalogue: loadSeed(3),
    }), /Publisher signature rejected/i);
  });
});

describe('incoming steward supplied externally', () => {
  it('handoff refuses an empty incoming identity (no hardcoded successor)', () => {
    const store = setupWithA();
    assert.throws(() => performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: '', incomingPublisherTopic: PUB_TOPIC,
    }), /must be supplied/i);
  });

  it('handoff accepts any externally supplied address (parameterised)', () => {
    const store = setupWithA();
    const record = performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_C, incomingPublisherTopic: PUB_TOPIC,
    });
    assert.equal(record.incomingPublisher.toLowerCase(), PUB_C.toLowerCase());
    assert.ok(!Object.keys(record).includes('SUCCESSOR_ADDRESS'));
  });
});

describe('succession works twice (A -> B -> C)', () => {
  it('full chain with stable root and reachable content at every step', () => {
    const store = setupWithA();
    const roots = [];
    roots.push(resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC }).readerRoot);

    performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_B, incomingPublisherTopic: PUB_TOPIC,
    });
    publishCatalogueOffline(store, { owner: PUB_B, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_B_KEY, catalogue: loadSeed(2, '2026-09-02T00:00:00.000Z') });
    const r2 = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    assert.equal(r2.catalogue.catalogueVersion, 2);
    roots.push(r2.readerRoot);

    performHandoff(store, {
      rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY,
      incomingPublisherAddress: PUB_C, incomingPublisherTopic: PUB_TOPIC,
    });
    publishCatalogueOffline(store, { owner: PUB_C, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_C_KEY, catalogue: loadSeed(3, '2026-09-03T00:00:00.000Z') });
    const r3 = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
    assert.equal(r3.catalogue.catalogueVersion, 3);
    assert.equal(r3.publisher.address.toLowerCase(), PUB_C.toLowerCase());
    roots.push(r3.readerRoot);

    for (const r of roots) {
      assert.equal(r.owner.toLowerCase(), AUTHORITY.toLowerCase());
      assert.equal(r.topic, ROOT_TOPIC);
    }
    const v = verifyAuthority(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, expectedPublisher: PUB_C });
    assert.equal(v.ok, true);
    assert.equal(v.pointer.successionVersion, 3);
  });
});
