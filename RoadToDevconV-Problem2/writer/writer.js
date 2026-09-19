// Browser writer logic — entrypoint module for writer/index.html.
//
// Imports ONLY: ./config.js, ./capability.js, ./upload.js, ../shared/format.js.
// It never imports reader code. The reader never imports this file.
//
// UI contract for Check 7: every upload failure renders a distinguishable,
// actionable reason into #upload-error (user-visible DOM), never only console.

import { swarmConfig } from './config.js'
import { checkUploadCapability, uploadCapability } from './capability.js'
import { uploadSightingRecord } from './upload.js'

const session = { signedIn: false }

const signinBtn = document.getElementById('signin-btn')
const signinStatus = document.getElementById('signin-status')
const capabilityBtn = document.getElementById('capability-btn')
const capabilityStatus = document.getElementById('capability-status')
const form = document.getElementById('sighting-form')
const uploadBtn = document.getElementById('upload-btn')
const errorBox = document.getElementById('upload-error')
const okBox = document.getElementById('upload-ok')
const preview = document.getElementById('bytes-preview')

function refreshUploadAvailability() {
  // Button is enabled only when BOTH sign-in and capability are confirmed.
  // Capability alone gates the actual upload call inside uploadSightingRecord().
  uploadBtn.disabled = !(session.signedIn && uploadCapability.available)
}

function showError(reason, message, action) {
  errorBox.hidden = false
  okBox.hidden = true
  errorBox.textContent = `[${reason}] ${message}${action ? ` Action: ${action}` : ''}`
}

function showOk(reference, serializedText) {
  errorBox.hidden = true
  okBox.hidden = false
  const url = `${swarmConfig.subsidisedGatewayUrl}bytes/${reference}`
  okBox.innerHTML = ''
  const line1 = document.createElement('div')
  line1.textContent = `Uploaded. Swarm reference: ${reference}`
  const link = document.createElement('a')
  link.href = url
  link.textContent = url
  link.target = '_blank'
  link.rel = 'noopener'
  const line2 = document.createElement('div')
  line2.textContent = 'Open the independent reader and paste this reference to verify.'
  okBox.append(line1, link, line2)
  preview.textContent = serializedText
}

signinBtn.addEventListener('click', () => {
  session.signedIn = true
  signinStatus.textContent = 'Signed in (demo Swarm ID session). Upload still requires capability confirmation.'
  refreshUploadAvailability()
})

capabilityBtn.addEventListener('click', async () => {
  capabilityBtn.disabled = true
  capabilityStatus.textContent = 'Probing subsidised gateway…'
  try {
    const cap = await checkUploadCapability()
    if (cap.available) {
      capabilityStatus.textContent = `Capability available: ${cap.reason} (${cap.gatewayUrl})`
    } else {
      capabilityStatus.textContent = `Capability unavailable: ${cap.reason}`
      showError(
        'upload-capability-unavailable',
        cap.reason,
        'Verify network access to the subsidised gateway and retry.',
      )
    }
  } catch (err) {
    capabilityStatus.textContent = `Capability check failed: ${err?.message ?? err}`
    showError('gateway-unavailable', `Capability probe failed: ${err?.message ?? err}`, 'Retry in a moment.')
  } finally {
    capabilityBtn.disabled = false
    refreshUploadAvailability()
  }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.hidden = true
  okBox.hidden = true

  // CHECK 1 — visible pre-gate (the hard gate also lives inside uploadSightingRecord).
  if (!uploadCapability.available) {
    showError(
      'upload-capability-unavailable',
      `Upload capability unavailable: ${uploadCapability.reason}.`,
      'Press "Check upload capability" and wait for confirmation before uploading.',
    )
    return
  }
  if (!session.signedIn) {
    showError(
      'auth-connection-problem',
      'Not signed in.',
      'Sign in with Swarm ID first, then confirm capability.',
    )
    return
  }

  const data = new FormData(form)
  const fields = {
    species: String(data.get('species') ?? ''),
    count: Number(data.get('count')),
    location: String(data.get('location') ?? ''),
    observer: String(data.get('observer') ?? ''),
    observedAt: String(data.get('observedAt') ?? '').trim() || undefined,
    notes: String(data.get('notes') ?? ''),
  }

  uploadBtn.disabled = true
  uploadBtn.textContent = 'Uploading…'
  try {
    const { reference, serializedText } = await uploadSightingRecord(fields, { session })
    showOk(reference, serializedText)
  } catch (err) {
    const reason = err?.reason ?? 'unknown-error'
    const actions = {
      'upload-capability-unavailable': 'Run "Check upload capability" first and wait for confirmation.',
      'auth-connection-problem': 'Sign in again, then re-confirm capability.',
      'validation-failed': 'Fix the highlighted field and retry.',
      'network-failure': 'Verify network access to the subsidised gateway and retry.',
      'gateway-unavailable': 'The subsidised gateway is unreachable; retry later.',
      'upload-rejected': 'The gateway refused the bytes; retry with a smaller valid record.',
      'malformed-response': 'Gateway reply was unexpected; retry, then report if it persists.',
      'unknown-error': 'Retry; if it persists, re-run the capability check to isolate the cause.',
    }
    showError(reason, err.message, actions[reason] ?? actions['unknown-error'])
    // Console logging alone does not satisfy Check 7; DOM output above is the requirement.
    console.error(err)
  } finally {
    uploadBtn.textContent = 'Upload to Swarm'
    refreshUploadAvailability()
  }
})

refreshUploadAvailability()
