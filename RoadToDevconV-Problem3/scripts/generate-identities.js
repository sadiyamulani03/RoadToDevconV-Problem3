// Generate three DISTINCT role identities (funding, publisher, authority).
// Prints PUBLIC addresses to stdout and SECRET keys to a git-ignored file.
// Usage: npm run identities:generate [-- --out .state/identities.json]
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrivateKey } from '@ethersphere/bee-js';

function gen(label) {
  const pk = new PrivateKey(`0x${randomBytes(32).toString('hex')}`);
  return { label, privateKey: pk.toHex(), address: pk.publicKey().address().toHex() };
}

const roles = [gen('funding'), gen('publisher'), gen('successionAuthority')];
const out = resolve(process.argv[3] ?? '.state/identities.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ _warning: 'SECRETS — never commit this file', roles }, null, 2)}\n`);
console.log('Generated 3 distinct role identities.');
console.log(`Secrets written to (git-ignored): ${out}`);
console.log('Public addresses (safe to put in config):');
for (const r of roles) console.log(`  ${r.label}: 0x${r.address}`);
console.log('Next: export the keys as env vars (FUNDING_PRIVATE_KEY, PUBLISHER_PRIVATE_KEY, SUCCESSION_AUTHORITY_PRIVATE_KEY).');
