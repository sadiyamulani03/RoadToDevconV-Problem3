// Succession authority: the ONLY writer of the root feed.
// The root feed maps a STABLE reader entry point (authority address + topic)
// to the CURRENT publisher identity. Publishers never write here.
//
// Enforcement (executable, not documentary):
//  1. Authority address != publisher address at every transition.
//  2. Only the authority private key can append to the root feed
//     (MemorySwarm checks key->owner derivation; live Bee/Swarm checks the
//     single-owner-chunk signature on the network).
//  3. The incoming publisher identity is a function argument, never a
//     hardcoded constant in this module.
import { normalizeAddress } from './store.js';

export const ROOT_POINTER_SCHEMA = 1;

export function buildRootPointer({ publisherAddress, publisherTopic, authorisedBy, previousPublisher = null, successionVersion = 1, authorisedAt = new Date().toISOString() }) {
  const publisher = normalizeAddress(publisherAddress);
  const authority = normalizeAddress(authorisedBy);
  if (publisher.toLowerCase() === authority.toLowerCase()) {
    throw new Error('Succession authority must be distinct from the publishing identity.');
  }
  if (typeof publisherTopic !== 'string' || publisherTopic.length === 0) {
    throw new Error('Publisher topic must be a non-empty string.');
  }
  if (previousPublisher !== null) {
    normalizeAddress(previousPublisher);
    if (String(previousPublisher).toLowerCase() === publisher.toLowerCase()) {
      throw new Error('Incoming publisher must differ from the previous publisher.');
    }
  }
  if (!Number.isInteger(successionVersion) || successionVersion < 1) {
    throw new Error('successionVersion must be an integer >= 1.');
  }
  return {
    schema: ROOT_POINTER_SCHEMA,
    successionVersion,
    publisherAddress: publisher,
    publisherTopic,
    authorisedBy: authority,
    previousPublisher,
    authorisedAt,
  };
}

/** Authorise `incoming` as the next publisher (offline, against MemorySwarm). */
export function authorizeSuccessor(store, { rootOwner, rootTopic, authorityPrivateKey, incomingPublisherAddress, incomingPublisherTopic, successionVersion }) {
  if (typeof incomingPublisherAddress !== 'string' || incomingPublisherAddress.trim() === '') {
    throw new Error('Incoming publisher identity must be supplied externally (address argument, env, or CLI flag).');
  }
  const current = store.readRootFeed({ owner: rootOwner, topic: rootTopic });
  const previousPublisher = current.status === 'found' ? current.payload.publisherAddress : null;
  const pointer = buildRootPointer({
    publisherAddress: incomingPublisherAddress,
    publisherTopic: incomingPublisherTopic,
    authorisedBy: rootOwner,
    previousPublisher,
    successionVersion: successionVersion ?? (current.status === 'found' ? current.payload.successionVersion + 1 : 1),
  });
  return store.publishRootPointer({ owner: rootOwner, topic: rootTopic, authorityPrivateKey, pointer });
}

/** Verify the root feed state: authority separation + expected publisher. */
export function verifyAuthority(store, { rootOwner, rootTopic, expectedPublisher = null }) {
  const current = store.readRootFeed({ owner: rootOwner, topic: rootTopic });
  if (current.status !== 'found') {
    return { ok: false, reason: 'root feed is empty: no publisher has been authorised yet' };
  }
  const p = current.payload;
  const checks = {
    authorityOwnsRoot: true, // structurally true: root feed owner IS the authority
    authorityDistinctFromPublisher: p.authorisedBy.toLowerCase() !== p.publisherAddress.toLowerCase(),
    pointerAuthorisedByRootOwner: p.authorisedBy.toLowerCase() === normalizeAddress(rootOwner).toLowerCase(),
  };
  if (expectedPublisher !== null) {
    checks.expectedPublisherMatches = p.publisherAddress.toLowerCase() === normalizeAddress(expectedPublisher).toLowerCase();
  }
  const ok = Object.values(checks).every(Boolean);
  return { ok, checks, pointer: p, index: current.index };
}
