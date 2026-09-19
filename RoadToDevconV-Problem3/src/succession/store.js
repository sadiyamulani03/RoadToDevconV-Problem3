// Offline Swarm analogue for deterministic tests and demos.
// Mirrors the live model without network:
//   - immutable content store: ref (sha256 hex) -> canonical bytes
//   - publisher feeds: (owner, topic) -> ordered list of { index, reference }
//   - root feed: (authorityOwner, rootTopic) -> ordered list of signed pointer payloads
// Writes enforce single-owner semantics: the supplied private key MUST derive
// to the feed owner, otherwise the write is rejected. This is the same
// secp256k1 identity model Bee/Swarm uses (via bee-js PrivateKey), executed
// locally so `npm test` needs no Bee node.
import { createHash } from 'node:crypto';
import { PrivateKey } from '@ethersphere/bee-js';

export function shaRef(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function addressOf(hexKey) {
  const value = String(hexKey ?? '').trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Private key must be a 32-byte hex string.');
  }
  return new PrivateKey(value).publicKey().address().toHex().toLowerCase();
}

export function normalizeAddress(address) {
  const value = String(address ?? '').trim().toLowerCase();
  if (!/^(0x)?[0-9a-f]{40}$/.test(value)) {
    throw new Error(`Invalid Ethereum address: ${JSON.stringify(address)}`);
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}

export class MemorySwarm {
  constructor() {
    this.content = new Map(); // ref -> Buffer
    this.publisherFeeds = new Map(); // `${owner}|${topic}` -> [{ index, reference }]
    this.rootFeeds = new Map(); // `${owner}|${topic}` -> [{ index, payload }]
  }

  // ---- immutable content ----
  putContent(bytes) {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const ref = shaRef(buf);
    this.content.set(ref, buf);
    return ref;
  }

  getContent(ref) {
    const key = String(ref ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Catalogue reference must be a 64-char hex string.');
    const found = this.content.get(key);
    if (!found) throw new Error(`Content not found for reference ${key}.`);
    return found;
  }

  // ---- publisher feed (stores catalogue references) ----
  publishCatalogueRef({ owner, topic, publisherPrivateKey, reference }) {
    const ownerNorm = normalizeAddress(owner).toLowerCase();
    const signerAddr = `0x${addressOf(publisherPrivateKey)}`.toLowerCase();
    if (signerAddr !== ownerNorm) {
      throw new Error('Publisher signature rejected: private key does not derive to the feed owner.');
    }
    const ref = String(reference ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(ref)) throw new Error('Catalogue reference must be a 64-char hex string.');
    if (!this.content.has(ref)) throw new Error('Refusing to point the feed at unknown content (upload first).');
    if (typeof topic !== 'string' || topic.length === 0) throw new Error('Feed topic must be a non-empty string.');
    const key = `${ownerNorm}|${topic}`;
    const list = this.publisherFeeds.get(key) ?? [];
    const entry = { index: list.length, reference: ref };
    list.push(entry);
    this.publisherFeeds.set(key, list);
    return entry;
  }

  readPublisherFeed({ owner, topic }) {
    const key = `${normalizeAddress(owner).toLowerCase()}|${topic}`;
    const list = this.publisherFeeds.get(key) ?? [];
    if (list.length === 0) return { status: 'empty' };
    const latest = list[list.length - 1];
    return { status: 'found', ...latest, feedIndexNext: latest.index + 1 };
  }

  // ---- root feed (stores succession pointer payloads, signed by authority) ----
  publishRootPointer({ owner, topic, authorityPrivateKey, pointer }) {
    const ownerNorm = normalizeAddress(owner).toLowerCase();
    const signerAddr = `0x${addressOf(authorityPrivateKey)}`.toLowerCase();
    if (signerAddr !== ownerNorm) {
      throw new Error('Authority signature rejected: private key does not derive to the root feed owner.');
    }
    if (typeof topic !== 'string' || topic.length === 0) throw new Error('Root feed topic must be a non-empty string.');
    const key = `${ownerNorm}|${topic}`;
    const list = this.rootFeeds.get(key) ?? [];
    const entry = { index: list.length, payload: { ...pointer } };
    list.push(entry);
    this.rootFeeds.set(key, list);
    return entry;
  }

  readRootFeed({ owner, topic }) {
    const key = `${normalizeAddress(owner).toLowerCase()}|${topic}`;
    const list = this.rootFeeds.get(key) ?? [];
    if (list.length === 0) return { status: 'empty' };
    const latest = list[list.length - 1];
    return { status: 'found', ...latest, feedIndexNext: latest.index + 1 };
  }
}
