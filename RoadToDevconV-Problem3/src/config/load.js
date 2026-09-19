// Public configuration loader. Accepts ONLY public identities.
// Refuses files that contain secret-looking keys; private keys must come
// from the environment, never from config.
import { readFileSync, existsSync } from 'node:fs';

function isAddress(value) {
  return typeof value === 'string' && /^(0x)?[0-9a-fA-F]{40}$/.test(value.trim());
}

export function loadPublicConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy config/example-config.json and fill in PUBLIC addresses.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse config at ${configPath}: ${error.message}`);
  }
  const SECRET_KEY_PATTERN = /private[_-]?key|mnemonic|seed[_-]?phrase|gift[_-]?code|api[_-]?token/i;
  const secretKeyFound = [];
  (function walkKeys(node) {
    if (Array.isArray(node)) return node.forEach(walkKeys);
    if (node !== null && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (SECRET_KEY_PATTERN.test(key)) secretKeyFound.push(key);
        walkKeys(node[key]);
      }
    }
  })(parsed);
  if (secretKeyFound.length > 0) {
    throw new Error(`Config at ${configPath} must contain PUBLIC identities only (secret-like keys: ${secretKeyFound.join(', ')}).`);
  }
  const reader = parsed.reader ?? {};
  const funding = parsed.funding ?? {};
  const publisher = parsed.publisher ?? {};
  const authority = parsed.successionAuthority ?? {};
  if (!isAddress(reader.rootOwner)) throw new Error('Config reader.rootOwner must be a 20-byte hex address.');
  if (typeof reader.rootTopic !== 'string' || reader.rootTopic.length === 0) throw new Error('Config reader.rootTopic must be a non-empty string.');
  if (!isAddress(funding.address)) throw new Error('Config funding.address must be a 20-byte hex address.');
  if (!isAddress(publisher.address)) throw new Error('Config publisher.address must be a 20-byte hex address.');
  if (typeof publisher.topic !== 'string' || publisher.topic.length === 0) throw new Error('Config publisher.topic must be a non-empty string.');
  if (!isAddress(authority.address)) throw new Error('Config successionAuthority.address must be a 20-byte hex address.');
  const roles = [funding.address.toLowerCase(), publisher.address.toLowerCase(), authority.address.toLowerCase()];
  if (new Set(roles).size !== 3) {
    throw new Error('Config must keep funding, publisher, and successionAuthority addresses DISTINCT.');
  }
  if (authority.address.toLowerCase() !== reader.rootOwner.toLowerCase()) {
    throw new Error('Config reader.rootOwner must equal successionAuthority.address (the authority owns the stable root feed).');
  }
  return { ...parsed, _path: configPath };
}

export function loadEnv(name, { required = false } = {}) {
  const value = process.env[name];
  if (required && (value === undefined || String(value).trim() === '')) {
    throw new Error(`Environment variable ${name} is required but missing. See .env.example.`);
  }
  return value;
}
