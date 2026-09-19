// Independent reader CLI — Node entrypoint for the Deccan Birders reader.
//
// This file is intentionally standalone:
// - It does NOT import any authoring-side application code.
// - The only shared dependency is ../shared/format.js (standalone schema).
// - It defines its own gateway endpoint for the same raw bytes family used
//   when storing, and performs all five reader steps on its own:
//   1. obtain a Swarm reference (CLI arg)
//   2. download the stored content (GET <gateway>bytes/<ref>)
//   3. parse the portable record
//   4. validate format/version
//   5. render the record
//
// Usage:
//   node reader/cli.js --help
//   node reader/cli.js <64-hex-reference>

import { parseSightingRecord, validateSightingRecord } from '../shared/format.js'

// Reader-owned gateway endpoint (same host + same /bytes family as storing,
// but defined here independently so the reader works without authoring code).
const READER_GATEWAY_URL = 'https://api.gateway.ethswarm.org/'

function isHexReference(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value.trim())
}

function printHelp() {
  console.log(`Deccan Birders independent reader (Swarm raw bytes family)

Usage:
  node reader/cli.js <64-hex-reference>

Steps:
  1. obtain reference from argv
  2. download via GET ${READER_GATEWAY_URL}bytes/<reference>
  3. parse portable JSON record
  4. validate format/version (deccan-birders-sighting / 1)
  5. render to stdout

Example:
  node reader/cli.js <reference-from-uploader>
`)
}

async function main() {
  const [referenceArg, ...rest] = process.argv.slice(2)
  if (!referenceArg || referenceArg === '--help' || referenceArg === 'help') {
    printHelp()
    return
  }
  if (rest.includes('--help')) {
    printHelp()
    return
  }

  // 1. obtain a Swarm reference
  const reference = referenceArg.trim()
  if (!isHexReference(reference)) {
    console.error('[reader-validation-failed] Reference must be a 64-hex Swarm reference.')
    process.exitCode = 1
    return
  }

  // 2. download the stored content through the same endpoint family used when storing
  const downloadUrl = `${READER_GATEWAY_URL}bytes/${reference}`
  let res
  try {
    res = await fetch(downloadUrl, { method: 'GET' })
  } catch (err) {
    console.error(`[reader-network-failure] Cannot reach Swarm gateway: ${err.message}`)
    process.exitCode = 1
    return
  }
  if (!res.ok) {
    console.error(`[reader-download-rejected] Gateway answered HTTP ${res.status} for ${reference}.`)
    process.exitCode = 1
    return
  }
  const text = await res.text().catch((err) => {
    console.error(`[reader-malformed-response] Cannot read gateway body: ${err.message}`)
    process.exitCode = 1
    return null
  })
  if (text === null) return

  // 3. parse the portable record
  let parsed
  try {
    parsed = parseSightingRecord(text)
  } catch (err) {
    console.error(`[reader-validation-failed] Stored content is not a valid sighting record: ${err.message}`)
    process.exitCode = 1
    return
  }

  // 4. validate format/version
  try {
    validateSightingRecord(parsed)
  } catch (err) {
    console.error(`[reader-validation-failed] ${err.message}`)
    process.exitCode = 1
    return
  }

  // 5. render the record
  console.log(`[reader-ok] ${parsed.species} x${parsed.count} @ ${parsed.location}`)
  console.log(`observer=${parsed.observer} observedAt=${parsed.observedAt}`)
  if (parsed.notes) console.log(`notes=${parsed.notes}`)
  console.log(`format=${parsed.format} version=${parsed.version} reference=${reference}`)
}

main()
