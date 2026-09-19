# The Succession Nobody Wrote Down

A Swarm-based manuscript catalogue for seven monastery libraries that
survives its stewards: the original steward stopping, the publishing
identity being retired, funding living under a separate key, the successor
taking over — and being replaced in turn — while readers keep using one
stable entry point that never changes.

## Problem

A shared catalogue lives on Swarm. The person who publishes it (call them
the Ngawang Dorje of the story) will one day stop. When they do, the
committees discover nothing was written down: who pays for storage, who may
publish, who decides who publishes next, and where readers should look.
A plain upload solves none of this — content hashes change on every edit,
keys are implicitly shared, and "the community owns it" is a slogan, not a
mechanism.

## Solution

Three separate keys, two feed layers, one stable root:

- **Funding identity** owns postage batches (pays for storage).
- **Publisher identity** signs catalogue updates (speaks for the content).
- **Succession authority** owns a root feed naming the current publisher
  (decides who speaks next).
- **Readers** know only the root — authority address + topic — and resolve
  root → publisher → catalogue. The root never rotates.

Succession is an executable operation (`succession:handoff`), not a
paragraph: the authority appends a signed pointer, the reader follows it,
and the old publisher loses nothing except relevance — they cannot block
or hijack the hand-off because they cannot write the root feed.

## Core insight

The catalogue must survive the person, not merely survive the machine.
Persistence is a funding problem; legitimacy is a succession problem; only
the reader path proves both are solved at once.

## Architecture

See `ARCHITECTURE.md` for the full diagram and rationale. In short:

```
READERS → STABLE ROOT (authority feed) → AUTHORISED PUBLISHER (feed)
        → CATALOGUE VERSION (immutable) → SWARM
FUNDING → POSTAGE BATCH → SWARM STORAGE
```

Key files: `src/succession/` (authority, hand-off, resolution, store),
`src/catalogue/` (schema, canonicalisation, validation, publishing),
`src/bee/` (v13 client, feeds, storage, batches), `src/reader/`,
`src/config/`, `src/cli.js`.

## Roles

| Role | Holds | Can | Cannot |
|------|-------|-----|--------|
| Funding | batch keys | buy / top-up / dilute batches | publish, rotate |
| Publisher | publisher key | publish catalogue versions | appoint successor |
| Authority | authority key | rotate publisher via root feed | (should not publish) |
| Reader | public root only | resolve current catalogue | write anything |

`npm run inspect` verifies the three roles are distinct.

## Stable reader address

`READER_ROOT = (successionAuthority.address, rootTopic)`. Publisher A → B →
C changes only the root feed's *payload*; the root identity is constant.
`npm run reader:resolve` demonstrates it; tests assert it at every step.

## Storage

Swarm storage is paid via postage stamp batches that deplete. The funding
steward maintains the **existing** batch (`storage:topup` for duration,
`storage:extend` for capacity/dilute) instead of silently buying new ones —
the CLI plans offline and executes with `--live`. Batches holding feeds
should be **immutable**. Honest limitation: on a shared Bee node, batch
custody sits with the node operator whatever the keys say.

## Succession

`npm run demo:offline` runs A → B → C end to end. Operator flow:
`succession:prepare` (genesis) → `catalogue:publish` → `succession:handoff
--incoming-address <0x…>` → `catalogue:publish` (as successor) →
`succession:verify` + `reader:resolve`. Repeat for the second succession.

## Actual hand-off

See `HANDOFF.md` + `evidence/handoff.json`: two hand-offs genuinely
executed through the CLI (offline; live pending — no Bee node was
available, and no live evidence is claimed).

## Verification

```
npm install
npm test            # offline, deterministic (33 tests)
npm run build
npm run lint
npm run secrets:scan
npm run demo:offline
npm run test:live   # gated: needs LIVE=1 + Bee node (skips otherwise)
```

## Test coverage

8 challenge tests mapped in `TEST-CASES.md`: stable reader (20), funding
separation (12), batch extend/top-up (10), written arrangement (10),
performed hand-off (10), authority separation (8), no secrets (6), external
incoming identity (4).

## Security

Private keys live only in environment / git-ignored `.state/`; the example
config carries public placeholders; the CLI prints presence, never values;
`tests/secrets.test.js` + `scripts/secret-scan.js` guard the tree. Never
expose the Bee API to the internet.

## Limitations

- Live paths are implemented but unverified here (no Bee node available);
  offline proofs use owner-enforcing in-memory Swarm semantics with real
  secp256k1 keys, not network signatures.
- Single-key authority in the demo (production wants a threshold scheme).
- Shared-node batch custody caveat (above).
- Catalogue content is public by design; no encryption layer.

## Reproduction

1. `cp .env.example .env` (fill nothing for offline).
2. `npm install && npm test && npm run demo:offline`.
3. `npm run identities:generate`, then follow `OPERATIONS.md` with
   `--config .state/local-config.json` (see `HANDOFF.md` for the exact
   command history).

## Live demo

Pending — no live Bee node in this environment. When available, re-run the
`HANDOFF.md` commands with `--live` and record real refs/indexes/tx hashes
in `evidence/handoff.json`.
