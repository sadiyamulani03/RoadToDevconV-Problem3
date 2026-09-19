// Standalone format/schema definition for Deccan Birders sighting records.
//
// This is the ONLY module that writer/ and reader/ are both allowed to import.
// It contains no network code, no storage code, no rendering code, and no
// application components — only the portable record shape, its identifiers,
// serialization, parsing, and validation.
//
// The uploaded Swarm bytes themselves MUST contain both `format` and `version`.
// See buildSightingRecord() and serializeSightingRecord().

export const SIGHTING_FORMAT = 'deccan-birders-sighting'
export const SIGHTING_VERSION = 1

export function buildSightingRecord({
  species,
  count,
  location,
  observedAt,
  observer,
  notes = '',
} = {}) {
  if (typeof species !== 'string' || species.trim() === '') {
    throw new Error('validation-failed: species must be a non-empty string.')
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('validation-failed: count must be an integer >= 1.')
  }
  if (typeof location !== 'string' || location.trim() === '') {
    throw new Error('validation-failed: location must be a non-empty string.')
  }
  const timestamp = observedAt ?? new Date().toISOString()
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`validation-failed: invalid observedAt timestamp: ${JSON.stringify(observedAt)}`)
  }
  if (typeof observer !== 'string' || observer.trim() === '') {
    throw new Error('validation-failed: observer must be a non-empty string.')
  }
  if (typeof notes !== 'string') {
    throw new Error('validation-failed: notes must be a string.')
  }

  // The stored bytes MUST carry both identifiers inline (Check 3).
  // Do not move format/version out of the payload (no types-only storage).
  return {
    format: SIGHTING_FORMAT,
    version: SIGHTING_VERSION,
    species: species.trim(),
    count,
    location: location.trim(),
    observedAt: timestamp,
    observer: observer.trim(),
    notes,
  }
}

export function serializeSightingRecordToString(record) {
  if (!record || record.format !== SIGHTING_FORMAT) {
    throw new Error(`validation-failed: record format must be ${JSON.stringify(SIGHTING_FORMAT)}.`)
  }
  if (record.version !== SIGHTING_VERSION) {
    throw new Error(`validation-failed: record version must be ${SIGHTING_VERSION}.`)
  }
  return JSON.stringify(record)
}

export function serializeSightingRecord(record) {
  const text = serializeSightingRecordToString(record)
  return new TextEncoder().encode(text)
}

export function parseSightingRecord(raw) {
  const text =
    typeof raw === 'string'
      ? raw
      : raw instanceof Uint8Array
        ? new TextDecoder().decode(raw)
        : typeof raw?.toString === 'function' && raw.length !== undefined
          ? raw.toString()
          : String(raw ?? '')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('validation-failed: stored content is not valid JSON.')
  }
  return parsed
}

export function validateSightingRecord(obj) {
  if (!obj || typeof obj !== 'object') {
    throw new Error('validation-failed: record must be an object.')
  }
  if (obj.format !== SIGHTING_FORMAT) {
    throw new Error(
      `validation-failed: unsupported format ${JSON.stringify(obj.format)} (expected ${JSON.stringify(SIGHTING_FORMAT)}).`,
    )
  }
  if (obj.version !== SIGHTING_VERSION) {
    throw new Error(
      `validation-failed: unsupported version ${JSON.stringify(obj.version)} (expected ${SIGHTING_VERSION}).`,
    )
  }
  if (typeof obj.species !== 'string' || obj.species.trim() === '') {
    throw new Error('validation-failed: record missing required species.')
  }
  if (!Number.isInteger(obj.count) || obj.count < 1) {
    throw new Error('validation-failed: record has invalid count.')
  }
  if (typeof obj.location !== 'string' || obj.location.trim() === '') {
    throw new Error('validation-failed: record missing required location.')
  }
  if (typeof obj.observedAt !== 'string' || Number.isNaN(Date.parse(obj.observedAt))) {
    throw new Error('validation-failed: record has invalid observedAt.')
  }
  if (typeof obj.observer !== 'string' || obj.observer.trim() === '') {
    throw new Error('validation-failed: record missing required observer.')
  }
  return obj
}

// Deterministic example used by docs/tests/audit to prove bytes carry identifiers.
// Example serialized bytes:
// {"format":"deccan-birders-sighting","version":1,"species":"Indian Roller","count":2,"location":"Deccan scrub","observedAt":"2026-01-15T07:30:00.000Z","observer":"demo-observer","notes":""}
export function buildExampleRecord() {
  return buildSightingRecord({
    species: 'Indian Roller',
    count: 2,
    location: 'Deccan scrub',
    observedAt: '2026-01-15T07:30:00.000Z',
    observer: 'demo-observer',
    notes: '',
  })
}
