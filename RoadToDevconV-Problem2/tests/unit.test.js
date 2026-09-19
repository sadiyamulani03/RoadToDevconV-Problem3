// Offline unit tests — no Swarm gateway, no network, deterministic.
// Run with: npm test (node --test tests/)
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SIGHTING_FORMAT,
  SIGHTING_VERSION,
  buildSightingRecord,
  serializeSightingRecordToString,
  parseSightingRecord,
  validateSightingRecord,
  buildExampleRecord,
} from '../shared/format.js'
import { swarmConfig } from '../writer/config.js'
import { checkUploadCapability, uploadCapability, resetUploadCapability } from '../writer/capability.js'
import { uploadSightingRecord, UploadError, UPLOAD_REASONS } from '../writer/upload.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

const validFields = () => ({
  species: 'Indian Roller',
  count: 2,
  location: 'Deccan scrub',
  observedAt: '2026-01-15T07:30:00.000Z',
  observer: 'demo-observer',
  notes: '',
})

describe('format identifiers live in serialized bytes (Check 3)', () => {
  it('exposes expected identifiers', () => {
    assert.equal(SIGHTING_FORMAT, 'deccan-birders-sighting')
    assert.equal(SIGHTING_VERSION, 1)
  })

  it('serialized bytes contain both format and version', () => {
    const record = buildSightingRecord(validFields())
    const text = serializeSightingRecordToString(record)
    assert.match(text, /"format"\s*:\s*"deccan-birders-sighting"/)
    assert.match(text, /"version"\s*:\s*1/)
    // Example from docs serializes identically.
    const exampleText = serializeSightingRecordToString(buildExampleRecord())
    assert.match(exampleText, /"format"/)
    assert.match(exampleText, /"version"/)
  })

  it('round-trips parse + validate', () => {
    const text = serializeSightingRecordToString(buildSightingRecord(validFields()))
    const parsed = validateSightingRecord(parseSightingRecord(text))
    assert.equal(parsed.format, 'deccan-birders-sighting')
    assert.equal(parsed.version, 1)
  })

  it('rejects wrong format/version', () => {
    assert.throws(() => validateSightingRecord({ ...JSON.parse(serializeSightingRecordToString(buildSightingRecord(validFields()))), format: 'other' }), /format/)
    assert.throws(() => validateSightingRecord({ ...JSON.parse(serializeSightingRecordToString(buildSightingRecord(validFields()))), version: 99 }), /version/)
  })

  it('rejects invalid fields with validation-failed reason', () => {
    assert.throws(() => buildSightingRecord({ ...validFields(), species: '' }), /validation-failed/)
    assert.throws(() => buildSightingRecord({ ...validFields(), count: 0 }), /validation-failed/)
  })
})

describe('subsidised gateway config (Check 2)', () => {
  it('points at the subsidised gateway', () => {
    assert.equal(swarmConfig.subsidisedGatewayUrl, 'https://api.gateway.ethswarm.org/')
  })

  it('upload path derives destination from that config', () => {
    const uploadJs = read('writer/upload.js')
    assert.match(uploadJs, /swarmConfig\.subsidisedGatewayUrl/)
    assert.match(uploadJs, /\}bytes/)
  })
})

describe('capability gate before upload (Check 1)', () => {
  beforeEach(() => resetUploadCapability())

  it('refuses upload when capability was never confirmed, even when signed in', async () => {
    await assert.rejects(
      () => uploadSightingRecord(validFields(), { session: { signedIn: true }, fetchFn: async () => { throw new Error('must not be called') } }),
      (err) => err instanceof UploadError && err.reason === 'upload-capability-unavailable',
    )
  })

  it('checkUploadCapability sets available on reachable gateway (mocked)', async () => {
    const cap = await checkUploadCapability({ fetchFn: async () => ({ status: 200 }) })
    assert.equal(cap.available, true)
    assert.equal(uploadCapability.available, true)
  })

  it('failed probe keeps available=false with gateway/network reason', async () => {
    const cap = await checkUploadCapability({
      fetchFn: async () => { throw new TypeError('fetch failed') },
    })
    assert.equal(cap.available, false)
    assert.match(cap.reason, /network failure|gateway unavailable/)
  })

  it('upload succeeds after capability confirmation (mocked gateway)', async () => {
    await checkUploadCapability({ fetchFn: async () => ({ status: 200 }) })
    const fakeRef = 'ab'.repeat(32)
    const { reference, serializedText } = await uploadSightingRecord(validFields(), {
      session: { signedIn: true },
      fetchFn: async () => ({ ok: true, status: 201, json: async () => ({ reference: fakeRef }) }),
    })
    assert.equal(reference, fakeRef)
    assert.match(serializedText, /deccan-birders-sighting/)
  })
})

