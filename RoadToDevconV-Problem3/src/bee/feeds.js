// Feed helpers — verified against @ethersphere/bee-js@13.1.0.
// Namespaced API only: bee.feed.makeWriter / makeReader / createManifest.
// Deprecated flat helpers (makeFeedWriter) and deprecated writer.upload() are NOT used.
import { Topic, PrivateKey, EthAddress } from '@ethersphere/bee-js';

export function makeTopic(topic) {
  if (typeof topic !== 'string' || topic.length === 0) {
    throw new Error('Feed topic must be a non-empty string.');
  }
  return Topic.fromString(topic);
}

export function makeOwner(address) {
  const value = String(address ?? '').trim();
  if (!/^(0x)?[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Feed owner must be a 20-byte hex address, got ${JSON.stringify(address)}.`);
  }
  return new EthAddress(value);
}

export function makePrivateKey(hexKey, label = 'Private key') {
  const value = String(hexKey ?? '').trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex string (64 hex chars). It was not provided or is malformed.`);
  }
  return new PrivateKey(value);
}

export function addressOfPrivateKey(hexKey) {
  return makePrivateKey(hexKey).publicKey().address().toHex().toLowerCase();
}

export function makeReader(bee, topic, owner) {
  return bee.feed.makeReader(makeTopic(topic), makeOwner(owner));
}

export function makeWriter(bee, topic, privateKeyHex) {
  return bee.feed.makeWriter(makeTopic(topic), makePrivateKey(privateKeyHex, 'Publisher private key'));
}

export function assertHex64(name, value) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value.trim())) {
    throw new Error(`${name} must be a 64-char hex string.`);
  }
  return value.trim().toLowerCase();
}

/**
 * Publish a catalogue reference to a publisher feed (LIVE).
 * Uses writer.uploadReference(batchId, ref) with NO explicit index so the SDK
 * resolves the next network index internally (findNextIndex).
 */
export async function publishReferenceToFeed(bee, { topic, publisherPrivateKey, postageBatchId, reference }) {
  if (typeof topic !== 'string' || topic.length === 0) throw new Error('Feed topic must be a non-empty string.');
  if (typeof publisherPrivateKey !== 'string' || publisherPrivateKey.trim() === '') {
    throw new Error('Publisher private key is required for feed writes (provide PUBLISHER_PRIVATE_KEY).');
  }
  assertHex64('postageBatchId', postageBatchId);
  assertHex64('reference', reference);
  const writer = makeWriter(bee, topic, publisherPrivateKey);
  return writer.uploadReference(postageBatchId.trim(), reference.trim());
}

/**
 * Publish a root pointer payload (JSON) to the succession-authority feed (LIVE).
 * The root feed carries a small signed JSON document, not a content reference,
 * so readers can discover WHO is authorised without trusting the publisher.
 */
export async function publishRootPayloadToFeed(bee, { topic, authorityPrivateKey, postageBatchId, payloadObject }) {
  if (typeof topic !== 'string' || topic.length === 0) throw new Error('Root feed topic must be a non-empty string.');
  if (typeof authorityPrivateKey !== 'string' || authorityPrivateKey.trim() === '') {
    throw new Error('Succession authority private key is required (provide SUCCESSION_AUTHORITY_PRIVATE_KEY).');
  }
  assertHex64('postageBatchId', postageBatchId);
  const writer = bee.feed.makeWriter(makeTopic(topic), makePrivateKey(authorityPrivateKey, 'Succession authority private key'));
  const payload = Buffer.from(JSON.stringify(payloadObject), 'utf8');
  return writer.uploadPayload(postageBatchId.trim(), payload);
}

/** Read latest reference from a publisher feed (LIVE). Returns {status:'found'| 'empty', ...}. */
export async function readLatestFeedReference(bee, { topic, owner }) {
  const reader = makeReader(bee, topic, owner);
  try {
    const latest = await reader.downloadReference();
    return {
      status: 'found',
      reference: latest.reference.toHex(),
      feedIndex: latest.feedIndex.toBigInt().toString(),
      feedIndexNext: latest.feedIndexNext.toBigInt().toString(),
    };
  } catch (error) {
    if (isFeedNotFoundError(error)) return { status: 'empty' };
    throw error;
  }
}

/** Read latest payload (root pointer) from the authority feed (LIVE). */
export async function readLatestFeedPayload(bee, { topic, owner }) {
  const reader = makeReader(bee, topic, owner);
  try {
    const latest = await reader.downloadPayload();
    return {
      status: 'found',
      payload: Buffer.from(latest.payload ?? latest.reference ?? []).toString('utf8'),
      feedIndex: latest.feedIndex.toBigInt().toString(),
      feedIndexNext: latest.feedIndexNext.toBigInt().toString(),
    };
  } catch (error) {
    if (isFeedNotFoundError(error)) return { status: 'empty' };
    throw error;
  }
}

export function isFeedNotFoundError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  const status = error?.status ?? error?.statusCode;
  return status === 404 || message.includes('not found') || message.includes('no feed update');
}

/** Create a feed manifest (one-time, LIVE) for a stable /bzz/ URL. */
export async function createFeedManifest(bee, { postageBatchId, topic, owner }) {
  assertHex64('postageBatchId', postageBatchId);
  return bee.feed.createManifest(postageBatchId.trim(), makeTopic(topic), makeOwner(owner));
}
