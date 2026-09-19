// Parameterised hand-off: handoff(incomingPublisherIdentity).
// The incoming identity ALWAYS arrives from outside this module
// (CLI --incoming-address, INCOMING_PUBLISHER_ADDRESS env, or config).
// Nothing in this file names a successor.
import { authorizeSuccessor, verifyAuthority } from './authority.js';
import { normalizeAddress } from './store.js';

export function performHandoff(store, { rootOwner, rootTopic, authorityPrivateKey, incomingPublisherAddress, incomingPublisherTopic, successionVersion, timestamp = new Date().toISOString() }) {
  if (typeof incomingPublisherAddress !== 'string' || incomingPublisherAddress.trim() === '') {
    throw new Error('Incoming publisher identity must be supplied. Use --incoming-address <0x...> or INCOMING_PUBLISHER_ADDRESS.');
  }
  if (typeof authorityPrivateKey !== 'string' || authorityPrivateKey.trim() === '') {
    throw new Error('Succession authority private key is required (SUCCESSION_AUTHORITY_PRIVATE_KEY).');
  }
  const before = store.readRootFeed({ owner: rootOwner, topic: rootTopic });
  const entry = authorizeSuccessor(store, {
    rootOwner,
    rootTopic,
    authorityPrivateKey,
    incomingPublisherAddress,
    incomingPublisherTopic,
    successionVersion,
  });
  const verification = verifyAuthority(store, { rootOwner, rootTopic, expectedPublisher: incomingPublisherAddress });
  if (!verification.ok) {
    throw new Error(`Hand-off verification failed: ${JSON.stringify(verification.checks)}`);
  }
  return {
    mode: 'offline',
    previousPublisher: before.status === 'found' ? before.payload.publisherAddress : null,
    incomingPublisher: normalizeAddress(incomingPublisherAddress),
    publisherTopic: incomingPublisherTopic,
    rootOwner: normalizeAddress(rootOwner),
    rootTopic,
    feedIndex: entry.index,
    successionVersion: entry.payload.successionVersion,
    authorisedAt: timestamp,
    verification: verification.checks,
  };
}

export function buildHandoffEvidence(record, { live = null, commands = [], mechanism = 'root-feed-authority-pointer' } = {}) {
  return {
    schema: 'succession-handoff/1',
    mechanism,
    previousPublisher: record.previousPublisher,
    incomingPublisher: record.incomingPublisher,
    rootOwner: record.rootOwner,
    rootTopic: record.rootTopic,
    feedIndex: record.feedIndex ?? null,
    successionVersion: record.successionVersion ?? null,
    authorisedAt: record.authorisedAt,
    verification: record.verification ?? null,
    verificationMethod: 'verifyAuthority: root-feed owner == authority; authorisedBy == root owner; publisher != authority; expected publisher matches',
    commands,
    live: live ?? { executed: false, status: 'pending', note: 'No live Bee hand-off performed yet. Run succession:handoff against a live Bee node and append the resulting evidence.' },
  };
}
