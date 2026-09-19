// Secret scanner: fails when tracked files contain secrets or auth URLs.
// Scans the working tree (excluding node_modules/.git/.state/.env).
// Run: npm run secrets:scan
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.state', '.opencode']);
const SKIP_FILES = new Set(['package-lock.json']);

const PATTERNS = [
  { name: 'private-key-env-assignment', re: /(FUNDING_PRIVATE_KEY|PUBLISHER_PRIVATE_KEY|SUCCESSION_AUTHORITY_PRIVATE_KEY|INCOMING_PUBLISHER_PRIVATE_KEY)\s*=\s*[0-9a-fA-F]{32,}/ },
  { name: '0x-64hex-after-keyword', re: /(private[_-]?key|mnemonic|gift[_-]?code)\s*[:=]\s*(0x)?[0-9a-fA-F]{64}/i },
  { name: 'bzz-auth-url', re: /https?:\/\/[^/\s]*:[^@/\s]+@/ },
  { name: 'swarm-gateway-auth', re: /gateway\.ethswarm\.org.*(api-key|apikey|token)/i },
  { name: '12-24-word-mnemonic', re: /"([a-z]+\s+){11,23}[a-z]+"/ },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(p, out);
    } else {
      if (SKIP_FILES.has(entry)) continue;
      if (entry === '.env') {
        console.error(`FAIL: tracked secret file: ${p}`);
        process.exitCode = 1;
        continue;
      }
      out.push(p);
    }
  }
  return out;
}

const remarried = process.argv.includes('--staged');
let failures = 0;

// Hard refusals: files that must never be tracked, even if empty/placeholder.
for (const forbidden of ['.env', '.env.local']) {
  if (existsSync(join(ROOT, forbidden))) {
    // Only a failure if git tracks it — check via git ls-files when available.
    failures++;
    console.error(`FAIL: ${forbidden} exists in the working tree; ensure it is NOT tracked (git ls-files must not list it).`);
  }
}

const files = walk(ROOT).filter((f) => !f.endsWith('.png') && !f.endsWith('.zip') && !f.endsWith('.docx'));
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue; // binary
  }
  // Allowlist: .env.example and docs may show placeholder key NAMES with empty values only.
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) {
      // Permit .env.example lines like KEY= (empty) — the regexes above require values, so any hit is real.
      failures++;
      console.error(`FAIL ${f}: matched ${name}`);
    }
  }
  if (/(0x)?[0-9a-fA-F]{64}/.test(text) && /PRIVATE KEY|privateKey.*=.*"[0-9a-f]{64}/.test(text)) {
    failures++;
    console.error(`FAIL ${f}: looks like an embedded private key value`);
  }
}
if (failures > 0) {
  console.error(`secret scan FAILED (${failures} problem(s))`);
  process.exit(1);
}
console.log(`secret scan ok (${files.length} files)`);
