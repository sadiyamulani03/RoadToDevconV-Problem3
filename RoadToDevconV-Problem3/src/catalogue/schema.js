// Catalogue schema constants for the seven monastery libraries.
// Placeholder demo identities only — no real institutional data.
export const SCHEMA_VERSION = 1;

export const MONASTERY_IDS = [
  'DEMO-MONASTERY-01',
  'DEMO-MONASTERY-02',
  'DEMO-MONASTERY-03',
  'DEMO-MONASTERY-04',
  'DEMO-MONASTERY-05',
  'DEMO-MONASTERY-06',
  'DEMO-MONASTERY-07',
];

export const CONDITIONS = ['excellent', 'good', 'fair', 'fragile', 'poor', 'critical'];

export const MONASTERY_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,63}$/;
export const COLLECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;
export const FOLIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;
