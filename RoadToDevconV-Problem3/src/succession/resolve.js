// Full resolution chain (offline, against MemorySwarm):
//   STABLE ROOT (authority owner + root topic)
//     -> succession-authorised publisher pointer
//     -> current publisher feed
//     -> current catalogue reference
//     -> catalogue bytes (validated)
// The reader root never changes across rotation.
import { validateCatalogue } from '../catalogue/validate.js';
import { normalizeAddress } from './store.js';

export function resolvePublisher(store, { rootOwner, rootTopic }) {
  const root = store.readRootFeed({ owner: rootOwner, topic: rootTopic });
  if (root.status !== 'found') {
    throw new Error('Reader root has no authorised publisher yet (root feed is empty).');
  }
  const pointer = root.payload;
  if (pointer.authorisedBy.toLowerCase() !== normalizeAddress(rootOwner).toLowerCase()) {
    throw new Error('Root pointer is not authorised by the expected succession authority.');
  }
  if (pointer.publisherAddress.toLowerCase() === normalizeAddress(rootOwner).toLowerCase()) {
    throw new Error('Invalid pointer: publisher must differ from the succession authority.');
  }
  return { pointer, rootIndex: root.index };
}

export function resolveCatalogue(store, { rootOwner, rootTopic }) {
  const { pointer, rootIndex } = resolvePublisher(store, { rootOwner, rootTopic });
  const feed = store.readPublisherFeed({ owner: pointer.publisherAddress, topic: pointer.publisherTopic });
  if (feed.status !== 'found') {
    throw new Error(`Authorised publisher ${pointer.publisherAddress} has not published any catalogue yet.`);
  }
  const bytes = store.getContent(feed.reference);
  const catalogue = JSON.parse(bytes.toString('utf8'));
  validateCatalogue(catalogue);
  return {
    readerRoot: { owner: normalizeAddress(rootOwner), topic: rootTopic, rootIndex },
    publisher: { address: pointer.publisherAddress, topic: pointer.publisherTopic },
    catalogueReference: feed.reference,
    catalogueIndex: feed.index,
    successionVersion: pointer.successionVersion,
    catalogue,
  };
}
