# Architecture

## Resolution chain

```
                     ┌──────────────────┐
                     │     READERS      │
                     └────────┬─────────┘
                              │  needs ONLY: Bee URL + root (owner, topic)
                              ▼
                     STABLE ROOT POINTER
                     (authority-owned feed:
                      owner = succession authority,
                      topic = monastery-catalogue-root-v1)
                              │  payload: { publisherAddress, publisherTopic,
                              │             successionVersion, authorisedBy }
                              ▼
                   SUCCESSION AUTHORITY
                   (the ONLY writer of the root feed)
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                PUBLISHER A       PUBLISHER B  (only the authorised one is followed)
                     │                 │
                     ▼                 ▼
                CATALOGUE V1       CATALOGUE V2   (immutable uploads, one ref per version)
                     │                 │
                     └────────┬────────┘
                              ▼
                          SWARM
```

Separately, storage funding:

```
FUNDING IDENTITY  (buys / tops-up / dilutes postage batches; cannot publish)
      │
      ▼
POSTAGE BATCH  (pays for every chunk: content, feed updates, manifests)
      │
      ▼
SWARM STORAGE
```

## Why each arrow exists

1. **Readers → stable root.** Readers must survive every personnel change,
   so they anchor on the one thing that never rotates: the authority-owned
   root feed identity. Implemented in `src/reader/resolve.js`.
2. **Root → publisher pointer.** The root payload names WHO may publish.
   Only the authority key can write it (`src/succession/authority.js`
   enforces key→owner derivation on write; the Swarm network enforces the
   single-owner-chunk signature live).
3. **Authority → publishers.** The fork in the diagram is exclusive: exactly
   one publisher is authorised at a time. Rotation appends a new pointer;
   old pointers remain as history.
4. **Publisher → catalogue version.** The authorised publisher uploads a new
   immutable snapshot, then points its own feed at the new reference
   (`src/catalogue/publish.js`). Content versions are never mutated.
5. **Catalogues → Swarm.** Content addressing gives integrity: the same
   canonical bytes always yield the same reference, so readers and tests can
   verify exactly what they received.
6. **Funding → batch → storage.** Swarm storage is paid, not free. Every
   chunk must be covered by a postage batch, and batches run out. The
   funding identity maintains them (`src/bee/batches.js`). Funding is a
   separate key because paying for storage and speaking for the catalogue
   are different responsibilities — but see Limitations: sharing one Bee
   node means batch custody still sits with the node operator in practice.

## Why feeds over plain manifests

A manifest alone is immutable: updating content changes its hash, so readers
would need the new hash out-of-band — precisely the succession problem.
Feeds (single-owner chunks with sequential indexes) are Swarm's native
mutable pointer over immutable content (see
https://docs.ethswarm.org/docs/develop/dynamic-content/). Two feed layers
give two independent rotation axes: *what* the catalogue says (publisher
feed) and *who* may speak (root feed). A single feed could not separate
those authorities.

## Key design rules enforced in code

- `funding != publisher != authority` — checked in `src/config/load.js` and
  `src/succession/authority.js`; tests in `tests/succession.test.js`.
- Incoming publisher is always a function/CLI argument — no
  `SUCCESSOR_ADDRESS` constant exists anywhere in `src/` (checked by tests).
- Publisher writes are rejected unless the key derives to the feed owner
  (`src/succession/store.js` offline; SOC signatures live).
- Catalogue bytes are canonical (`src/catalogue/canonicalize.js`) so refs
  are deterministic and comparable across stewards.
- Live Bee calls are isolated (`src/bee/*`); `npm test` never touches the
  network. Live paths are exercised only via `--live` flags and
  `tests/live.test.js` (`LIVE=1`).

## Limitations (honest)

- A shared Bee node ties batch custody to the node operator regardless of
  key separation; real separation needs separate nodes or on-chain batch
  ownership tracking.
- The demo authority key is a single secret; production should use a
  threshold scheme (see `STEWARDSHIP.md` §15).
- Feed history is public; catalogue content here is public by design. Do
  not store non-public data without Swarm ACT encryption (out of scope).
- Offline refs are SHA-256 placeholders with the same 64-hex shape as Swarm
  refs — comparable, but only live uploads yield network-resolvable refs.
