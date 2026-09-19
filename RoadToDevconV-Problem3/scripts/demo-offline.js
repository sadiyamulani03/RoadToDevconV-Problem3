// Offline end-to-end demo: A -> B -> C with a stable reader root.
// Uses deterministic TEST keys (clearly labelled) and the in-memory Swarm.
// No network, no secrets, no fabrication — every step is executed for real
// against MemorySwarm and printed.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrivateKey } from '@ethersphere/bee-js';
import { MemorySwarm, normalizeAddress } from '../src/succession/store.js';
import { publishCatalogueOffline } from '../src/catalogue/publish.js';
import { performHandoff } from '../src/succession/handoff.js';
import { resolveCatalogue } from '../src/succession/resolve.js';
import { validateCatalogue } from '../src/catalogue/validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Deterministic demo keys — TEST/DEMO ONLY, never mainnet, never committed as live secrets.
const AUTHORITY_KEY = new PrivateKey('0x' + '11'.repeat(32)).toHex();
const PUBLISHER_A_KEY = new PrivateKey('0x' + '22'.repeat(32)).toHex();
const PUBLISHER_B_KEY = new PrivateKey('0x' + '33'.repeat(32)).toHex();
const PUBLISHER_C_KEY = new PrivateKey('0x' + '44'.repeat(32)).toHex();
const addrOf = (k) => normalizeAddress(new PrivateKey(k).publicKey().address().toHex());

const AUTHORITY = addrOf(AUTHORITY_KEY);
const A = addrOf(PUBLISHER_A_KEY);
const B = addrOf(PUBLISHER_B_KEY);
const C = addrOf(PUBLISHER_C_KEY);
const ROOT_TOPIC = 'monastery-catalogue-root-v1';
const PUB_TOPIC = 'monastery-catalogue-pub-v1';

const seed = JSON.parse(readFileSync(resolve(ROOT, 'data/seed-catalogue.json'), 'utf8'));
const store = new MemorySwarm();
const readerRoot = `${AUTHORITY}/${ROOT_TOPIC}`;
console.log(`READER ROOT (stable): ${readerRoot}\n`);

// A publishes V1
const v1 = { ...seed, catalogueVersion: 1 };
validateCatalogue(v1);
performHandoff(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY, incomingPublisherAddress: A, incomingPublisherTopic: PUB_TOPIC });
const p1 = publishCatalogueOffline(store, { owner: A, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_A_KEY, catalogue: v1 });
let r = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
console.log(`A publishes V1: ref=${p1.reference.slice(0, 16)}… index=${p1.feedIndex} | reader sees v${r.catalogue.catalogueVersion} from ${r.publisher.address}`);

// A -> B, B publishes V2
const h1 = performHandoff(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY, incomingPublisherAddress: B, incomingPublisherTopic: PUB_TOPIC });
const v2 = { ...seed, catalogueVersion: 2, updatedAt: '2026-09-02T00:00:00.000Z' };
const p2 = publishCatalogueOffline(store, { owner: B, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_B_KEY, catalogue: v2 });
r = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
console.log(`A->B (root index ${h1.feedIndex}); B publishes V2: ref=${p2.reference.slice(0, 16)}… | reader sees v${r.catalogue.catalogueVersion} from ${r.publisher.address}`);

// B -> C, C publishes V3
const h2 = performHandoff(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC, authorityPrivateKey: AUTHORITY_KEY, incomingPublisherAddress: C, incomingPublisherTopic: PUB_TOPIC });
const v3 = { ...seed, catalogueVersion: 3, updatedAt: '2026-09-03T00:00:00.000Z' };
const p3 = publishCatalogueOffline(store, { owner: C, topic: PUB_TOPIC, publisherPrivateKey: PUBLISHER_C_KEY, catalogue: v3 });
r = resolveCatalogue(store, { rootOwner: AUTHORITY, rootTopic: ROOT_TOPIC });
console.log(`B->C (root index ${h2.feedIndex}); C publishes V3: ref=${p3.reference.slice(0, 16)}… | reader sees v${r.catalogue.catalogueVersion} from ${r.publisher.address}`);
console.log(`\nReader root unchanged throughout: ${readerRoot}`);
console.log('Demo complete: succession is a repeatable process (A->B->C), not a one-time migration.');
