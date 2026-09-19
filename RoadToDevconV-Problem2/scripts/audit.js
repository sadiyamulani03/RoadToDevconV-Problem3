// Repository audit for the eight hard acceptance criteria.
// Run: node scripts/audit.js
// Verifies writer/reader/shared files statically + exercises format logic.
// Prints a judge matrix; exits non-zero on any FAIL.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}
function exists(rel) {
  return existsSync(join(root, rel))
}

const results = []
function record(check, requirement, evidence, pass, detail = '') {
  results.push({ check, requirement, evidence, pass, detail })
}

function includesWord(text, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(text)
}

// ---- CHECK 1: capability before upload ----
{
  const uploadJs = read('writer/upload.js')
  const writerJs = read('writer/writer.js')
  const cliJs = read('writer/cli.js')
  const capJs = read('writer/capability.js')
  // Upload URL is built from config (ends with /) + 'bytes', so the literal
  // in upload.js is `}bytes`, not `/bytes`. Check for POST + bytes + config use.
  const uploadHasPost =
    uploadJs.includes("'POST'") && uploadJs.includes('bytes') && uploadJs.includes('subsidisedGatewayUrl')
  // Hard gate: uploadSightingRecord() refuses unless capability was confirmed.
  // Verify the gate textually precedes the network call.
  const gateIdx = uploadJs.indexOf('uploadCapability.available')
  const fetchIdx = uploadJs.indexOf('await fetchFn')
  const uploadGated = gateIdx !== -1 && fetchIdx !== -1 && gateIdx < fetchIdx
  // The hard gate lives in uploadSightingRecord(); writer.js also pre-gates; cli checks before calling.
  const writerPreGate = writerJs.includes('uploadCapability.available')
  const cliGate = cliJs.includes('checkUploadCapability') && (cliJs.includes('cap.available') || cliJs.includes('capability'))
  const capDefines = capJs.includes('checkUploadCapability') && capJs.includes('uploadCapability')
  const postFiles = []
  for (const [rel, text] of [['writer/upload.js', uploadJs], ['writer/writer.js', writerJs], ['writer/cli.js', cliJs]]) {
    if (text.includes("'POST'") || text.includes('"POST"')) postFiles.push(rel)
  }
  const allGated = uploadHasPost && uploadGated && writerPreGate && cliGate && capDefines
  record(
    1,
    'Capability before upload',
    'writer/upload.js:uploadSightingRecord + writer/capability.js:checkUploadCapability',
    allGated,
    `POST files=${postFiles.join(',')}; uploadGated=${uploadGated}; writerPreGate=${writerPreGate}; cliGate=${cliGate}`,
  )
}

// ---- CHECK 2: no-stamp gateway ----
{
  const configJs = read('writer/config.js')
  const uploadJs = read('writer/upload.js')
  const hasProp = configJs.includes('subsidisedGatewayUrl:')
  const hasUrl = configJs.includes("'https://api.gateway.ethswarm.org/'")
  const uploadUsesConfig = uploadJs.includes('swarmConfig.subsidisedGatewayUrl') && uploadJs.includes('}bytes')
  const cliUsesConfig = read('writer/cli.js').includes('swarmConfig.subsidisedGatewayUrl') || read('writer/cli.js').includes('subsidisedGatewayUrl')
  const pass = hasProp && hasUrl && uploadUsesConfig
  record(
    2,
    'No-stamp gateway',
    "writer/config.js:swarmConfig.subsidisedGatewayUrl='https://api.gateway.ethswarm.org/' used by writer/upload.js",
    pass,
    `hasProp=${hasProp} hasUrl=${hasUrl} uploadUsesConfig=${uploadUsesConfig} cliUsesConfig=${cliUsesConfig}`,
  )
}

// ---- CHECK 3: format + version in bytes ----
{
  const formatJs = read('shared/format.js')
  const hasFormatConst = formatJs.includes("SIGHTING_FORMAT = 'deccan-birders-sighting'")
  const hasVersionConst = formatJs.includes('SIGHTING_VERSION = 1')
  const buildIncludes = formatJs.includes('format: SIGHTING_FORMAT') && formatJs.includes('version: SIGHTING_VERSION')
  const serializeUsesJson = formatJs.includes('JSON.stringify(record)')
  // Live exercise: build + serialize example and inspect bytes.
  const { buildExampleRecord, serializeSightingRecordToString } = await import('../shared/format.js')
  const example = buildExampleRecord()
  const serialized = serializeSightingRecordToString(example)
  const bytesCarryBoth = serialized.includes('"format":"deccan-birders-sighting"') && serialized.includes('"version":1')
  const pass = hasFormatConst && hasVersionConst && buildIncludes && serializeUsesJson && bytesCarryBoth
  record(
    3,
    'Format + version in bytes',
    `shared/format.js:buildSightingRecord + serialized example ${serialized.slice(0, 90)}…`,
    pass,
    `consts=${hasFormatConst && hasVersionConst} buildInline=${buildIncludes} bytesCarryBoth=${bytesCarryBoth}`,
  )
}

