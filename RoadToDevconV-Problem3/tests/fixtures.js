// Shared deterministic fixtures — TEST ONLY keys (never live secrets).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrivateKey } from '@ethersphere/bee-js';
import { normalizeAddress } from '../src/succession/store.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const AUTHORITY_KEY = new PrivateKey(`0x${'11'.repeat(32)}`).toHex();
export const FUNDING_KEY = new PrivateKey(`0x${'aa'.repeat(32)}`).toHex();
export const PUBLISHER_A_KEY = new PrivateKey(`0x${'22'.repeat(32)}`).toHex();
export const PUBLISHER_B_KEY = new PrivateKey(`0x${'33'.repeat(32)}`).toHex();
export const PUBLISHER_C_KEY = new PrivateKey(`0x${'44'.repeat(32)}`).toHex();

export const addrOf = (key) => normalizeAddress(new PrivateKey(key).publicKey().address().toHex());

export const AUTHORITY = addrOf(AUTHORITY_KEY);
export const FUNDING = addrOf(FUNDING_KEY);
export const PUB_A = addrOf(PUBLISHER_A_KEY);
export const PUB_B = addrOf(PUBLISHER_B_KEY);
export const PUB_C = addrOf(PUBLISHER_C_KEY);

export const ROOT_TOPIC = 'monastery-catalogue-root-v1';
export const PUB_TOPIC = 'monastery-catalogue-pub-v1';

export function loadSeed(version = 1, updatedAt = '2026-09-01T00:00:00.000Z') {
  const seed = JSON.parse(readFileSync(resolve(ROOT, 'data/seed-catalogue.json'), 'utf8'));
  return { ...seed, catalogueVersion: version, updatedAt };
}
