// Upload capability probe for the subsidised gateway.
//
// A signed-in session alone NEVER authorizes an upload (Check 1).
// Every write path must call checkUploadCapability() first and then verify
// uploadCapability.available before invoking the upload operation.
//
// Capability is established by reaching the same gateway family used for
// writing (raw bytes endpoint host). No credentials are required.

import { swarmConfig } from './config.js'

export const uploadCapability = {
  available: false,
  reason: 'upload capability unavailable: capability check has not run yet',
  checkedAt: null,
  gatewayUrl: swarmConfig.subsidisedGatewayUrl,
}

function defaultFetchFn(url, options) {
  return fetch(url, options)
}

export async function checkUploadCapability({ fetchFn = defaultFetchFn, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Probe the subsidised gateway root. Any HTTP response (even 404/200)
    // proves the gateway host is reachable for the bytes family.
    const res = await fetchFn(swarmConfig.subsidisedGatewayUrl, {
      method: 'GET',
      signal: controller.signal,
    })
    if (res && typeof res.status === 'number') {
      uploadCapability.available = true
      uploadCapability.reason = 'upload capability available: subsidised gateway is reachable'
      uploadCapability.checkedAt = new Date().toISOString()
      uploadCapability.gatewayUrl = swarmConfig.subsidisedGatewayUrl
      return { ...uploadCapability }
    }
    uploadCapability.available = false
    uploadCapability.reason = 'gateway unavailable: empty response from subsidised gateway'
    uploadCapability.checkedAt = new Date().toISOString()
    return { ...uploadCapability }
  } catch (err) {
    uploadCapability.available = false
    if (err && err.name === 'AbortError') {
      uploadCapability.reason = 'gateway unavailable: capability probe timed out'
    } else if (err instanceof TypeError) {
      uploadCapability.reason = `network failure: cannot reach subsidised gateway (${err.message})`
    } else {
      uploadCapability.reason = `gateway unavailable: capability probe failed (${err?.message ?? err})`
    }
    uploadCapability.checkedAt = new Date().toISOString()
    return { ...uploadCapability }
  } finally {
    clearTimeout(timer)
  }
}

export function resetUploadCapability() {
  uploadCapability.available = false
  uploadCapability.reason = 'upload capability unavailable: capability check has not run yet'
  uploadCapability.checkedAt = null
}
