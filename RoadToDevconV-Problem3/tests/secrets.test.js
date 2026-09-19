// J. secret scanning — the tracked tree must contain no credentials.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.state']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(p, out);
    } else if (entry === 'package-lock.json') continue;
    else out.push(p);
  }
  return out;
}

describe('no secrets in tracked files', () => {
  it('no .env file exists in the project root', () => {
    let entries = [];
    try { entries = readdirSync(ROOT); } catch { entries = []; }
    assert.ok(!entries.includes('.env'), '.env must never exist in the tracked tree');
  });

  it('no private-key values, mnemonics, gift codes, or auth URLs in text files', () => {
    const offenders = [];
    for (const f of walk(ROOT)) {
      let text;
      try { text = readFileSync(f, 'utf8'); } catch { continue; }
      if (/(FUNDING_PRIVATE_KEY|PUBLISHER_PRIVATE_KEY|SUCCESSION_AUTHORITY_PRIVATE_KEY|INCOMING_PUBLISHER_PRIVATE_KEY)\s*=\s*[0-9a-fA-F]{32,}/.test(text)) offenders.push(`${f}: key assignment with value`);
      if (/https?:\/\/[^/\s]*:[^@/\s]+@/.test(text)) offenders.push(`${f}: authenticated URL`);
      if (/(mnemonic|gift[_-]?code)\s*[:=]\s*(0x)?[0-9a-fA-F]{16,}/i.test(text)) offenders.push(`${f}: mnemonic/gift value`);
      if (/PRIVATE KEY.*"[0-9a-f]{64}"/.test(text) && !f.endsWith('.test.js') && !f.includes('fixtures.js') && !f.includes('demo-offline.js')) {
        offenders.push(`${f}: embedded private key value`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('example config and .env.example carry no secret values', () => {
    const exampleConfig = readFileSync(join(ROOT, 'config/example-config.json'), 'utf8');
    assert.ok(!/privatekey/i.test(exampleConfig), 'example config must not mention private keys as values');
    const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8');
    assert.ok(!/[0-9a-fA-F]{64}/.test(envExample), '.env.example must not contain hex secrets');
  });
});
