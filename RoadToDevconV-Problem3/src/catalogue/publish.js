// Offline + live catalogue publishing.
// Offline: validate -> canonicalize -> immutable put -> publisher-feed append.
// Live:   validate -> canonicalize -> bee.uploadData -> feed uploadReference.
// The publisher can publish content but can NEVER change who publishes
// (only the authority root feed does that — separate key, separate feed).
import { validateCatalogue } from './validate.js';
import { canonicalBytes } from './canonicalize.js';
import { uploadCatalogue as liveUploadCatalogue } from '../bee/storage.js';
import { publishReferenceToFeed } from '../bee/feeds.js';

export function publishCatalogueOffline(store, { owner, topic, publisherPrivateKey, catalogue }) {
  if (typeof publisherPrivateKey !== 'string' || publisherPrivateKey.trim() === '') {
    throw new Error('Publisher private key is required for publishing (PUBLISHER_PRIVATE_KEY).');
  }
  validateCatalogue(catalogue);
  const bytes = canonicalBytes(catalogue);
  const reference = store.putContent(bytes);
  const entry = store.publishCatalogueRef({ owner, topic, publisherPrivateKey, reference });
  return { reference, feedIndex: entry.index, bytes: bytes.length, catalogueVersion: catalogue.catalogueVersion };
}

export async function publishCatalogueLive(bee, { batchId, topic, publisherPrivateKey, catalogue }) {
  if (typeof publisherPrivateKey !== 'string' || publisherPrivateKey.trim() === '') {
    throw new Error('Publisher private key is required for publishing (PUBLISHER_PRIVATE_KEY).');
  }
  validateCatalogue(catalogue);
  const { reference } = await liveUploadCatalogue(bee, { batchId, catalogue });
  const result = await publishReferenceToFeed(bee, { topic, publisherPrivateKey, postageBatchId: batchId, reference });
  return { reference, result };
}
