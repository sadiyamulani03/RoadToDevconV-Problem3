// Minimal lint: forbid deprecated bee-js feed APIs and secret-printing patterns.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === '.state') continue;
      walk(p, out);
    } else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts')), ...walk(join(ROOT, 'tests'))];
let failures = 0;
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  // Strip line comments and string-adjacent doc mentions so the linter only
  // flags real code usage, not documentation of what NOT to use.
  const code = raw.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
  if (/bee\s*\.\s*makeFeed(Writer|Reader)/.test(code) || /\bmakeFeed(Writer|Reader)\s*\(/.test(code)) {
    // Allow this very linter, which names the patterns to forbid.
    if (!f.endsWith('scripts/lint.js')) {
      failures++;
      console.error(`FAIL ${f}: deprecated flat feed helper found; use bee.feed.makeWriter/makeReader`);
    }
  }
  const deprecatedUpload = [...code.matchAll(/(?<!uploadData|uploadReference|uploadPayload|uploadFilesFromDirectory)\.upload\(/g)];
  if (deprecatedUpload.length > 0 && !f.endsWith('scripts/lint.js')) {
    failures++;
    console.error(`FAIL ${f}: deprecated feed writer .upload() found; use uploadReference/uploadPayload`);
  }
  for (const secret of ['FUNDING_PRIVATE_KEY)', 'PUBLISHER_PRIVATE_KEY)', 'SUCCESSION_AUTHORITY_PRIVATE_KEY)']) {
    if (code.includes(`console.log(process.env.${secret}`) || code.includes(`console.log("${secret}`)) {
      failures++;
      console.error(`FAIL ${f}: possible secret logging`);
    }
  }
}
if (failures > 0) process.exit(1);
console.log(`lint ok (${files.length} files)`);
