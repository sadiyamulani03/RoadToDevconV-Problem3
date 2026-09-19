// Writer CLI — Node entrypoint for the Deccan Birders writer.
//
// Usage:
//   node writer/cli.js --help
//   node writer/cli.js check
//   node writer/cli.js upload --species "Indian Roller" --count 2 --location "Deccan scrub" --observer "demo" [--observedAt ISO] [--notes TEXT]
//
// Flow: sign-in (local demo session) -> checkUploadCapability() ->
// uploadSightingRecord(). The upload step refuses unless capability was
// confirmed, even when signed in.

import { checkUploadCapability, uploadCapability } from './capability.js'
import { uploadSightingRecord } from './upload.js'
import { swarmConfig } from './config.js'

const session = { signedIn: false }

function signIn() {
  session.signedIn = true
  return session
}

function printHelp() {
  console.log(`Deccan Birders writer (Swarm subsidised gateway)

Commands:
  check                 Probe ${swarmConfig.subsidisedGatewayUrl} for upload capability
  upload                Upload a sighting record (requires prior capability confirmation)

Upload options:
  --species TEXT        Bird species (required)
  --count N             Individual count >= 1 (required)
  --location TEXT       Sighting location (required)
  --observer TEXT       Observer name (required)
  --observedAt ISO      Observed timestamp (default: now)
  --notes TEXT          Free notes (default: "")

Examples:
  node writer/cli.js check
  node writer/cli.js upload --species "Indian Roller" --count 2 --location "Deccan scrub" --observer "demo"
`)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true'
      if (out[key] !== 'true') i += 1
    }
  }
  return out
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === '--help' || command === 'help') {
    printHelp()
    return
  }

  // Demo Swarm ID sign-in: local only, no credentials leave this machine.
  signIn()

  if (command === 'check') {
    const cap = await checkUploadCapability()
    if (cap.available) {
      console.log(`[capability-available] ${cap.reason}`)
    } else {
      console.log(`[upload-capability-unavailable] ${cap.reason}`)
      process.exitCode = 1
    }
    return
  }

  if (command === 'upload') {
    const opts = parseArgs(rest)
    // Capability must be established before any upload is attempted.
    const cap = await checkUploadCapability()
    if (!cap.available) {
      console.error(`[upload-capability-unavailable] ${cap.reason}`)
      console.error('Action: check network access to the subsidised gateway and run "check" again.')
      process.exitCode = 1
      return
    }
    try {
      const { reference, serializedText } = await uploadSightingRecord(
        {
          species: opts.species,
          count: opts.count === undefined ? undefined : Number(opts.count),
          location: opts.location,
          observedAt: opts.observedAt,
          observer: opts.observer,
          notes: opts.notes ?? '',
        },
        { session },
      )
      console.log(`[upload-ok] reference=${reference}`)
      console.log(`download: ${swarmConfig.subsidisedGatewayUrl}bytes/${reference}`)
      console.log(`bytes-preview: ${serializedText.slice(0, 200)}`)
    } catch (err) {
      const reason = err?.reason ?? 'unknown-error'
      console.error(`[${reason}] ${err.message}`)
      if (reason === 'upload-capability-unavailable') {
        console.error('Action: run "node writer/cli.js check" first and confirm capability.')
      } else if (reason === 'auth-connection-problem') {
        console.error('Action: sign in again, then re-check capability.')
      } else if (reason === 'validation-failed') {
        console.error('Action: fix the highlighted field and retry.')
      } else if (reason === 'network-failure' || reason === 'gateway-unavailable') {
        console.error('Action: verify network access to the subsidised gateway and retry.')
      } else if (reason === 'upload-rejected') {
        console.error('Action: the gateway refused the bytes; retry with a smaller valid record.')
      } else if (reason === 'malformed-response') {
        console.error('Action: gateway reply was unexpected; retry, then report the reference if it persists.')
      } else {
        console.error('Action: retry; if it persists, re-run "check" to isolate the cause.')
      }
      process.exitCode = 1
    }
    return
  }

  console.error(`[unknown-error] Unknown command: ${command}`)
  printHelp()
  process.exitCode = 1
}

main()
