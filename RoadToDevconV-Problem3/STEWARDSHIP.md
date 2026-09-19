# Stewardship Agreement — Shared Monastery Manuscript Catalogue

> Status: **demonstration draft with placeholders.** Nothing below is a real
> institutional agreement. Committee names, personal names, and addresses are
> placeholders so the seven committees can review the *mechanism* before any
> real identities are enrolled. No live hand-off has been performed yet
> (see `HANDOFF.md`: offline verified, live pending).

Scenario: the catalogue was built and published by an original steward
("Ngawang Dorje" in the challenge story — a placeholder name here for the
first publisher). The arrangement must survive that person stopping, and
survive whoever comes after them stopping too.

## 1. What the catalogue is

A versioned, machine-readable inventory of manuscript folios held across
seven monastery libraries. Each record carries a monastery identifier, a
collection identifier, a folio identifier, a condition grade, damaged /
missing / photographed flags, the catalogue version, an update timestamp,
and the responsible institution. Schema and validation live in
`src/catalogue/`; the demo dataset is `data/seed-catalogue.json`.

## 2. What is stored on Swarm

- **Immutable catalogue snapshots.** Every version is canonically serialised
  and uploaded as immutable content (one Swarm reference per version).
  Old versions are never overwritten.
- **A publisher feed** (one per current publisher) pointing at the latest
  catalogue reference. The feed is the mutable pointer; content is immutable.
- **A root feed** owned by the succession authority, pointing at the
  currently authorised publisher. This is the stable reader entry point.
- All feed and content chunks are pinned by postage stamp batches owned by
  the funding identity (see §5).

## 3. Who may read it

**Anyone.** Readers need only the Bee endpoint plus the public reader root
(authority address + root topic, see `config/example-config.json`). No
private key of any kind is required. The third-party reader is
`src/reader/resolve.js` (`npm run reader:resolve`).

## 4. Who pays for storage

The **funding steward** (placeholder address `0xffff…ffff` in
`config/example-config.json`; test-fixture address
`0x8fd379246834eac74b8419ffda202cf8051f7a03`). The funding identity buys,
tops up, and dilutes (extends) postage batches. It cannot publish and
cannot authorise succession.

## 5. Who may publish updates

Only the **currently authorised publisher**. At the time of writing the
demonstration publisher is Publisher A
(test-fixture address `0x1563915e194d8cfba1943570603f7606a3115508`).
The publisher signs catalogue-feed updates with its own key. The publisher
**cannot** appoint its own replacement.

## 6. Who controls succession

The **succession authority** (placeholder `0xaaaa…aaaa`; test-fixture
`0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a`), a key held jointly by the
seven committees under the approval rule in §14. Only this key can write
the root feed. Authority, publisher, and funding are three distinct keys —
enforced in code (`src/succession/authority.js`, `src/config/load.js`).

## 7. Who the first successor is

For the repository's test fixture and demonstration, the named first
successor is **Publisher B, address
`0x5cbdd86a2fa8dc4bddd8a8f69dba48572eec07fb`**
(test-fixture only — a deterministic demo key, not a real custodian).
The second-save successor used to prove repeatability is Publisher C,
`0x7564105e977516c53be337314c7e53838967bdac`.
Real deployments MUST replace these with enrolled committee custodians
supplied externally (`--incoming-address` / `INCOMING_PUBLISHER_ADDRESS`);
the succession code accepts no hardcoded successor.

## 8. What exact event triggers succession

Succession is triggered when **either** of the following is true:

1. the current steward signs a written succession declaration naming the
   incoming steward; **or**
2. the current steward is unreachable for **30 consecutive days**, confirmed
   by written attestations from **at least 4 of the 7** monastery committees.

For the demonstration, trigger (1) is simulated: the operator invokes the
hand-off command on behalf of the authority after recording the declaration
in `evidence/handoff.json`.

## 9. How the successor is authorised

The authority executes `succession:handoff` with the incoming publisher's
address supplied externally. This appends a signed pointer
`{ successionVersion, publisherAddress, publisherTopic, authorisedBy,
previousPublisher, authorisedAt }` to the root feed. The reader root does
not change; only the pointer target changes.

## 10. How the successor proves control

After hand-off, the incoming publisher publishes a test catalogue update
signed with its own key (`catalogue:publish`), and the committees run
`succession:verify` + `reader:resolve` to confirm the stable root now
resolves to content signed by the new publisher.

## 11. How a second succession works

Identically to the first: the authority authorises Publisher C while the
reader root stays fixed. The repository proves this with the A → B → C
chain in `tests/succession.test.js` and `scripts/demo-offline.js`. There is
no "one-time migration" — succession is a repeatable process.

## 12. What happens if a publisher becomes unavailable

Reading is unaffected (content and feeds persist on Swarm while postage is
funded). Publishing pauses until the authority authorises a successor under
§8. The old publisher's key cannot block the hand-off because it has no
write access to the root feed.

## 13. What happens if the funding steward becomes unavailable

Content remains retrievable until the postage batch expires. The committees
must designate a new funding steward who buys a new batch and re-uploads
(pin) the catalogue reference set; the reader path is unchanged because
Swarm references are content-addressed. Batch expiry monitoring is part of
`OPERATIONS.md` (storage maintenance).

## 14. How the seven institutions approve changes

- Catalogue content updates: the current publisher plus countersignature
  (off-chain written approval) from the committee owning the affected
  library.
- Publisher rotation: authority key operation under the §8 trigger, with
  4-of-7 written attestations retained in `evidence/`.
- Funding operations: funding steward, reported to all committees.
- Agreement amendments: unanimous written consent of all seven committees.

## 15. How emergency recovery works

If the authority key is lost, the committees convene, generate a new
authority key under 4-of-7 attestation, publish a new reader root, and
announce the migration through all existing off-chain channels. (The old
root remains readable for history but is marked superseded.) Key shares
SHOULD be held under a threshold scheme once real custodians enroll —
the current demo holds the authority key as a single operator secret,
which is an acknowledged limitation (see README).

## 16. What happens if the shared Bee node is unavailable

Reads and writes pause; nothing is lost (Swarm content persists on the
network while funded). Operators restore or replace the node, re-check
batch state (`storage:inspect`), and resume. The authority/publisher/funding
keys are node-independent and remain valid against any Bee node.

## 17. How the committees verify the current publisher

Run `npm run succession:verify` and `npm run reader:resolve`: the output
shows the authorised publisher address, the catalogue version, and the
unchanged reader root. Anyone with the public config can do this.

## 18. What records are retained

Every hand-off appends to `evidence/handoff.json`: previous and incoming
identities, timestamp, mechanism, feed index, verification result, exact
commands, and whether execution was live or offline. Catalogue versions are
retained as immutable Swarm references.

## 19. How responsibilities are rehearsed periodically

Quarterly drill: rotate a *test* publisher identity on a non-production
topic, publish a test catalogue, verify reader continuity, top up a test
batch, then rotate back. Record the drill in `evidence/`. The automated
suite (`npm test`) plus `npm run demo:offline` serve as the technical part
of the drill.
