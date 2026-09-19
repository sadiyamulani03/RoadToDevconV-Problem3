// Independent reader browser logic — module for reader/index.html.
//
// Standalone by design:
// - No import from the authoring side (no parsing, storage, rendering, or components from there).
// - Only shared dependency is ../shared/format.js (standalone schema).
// - Own gateway constant for the same raw bytes family used when storing.
// - Performs all five reader steps independently:
//   1. obtain a Swarm reference (user input)
//   2. download the stored content (GET <gateway>bytes/<ref>)
//   3. parse the portable record
//   4. validate format/version
//   5. render the record into the DOM.

import { parseSightingRecord, validateSightingRecord } from '../shared/format.js'

// Reader-owned gateway endpoint. Same host and same /bytes family as storing,
// defined here independently so the reader runs without authoring-side code.
const READER_GATEWAY_URL = 'https://api.gateway.ethswarm.org/'

const form = document.getElementById('reader-form')
const refInput = document.getElementById('ref-input')
const loadBtn = document.getElementById('load-btn')
const errorBox = document.getElementById('reader-error')
const resultBox = document.getElementById('reader-result')

function isHexReference(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value.trim())
}

function showReaderError(code, message, action) {
  errorBox.hidden = false
  resultBox.hidden = true
  errorBox.textContent = `[${code}] ${message}${action ? ` Action: ${action}` : ''}`
}

function renderRecord(record, reference) {
  errorBox.hidden = true
  resultBox.hidden = false
  resultBox.innerHTML = ''
  const title = document.createElement('h3')
  title.textContent = `${record.species} ×${record.count} @ ${record.location}`
  const meta = document.createElement('p')
  meta.textContent = `Observer: ${record.observer} — Observed: ${record.observedAt}`
  const notes = document.createElement('p')
  notes.textContent = record.notes ? `Notes: ${record.notes}` : 'No notes.'
  const ids = document.createElement('p')
  ids.textContent = `format=${record.format} version=${record.version}`
  const ref = document.createElement('p')
  ref.textContent = `reference=${reference}`
  const link = document.createElement('a')
  link.href = `${READER_GATEWAY_URL}bytes/${reference}`
  link.textContent = 'Open raw bytes'
  link.target = '_blank'
  link.rel = 'noopener'
  resultBox.append(title, meta, notes, ids, ref, link)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.hidden = true
  resultBox.hidden = true

  // 1. obtain a Swarm reference
  const reference = refInput.value.trim()
  if (!isHexReference(reference)) {
    showReaderError(
      'reader-validation-failed',
      'Reference must be a 64-hex Swarm reference.',
      'Paste the reference shown by the uploader after upload.',
    )
    return
  }

  loadBtn.disabled = true
  loadBtn.textContent = 'Loading…'
  try {
    // 2. download the stored content through the matching endpoint family
    const downloadUrl = `${READER_GATEWAY_URL}bytes/${reference}`
    let res
    try {
      res = await fetch(downloadUrl, { method: 'GET' })
    } catch (err) {
      showReaderError('reader-network-failure', `Cannot reach Swarm gateway: ${err.message}.`, 'Check network and retry.')
      return
    }
    if (!res.ok) {
      showReaderError(
        'reader-download-rejected',
        `Gateway answered HTTP ${res.status} for this reference.`,
        'Verify the reference came from a /bytes upload and retry.',
      )
      return
    }
    let text
    try {
      text = await res.text()
    } catch (err) {
      showReaderError('reader-malformed-response', `Cannot read gateway body: ${err.message}.`, 'Retry.')
      return
    }

    // 3. parse the portable record
    let parsed
    try {
      parsed = parseSightingRecord(text)
    } catch (err) {
      showReaderError('reader-validation-failed', `Stored content is not a valid record: ${err.message}.`, 'This reference does not hold a Deccan Birders sighting.')
      return
    }

    // 4. validate format/version
    try {
      validateSightingRecord(parsed)
    } catch (err) {
      showReaderError('reader-validation-failed', err.message, 'Only format deccan-birders-sighting version 1 is supported.')
      return
    }

    // 5. render the record
    renderRecord(parsed, reference)
  } finally {
    loadBtn.disabled = false
    loadBtn.textContent = 'Download & render'
  }
})