describe('matching endpoint family (Check 5)', () => {
  it('writer POSTs and reader GETs the same /bytes family without /bzz mixing', () => {
    const uploadJs = read('writer/upload.js')
    const appReader = read('reader/app.js')
    const cliReader = read('reader/cli.js')
    // Writer builds `${subsidisedGatewayUrl}bytes` (config ends with /).
    assert.ok(uploadJs.includes('bytes') && uploadJs.includes("'POST'"))
    assert.ok(uploadJs.includes('subsidisedGatewayUrl'))
    assert.ok(appReader.includes('bytes/'))
    assert.ok(cliReader.includes('bytes/'))
    assert.doesNotMatch(uploadJs, /\/bzz\//)
    assert.doesNotMatch(appReader, /\/bzz\//)
    assert.doesNotMatch(cliReader, /\/bzz\//)
  })
})

describe('independent reader (Check 4)', () => {
  it('reader entrypoints exist and import no writer code', () => {
    const cli = read('reader/cli.js')
    const app = read('reader/app.js')
    const html = read('reader/index.html')
    assert.match(html, /src="\.\/app\.js"/)
    const importWriterRe = /(from\s+['"][^'"]*writer|import\s*\(?\s*['"][^'"]*writer|require\s*\(\s*['"][^'"]*writer|src\s*=\s*["'][^"']*writer\/writer\.js)/i
    for (const text of [cli, app, html]) {
      assert.ok(!importWriterRe.test(text), 'reader must not import writer code')
    }
    assert.match(cli, /shared\/format\.js/)
    assert.match(app, /shared\/format\.js/)
  })

  it('reader implements obtain/download/parse/validate/render', () => {
    for (const rel of ['reader/cli.js', 'reader/app.js']) {
      const text = read(rel).toLowerCase()
      for (const step of ['obtain', 'download', 'parse', 'validate', 'render']) {
        assert.ok(text.includes(step), `${rel} missing step ${step}`)
      }
    }
  })
})

describe('gateway upload carries no extra arguments (Check 6)', () => {
  it('upload implementation is free of forbidden upload arguments', () => {
    for (const rel of ['writer/upload.js', 'writer/writer.js']) {
      const text = read(rel)
      for (const token of ['swarm-pin', 'swarm-tag', 'Swarm-Pin', 'Swarm-Tag', 'Swarm-Postage-Batch-Id']) {
        assert.ok(!text.includes(token), `${rel} must not contain ${token}`)
      }
      assert.doesNotMatch(text, /\bpin\s*:/i)
      assert.doesNotMatch(text, /\btag\s*:/i)
    }
    const uploadJs = read('writer/upload.js')
    assert.match(uploadJs, /'Content-Type'/)
  })
})

describe('specific failure reasons reach user-visible output (Check 7)', () => {
  it('defines distinguishable reasons and renders them to DOM/CLI', () => {
    const uploadJs = read('writer/upload.js')
    for (const reason of UPLOAD_REASONS) {
      assert.ok(uploadJs.includes(reason), `missing reason ${reason}`)
    }
    assert.ok(UPLOAD_REASONS.length >= 7)
    const writerJs = read('writer/writer.js')
    assert.match(writerJs, /upload-error/)
    assert.match(writerJs, /errorBox\.textContent/)
    assert.ok(!uploadJs.includes('"Upload failed."'))
    const cli = read('writer/cli.js')
    assert.match(cli, /upload-capability-unavailable/)
  })

  it('validation failure carries validation-failed (not bare failure)', async () => {
    await checkUploadCapability({ fetchFn: async () => ({ status: 200 }) })
    await assert.rejects(
      () => uploadSightingRecord({ ...validFields(), species: '' }, { session: { signedIn: true } }),
      (err) => err.reason === 'validation-failed',
    )
    resetUploadCapability()
  })
})