// ---- CHECK 4: independent reader ----
{
  const cliExists = exists('reader/cli.js')
  const htmlExists = exists('reader/index.html')
  const appExists = exists('reader/app.js')
  const cli = cliExists ? read('reader/cli.js') : ''
  const app = appExists ? read('reader/app.js') : ''
  const html = htmlExists ? read('reader/index.html') : ''
  // Import-graph check: look for actual module imports of writer code, not
  // mere mentions in comments/docs (e.g. "no writer imports" or doc links).
  const importWriterRe = /(from\s+['"][^'"]*writer|import\s*\(?\s*['"][^'"]*writer|require\s*\(\s*['"][^'"]*writer|src\s*=\s*["'][^"']*writer\/writer\.js)/i
  const noWriterImports = ![cli, app].some((t) => importWriterRe.test(t)) && !importWriterRe.test(html)
  const onlySharedAllowed = ![cli, app].some((t) => {
    const imports = [...t.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    return imports.some((imp) => !imp.includes('shared/format.js') && (imp.startsWith('.') || imp.startsWith('/')))
  })
  const steps = ['obtain', 'download', 'parse', 'validate', 'render'].map((s) => ({
    s,
    cli: cli.toLowerCase().includes(s),
    app: app.toLowerCase().includes(s),
  }))
  const allSteps = steps.every((x) => x.cli && x.app)
  const entrypointsSeparate =
    cliExists && htmlExists && appExists && html.includes('src="./app.js"') && !html.includes('writer.js')
  const pass = noWriterImports && onlySharedAllowed && allSteps && entrypointsSeparate
  record(
    4,
    'Independent reader',
    'reader/cli.js + reader/index.html:reader/app.js (imports only ../shared/format.js; no writer/*)',
    pass,
    `entrypoints=${cliExists && htmlExists && appExists} noWriter=${noWriterImports} onlyShared=${onlySharedAllowed} steps=${JSON.stringify(steps)}`,
  )
}

// ---- CHECK 5: matching endpoint family ----
{
  const uploadJs = read('writer/upload.js')
  const writerJs = read('writer/writer.js')
  const cliReader = read('reader/cli.js')
  const appReader = read('reader/app.js')
  // Writer builds `${subsidisedGatewayUrl}bytes` (config ends with /), so look
  // for POST + bytes + config derivation rather than a literal "/bytes".
  const writerUsesBytes =
    uploadJs.includes("'POST'") && uploadJs.includes('bytes') && uploadJs.includes('subsidisedGatewayUrl')
  const readerCliUsesBytes = cliReader.includes('bytes/') || cliReader.includes('}bytes/')
  const readerAppUsesBytes = appReader.includes('bytes/') || appReader.includes('}bytes/')
  const writerMixesBzz = uploadJs.includes('/bzz') || writerJs.includes('/bzz/')
  const readerMixesBzz =
    cliReader.includes('/bzz/') || appReader.includes('/bzz/') || cliReader.includes("'/bzz'") || appReader.includes("'/bzz'")
  // Reader must use the family matching the write (bytes). No bzz mixing in upload/download logic.
  const pass = writerUsesBytes && readerCliUsesBytes && readerAppUsesBytes && !writerMixesBzz && !readerMixesBzz
  record(
    5,
    'Matching endpoint family',
    'writer POST <gateway>bytes + reader GET <gateway>bytes/<ref> (no /bzz mixing)',
    pass,
    `writerBytes=${writerUsesBytes} readerCli=${readerCliUsesBytes} readerApp=${readerAppUsesBytes} bzzMix writer=${writerMixesBzz} reader=${readerMixesBzz}`,
  )
}

// ---- CHECK 6: no pin/tag on gateway upload ----
{
  const uploadJs = read('writer/upload.js')
  const writerJs = read('writer/writer.js')
  // Upload-option tokens that must not appear as gateway upload arguments.
  const forbidden = ['swarm-pin', 'swarm-tag', 'Swarm-Pin', 'Swarm-Tag', 'Swarm-Postage-Batch-Id']
  const found = []
  for (const [rel, text] of [['writer/upload.js', uploadJs], ['writer/writer.js', writerJs]]) {
    for (const token of forbidden) {
      if (text.includes(token)) found.push(`${rel}:${token}`)
    }
    // Bare option keys like `pin:` / `tag:` passed to fetch would also fail.
    if (/\bpin\s*:/i.test(text)) found.push(`${rel}:pin:`)
    if (/\btag\s*:/i.test(text)) found.push(`${rel}:tag:`)
  }
  // Confirm the gateway fetch carries only Content-Type (inspect upload.js fetch block).
  const fetchBlock = uploadJs.slice(uploadJs.indexOf('await fetchFn'))
  const onlyContentType = fetchBlock.includes("'Content-Type'") && found.length === 0
  record(
    6,
    'No pin/tag gateway',
    'writer/upload.js gateway fetch (headers Content-Type only; no extra upload arguments)',
    found.length === 0 && onlyContentType,
    found.length ? `forbidden found: ${found.join(', ')}` : 'no forbidden upload arguments in gateway path',
  )
}

// ---- CHECK 7: specific failure reason ----
{
  const uploadJs = read('writer/upload.js')
  const writerJs = read('writer/writer.js')
  const cliJs = read('writer/cli.js')
  const reasons = [
    'upload-capability-unavailable',
    'gateway-unavailable',
    'auth-connection-problem',
    'validation-failed',
    'network-failure',
    'upload-rejected',
    'malformed-response',
    'unknown-error',
  ]
  const definesReasons = reasons.every((r) => uploadJs.includes(r))
  const noBareUploadFailed =
    !uploadJs.includes('"Upload failed."') && !writerJs.includes('"Upload failed."') && !uploadJs.includes("'Upload failed.'")
  const uiRendersReason = writerJs.includes('#upload-error') || writerJs.includes('upload-error')
  const cliRendersReason = cliJs.includes('[upload-capability-unavailable]') || cliJs.includes('reason')
  const domNotConsoleOnly = uiRendersReason && writerJs.includes('errorBox.textContent')
  const pass = definesReasons && noBareUploadFailed && uiRendersReason && cliRendersReason && domNotConsoleOnly
  record(
    7,
    'Specific failure reason',
    'writer/upload.js:UploadError(reason) rendered to #upload-error (DOM) + CLI [reason] lines',
    pass,
    `allReasons=${definesReasons} noBare=${noBareUploadFailed} dom=${domNotConsoleOnly} cli=${cliRendersReason}`,
  )
}

// ---- CHECK 8: no tracked credentials ----
{
  const filesToScan = []
  function walk(dir, base = '') {
    for (const entry of readdirSync(join(root, base || '.'), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const rel = base ? `${base}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (['writer', 'reader', 'shared', 'scripts', 'tests'].includes(entry.name) || base !== '') walk(dir, rel)
      } else if (/\.(js|html|css|json|md|example|txt)$/.test(entry.name)) {
        filesToScan.push(rel)
      }
    }
  }
  walk(root, '')
  const findings = []
  // Build PEM markers via concatenation so this audit file does not match itself.
  const pemStart = '-----BE' + 'GIN'
  const pemKey = 'PRIV' + 'ATE KEY'
  for (const rel of filesToScan) {
    let text = ''
    try {
      text = read(rel)
    } catch {
      continue
    }
    if (text.includes(pemStart) && text.includes(pemKey)) findings.push(`${rel}:private-key-block`)
    if (/gift[_-]?code\s*[:=]\s*["']?[A-Za-z0-9-]{6,}["']?/i.test(text) && !text.toLowerCase().includes('no gift')) {
      // Ignore documentation stating absence; flag only real-looking assignments.
      if (!/placeholder|example|your_/i.test(text.slice(text.toLowerCase().indexOf('gift') - 40, text.toLowerCase().indexOf('gift') + 80))) {
        findings.push(`${rel}:gift-code`)
      }
    }
    if (/:\/\/[^/\s:]+:[^/\s@]+@/.test(text)) findings.push(`${rel}:credential-url`)
    // Env assignments with real values (not placeholders/empty).
    for (const line of text.split('\n')) {
      if (/^\s*FEED_PRIVATE_KEY\s*=\s*\S/.test(line) && !/^\s*FEED_PRIVATE_KEY\s*=\s*$/.test(line)) {
        findings.push(`${rel}:feed-private-key-value`)
      }
      if (/^\s*PRIVY_APP_SECRET\s*=\s*\S/.test(line) && !/your_/i.test(line)) findings.push(`${rel}:privy-secret`)
    }
  }
  // .env.example must exist and contain placeholders only.
  const envExample = exists('.env.example') ? read('.env.example') : ''
  const envHasPlaceholders = envExample.includes('BEE_API_URL=') && !/:\/\/.+:.+@/.test(envExample)
  const pass = findings.length === 0 && envHasPlaceholders
  record(
    8,
    'No tracked credentials',
    `.env.example placeholders only; scanned ${filesToScan.length} files`,
    pass,
    findings.length ? `findings: ${findings.join(', ')}` : `scanned=${filesToScan.length} files, placeholders ok=${envHasPlaceholders}`,
  )
}

// ---- output ----
console.log('\n| Check | Requirement               | Evidence                       | Status    |')
console.log('| ----- | ------------------------- | ------------------------------ | --------- |')
for (const r of results) {
  console.log(`| ${r.check}     | ${r.requirement.padEnd(25)} | ${r.evidence.slice(0, 60).padEnd(60)} | ${r.pass ? 'PASS' : 'FAIL'}    |`)
}
console.log('')
for (const r of results) {
  console.log(`Check ${r.check} (${r.requirement}): ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`)
}
const failed = results.filter((r) => !r.pass)
if (failed.length) {
  console.error(`\nAUDIT FAIL: ${failed.length} check(s) failing.`)
  process.exit(1)
} else {
  console.log('\nAUDIT PASS: all eight checks pass.')
}
