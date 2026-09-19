// Deterministic canonical serialisation: same logical catalogue -> same bytes.
// Recursively sorts object keys; arrays keep order (folio order is significant).
export function canonicalize(value) {
  return JSON.stringify(sortValue(value));
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), 'utf8');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}
