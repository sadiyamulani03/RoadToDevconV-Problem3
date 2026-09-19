// Writer upload path via the subsidised gateway (raw bytes family).
//
// CHECK 1 is enforced here: the ONLY upload call in this file is gated by a
// capability confirmation. It must not run merely because a session is signed
// in. Callers must run checkUploadCapability() first; this function re-verifies
// uploadCapability.available as its first statement and refuses otherwise.
//
// CHECK 2: the destination is derived from swarmConfig.subsidisedGatewayUrl,
// so a fresh Swarm ID user without a personal stamp/batch can still upload.
// CHECK 5: raw bytes family only — POST <gateway>bytes / GET <gateway>bytes/<ref>.
// CHECK 6: the gateway request carries no extra upload arguments beyond
// Content-Type. Only the bytes and the content-type header are sent.
// CHECK 7: every failure throws an UploadError with a distinguishable reason
// that callers render into user-visible output (DOM or CLI text).

import { swarmConfig } from './config.js'
import { uploadCapability } from './capability.js'
import {
  buildSightingRecord,
  serializeSightingRecordToString,
} from '../shared/format.js'

export const UPLOAD_REASONS = [
  'upload-capability-unavailable',
  'gateway-unavailable',
  'auth-connection-problem',
  'validation-failed',
  'network-failure',
  'upload-rejected',
  'malformed-response',
  'unknown-error',
]

export class UploadError extends Error {
  constructor(reason, message, { cause } = {}) {
    super(`[${reason}] ${message}`)
    this.name = 'UploadError'
    this.reason = reason
    if (cause !== undefined) this.cause = cause
  }
}

function defaultFetchFn(url, options) {
  return fetch(url, options)
}

function isHexReference(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value)
}

// Single audited upload entry point. All writer UIs (browser + CLI) call this.
export async function uploadSightingRecord(fields, { fetchFn = defaultFetchFn, session } = {}) {
  // CHECK 1 — capability gate: must precede any upload attempt.
  // A signed-in session alone is never sufficient.
  if (!uploadCapability.available) {
    throw new UploadError(
      'upload-capability-unavailable',
      `Upload capability unavailable: ${uploadCapability.reason}. Run "Check upload capability" first and wait for confirmation.`,
    )
  }

  // Session is checked second to give a clear auth reason, but it can never
  // substitute for the capability gate above.
  if (session && session.signedIn !== true) {
    throw new UploadError(
      'auth-connection-problem',
      'Not signed in: sign in with Swarm ID first, then confirm upload capability before uploading.',
    )
  }

  let record
  try {
    record = buildSightingRecord(fields)
  } catch (err) {
    throw new UploadError('validation-failed', `Record validation failed: ${err.message}`, { cause: err })
  }

  // CHECK 3 — the serialized bytes themselves carry format + version.
  // Inspect serializedText before upload to verify both identifiers are present.
  const serializedText = serializeSightingRecordToString(record)
  if (!serializedText.includes('"format"') || !serializedText.includes('"version"')) {
    throw new UploadError(
      'validation-failed',
      'Record serialization failed: serialized bytes are missing format/version identifiers.',
    )
  }

  // CHECK 2 + CHECK 5 — destination derives from the subsidised gateway
  // configuration and uses the raw bytes endpoint family.
  const uploadUrl = `${swarmConfig.subsidisedGatewayUrl}bytes`

  let res
  try {
    // CHECK 6 — gateway path sends only content bytes with a content-type
    // header. No additional upload arguments are passed here.
    res = await fetchFn(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializedText,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new UploadError('network-failure', `Network failure during upload: ${err.message}`, { cause: err })
    }
    throw new UploadError('unknown-error', `Unknown error during upload: ${err?.message ?? err}`, { cause: err })
  }

  if (!res) {
    throw new UploadError('gateway-unavailable', 'Gateway unavailable: empty response to upload request.')
  }

  if (res.status === 0 || res.status >= 500) {
    throw new UploadError(
      'gateway-unavailable',
      `Gateway unavailable: subsidised gateway answered HTTP ${res.status}. Try "Check upload capability" again later.`,
    )
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new UploadError(
      'upload-rejected',
      `Upload rejected: gateway answered HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}.`,
    )
  }

  let body
  try {
    body = await res.json()
  } catch (err) {
    throw new UploadError('malformed-response', `Malformed response: gateway reply was not JSON (${err.message}).`, {
      cause: err,
    })
  }

  const reference = body?.reference ?? body?.Reference ?? body?.hash
  if (!isHexReference(reference)) {
    throw new UploadError(
      'malformed-response',
      `Malformed response: gateway reply has no 64-hex reference (got ${JSON.stringify(body)?.slice(0, 200)}).`,
    )
  }

  return { reference, serializedText, record }
}
