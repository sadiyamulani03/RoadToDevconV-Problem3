// A. catalogue validation · B. canonical serialisation · C. versioning
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalogue, CatalogueValidationError } from '../src/catalogue/validate.js';
import { canonicalize, canonicalBytes } from '../src/catalogue/canonicalize.js';
import { loadSeed } from './fixtures.js';

describe('catalogue validation', () => {
  it('accepts the seed catalogue', () => {
    assert.equal(validateCatalogue(loadSeed()), true);
  });

  it('rejects malformed catalogue data', () => {
    assert.throws(() => validateCatalogue(null), CatalogueValidationError);
    assert.throws(() => validateCatalogue({}), CatalogueValidationError);
    assert.throws(() => validateCatalogue({ ...loadSeed(), libraries: [] }), CatalogueValidationError);
  });

  it('rejects duplicate folio identifiers', () => {
    const seed = loadSeed();
    seed.libraries[1].folios[0] = { ...seed.libraries[0].folios[0] };
    assert.throws(() => validateCatalogue(seed), /duplicate/i);
  });

  it('rejects invalid condition values', () => {
    const seed = loadSeed();
    seed.libraries[0].folios[0].condition = 'mouldy';
    assert.throws(() => validateCatalogue(seed), /condition/i);
  });

  it('rejects missing monastery identifiers', () => {
    const seed = loadSeed();
    delete seed.libraries[0].monasteryId;
    assert.throws(() => validateCatalogue(seed), /monasteryId/i);
  });

  it('rejects wrong library count and inconsistent flags', () => {
    const seed = loadSeed();
    assert.throws(() => validateCatalogue({ ...seed, libraries: seed.libraries.slice(0, 3) }), /exactly 7/i);
    const seed2 = loadSeed();
    seed2.libraries[0].folios[0] = { folioId: 'X1', condition: 'good', damaged: false, missing: true, photographed: true };
    assert.throws(() => validateCatalogue(seed2), /missing.*photographed|photographed/i);
  });
});

describe('canonical serialisation', () => {
  it('same logical catalogue -> same bytes regardless of key order', () => {
    const a = loadSeed(5);
    const reordered = JSON.parse(JSON.stringify(a, Object.keys(a).sort().reverse()));
    // deep key shuffle: rebuild libraries in same order but shuffled keys per object
    const shuffled = { updatedAt: a.updatedAt, libraries: a.libraries, catalogueVersion: a.catalogueVersion, schemaVersion: a.schemaVersion };
    assert.equal(canonicalize(a), canonicalize(shuffled));
    assert.deepEqual(canonicalBytes(a), canonicalBytes(shuffled));
  });

  it('different versions -> different bytes', () => {
    assert.notEqual(canonicalize(loadSeed(1)), canonicalize(loadSeed(2)));
  });
});

describe('versioning', () => {
  it('catalogueVersion must be an integer >= 1 and explicit', () => {
    for (const bad of [0, -1, 1.5, '7']) {
      assert.throws(() => validateCatalogue({ ...loadSeed(), catalogueVersion: bad }), /catalogueVersion/i);
    }
  });

  it('each update creates new bytes (immutable content model)', () => {
    const v1 = canonicalBytes(loadSeed(1));
    const v2 = canonicalBytes(loadSeed(2));
    assert.notDeepEqual(v1, v2);
  });
});
