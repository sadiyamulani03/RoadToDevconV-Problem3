// Single Bee client factory (bee-js v13 namespaced API only).
// No network I/O here; the client only stores the endpoint.
import { Bee } from '@ethersphere/bee-js';

export function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createBeeClient(beeApiUrl) {
  if (!isValidHttpUrl(beeApiUrl)) {
    throw new Error(`Invalid Bee API URL: ${JSON.stringify(beeApiUrl)} (set BEE_URL, e.g. http://localhost:1633)`);
  }
  return new Bee(String(beeApiUrl));
}

export async function checkBeeConnectivity(bee) {
  // getStatus is a cheap read-only health probe on the Bee API.
  try {
    const status = await bee.status.getStatus();
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}
