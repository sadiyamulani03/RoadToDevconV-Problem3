// Catalogue validation. Throws CatalogueValidationError listing every problem.
// Never logs secrets; operates purely on public catalogue data.
import { SCHEMA_VERSION, CONDITIONS, MONASTERY_ID_PATTERN, COLLECTION_ID_PATTERN, FOLIO_ID_PATTERN } from './schema.js';

export class CatalogueValidationError extends Error {
  constructor(errors) {
    super(`Catalogue validation failed:\n- ${errors.join('\n- ')}`);
    this.name = 'CatalogueValidationError';
    this.errors = errors;
  }
}

export function validateCatalogue(catalogue) {
  const errors = [];
  if (catalogue === null || typeof catalogue !== 'object' || Array.isArray(catalogue)) {
    throw new CatalogueValidationError(['catalogue must be an object']);
  }
  if (catalogue.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(catalogue.catalogueVersion) || catalogue.catalogueVersion < 1) {
    errors.push('catalogueVersion must be an integer >= 1');
  }
  if (typeof catalogue.updatedAt !== 'string' || Number.isNaN(Date.parse(catalogue.updatedAt))) {
    errors.push('updatedAt must be an ISO-8601 timestamp string');
  }
  if (!Array.isArray(catalogue.libraries) || catalogue.libraries.length === 0) {
    errors.push('libraries must be a non-empty array');
  } else {
    if (catalogue.libraries.length !== 7) {
      errors.push(`libraries must contain exactly 7 entries (found ${catalogue.libraries.length})`);
    }
    const seenFolioIds = new Set();
    const seenMonasteries = new Set();
    catalogue.libraries.forEach((lib, li) => {
      const where = `libraries[${li}]`;
      if (lib === null || typeof lib !== 'object' || Array.isArray(lib)) {
        errors.push(`${where} must be an object`);
        return;
      }
      if (typeof lib.monasteryId !== 'string' || !MONASTERY_ID_PATTERN.test(lib.monasteryId)) {
        errors.push(`${where}.monasteryId is required and must match ${MONASTERY_ID_PATTERN}`);
      } else if (seenMonasteries.has(lib.monasteryId)) {
        errors.push(`${where}.monasteryId duplicate: ${lib.monasteryId}`);
      } else {
        seenMonasteries.add(lib.monasteryId);
      }
      if (typeof lib.collectionId !== 'string' || !COLLECTION_ID_PATTERN.test(lib.collectionId)) {
        errors.push(`${where}.collectionId is required`);
      }
      if (typeof lib.responsibleInstitution !== 'string' || lib.responsibleInstitution.trim() === '') {
        errors.push(`${where}.responsibleInstitution is required`);
      }
      if (!Array.isArray(lib.folios) || lib.folios.length === 0) {
        errors.push(`${where}.folios must be a non-empty array`);
        return;
      }
      lib.folios.forEach((folio, fi) => {
        const fwhere = `${where}.folios[${fi}]`;
        if (folio === null || typeof folio !== 'object' || Array.isArray(folio)) {
          errors.push(`${fwhere} must be an object`);
          return;
        }
        if (typeof folio.folioId !== 'string' || !FOLIO_ID_PATTERN.test(folio.folioId)) {
          errors.push(`${fwhere}.folioId is required`);
        } else if (seenFolioIds.has(folio.folioId)) {
          errors.push(`${fwhere}.folioId duplicate: ${folio.folioId}`);
        } else {
          seenFolioIds.add(folio.folioId);
        }
        if (!CONDITIONS.includes(folio.condition)) {
          errors.push(`${fwhere}.condition must be one of ${CONDITIONS.join(', ')}`);
        }
        for (const flag of ['damaged', 'missing', 'photographed']) {
          if (typeof folio[flag] !== 'boolean') {
            errors.push(`${fwhere}.${flag} must be a boolean`);
          }
        }
        if (folio.missing === true && folio.photographed === true) {
          errors.push(`${fwhere}: a missing folio cannot be marked photographed`);
        }
        if (folio.notes !== undefined && typeof folio.notes !== 'string') {
          errors.push(`${fwhere}.notes must be a string when present`);
        }
        if (typeof folio.notes === 'string' && folio.notes.length > 2000) {
          errors.push(`${fwhere}.notes must be <= 2000 chars`);
        }
      });
    });
  }
  if (errors.length > 0) throw new CatalogueValidationError(errors);
  return true;
}

export function assertNoPrivateData(catalogue) {
  // Heuristic guard: catalogue must not contain secret-looking keys.
  const text = JSON.stringify(catalogue).toLowerCase();
  const banned = ['privatekey', 'mnemonic', 'seed phrase', 'gift code', 'api token'];
  const hit = banned.find((b) => text.includes(b));
  if (hit) throw new CatalogueValidationError([`catalogue contains forbidden field/text: ${hit}`]);
  return true;
}
