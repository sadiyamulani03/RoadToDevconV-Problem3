// Third-party reader: needs ONLY the Bee endpoint + stable public root.
// It must NOT require publisher, funding, or authority private keys —
// this module never reads them and the CLI refuses to run if they are
// passed as a substitute for the public root.
import { resolveCatalogue as resolveOffline } from '../succession/resolve.js';
import { readLatestFeedPayload, readLatestFeedReference } from '../bee/feeds.js';
import { downloadCatalogue } from '../bee/storage.js';

export function assertReaderInputs({ rootOwner, rootTopic }) {
  if (typeof rootOwner !== 'string' || !/^(0x)?[0-9a-fA-F]{40}$/.test(rootOwner.trim())) {
    throw new Error('Reader needs the stable root owner address (public). Provide --root-owner <0x...> or config reader.rootOwner.');
  }
  if (typeof rootTopic !== 'string' || rootTopic.length === 0) {
    throw new Error('Reader needs the stable root topic (public). Provide --root-topic <name> or config reader.rootTopic.');
  }
}

/** Offline resolution (tests, demos). Takes a MemorySwarm + public root only. */
export function readerResolveOffline(store, { rootOwner, rootTopic }) {
  assertReaderInputs({ rootOwner, rootTopic });
  return resolveOffline(store, { rootOwner, rootTopic });
}

/** Live resolution (gated): root payload -> publisher feed -> catalogue bytes. */
export async function readerResolveLive(bee, { rootOwner, rootTopic }) {
  assertReaderInputs({ rootOwner, rootTopic });
  const root = await readLatestFeedPayload(bee, { topic: rootTopic, owner: rootOwner });
  if (root.status !== 'found') throw new Error('Reader root has no authorised publisher yet (root feed is empty).');
  let pointer;
  try {
    pointer = JSON.parse(root.payload);
  } catch {
    throw new Error('Root feed payload is not valid JSON; cannot determine the authorised publisher.');
  }
  const feed = await readLatestFeedReference(bee, { topic: pointer.publisherTopic, owner: pointer.publisherAddress });
  if (feed.status !== 'found') throw new Error(`Authorised publisher ${pointer.publisherAddress} has not published any catalogue yet.`);
  const catalogue = await downloadCatalogue(bee, feed.reference);
  return {
    readerRoot: { owner: rootOwner, topic: rootTopic, rootIndex: root.feedIndex },
    publisher: { address: pointer.publisherAddress, topic: pointer.publisherTopic },
    catalogueReference: feed.reference,
    successionVersion: pointer.successionVersion,
    catalogue,
  };
}
