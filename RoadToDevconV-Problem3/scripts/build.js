// Build: validate tracked JSON + catalogue fixture + config invariants.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalogue } from '../src/catalogue/validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok: ${name}`); }
  catch (error) { failures++; console.error(`FAIL: ${name}: ${error.message}`); }
}
check('seed catalogue validates', () => {
  validateCatalogue(JSON.parse(readFileSync(resolve(ROOT, 'data/seed-catalogue.json'), 'utf8')));
});
check('example config is public-only + roles distinct', async () => {
  const { loadPublicConfig } = await import('../src/config/load.js');
  loadPublicConfig(resolve(ROOT, 'config/example-config.json'));
});
check('handoff evidence parses (if present)', () => {
  const p = resolve(ROOT, 'evidence/handoff.json');
  if (existsSync(p)) JSON.parse(readFileSync(p, 'utf8'));
});
if (failures > 0) { console.error(`build failed (${failures})`); process.exit(1); }
console.log('build ok');
