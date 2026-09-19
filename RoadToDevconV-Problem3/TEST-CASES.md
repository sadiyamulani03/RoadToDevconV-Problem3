# Test-case mapping (challenge scoring)

Offline = `npm test` (deterministic, no Bee node). Live = gated commands /
`npm run test:live` (`LIVE=1`, needs `BEE_URL` + credentials + `BATCH_ID`).
No live Bee node was available in this environment, so live items are
implemented, reachable, and marked **pending** — never faked.

## TEST 1 — stable reader address after publisher change (20 pts)

- Implementation: `src/succession/resolve.js` (`resolveCatalogue`),
  `src/reader/resolve.js` (`readerResolveOffline` / `readerResolveLive`),
  root feed owned by the authority (`src/succession/authority.js`).
- Test: `tests/succession.test.js` → "stable pointer resolution" (initial
  publisher reachable; same root resolves new publisher + content after
  rotation) and "succession works twice (A → B → C)" (root identical at all
  three steps); reader-continuity assertions included.
- Evidence: `scripts/demo-offline.js` output; CLI run
  (`reader:resolve` before/after each hand-off, same root printed);
  `evidence/handoff.json` (root topic identical, feed indexes 1, 2).
- Status: **proven offline**; live pending (same code path via `--live`).

## TEST 2 — funding identity distinct from publisher identity (12 pts)

- Implementation: `src/config/load.js` (refuses configs where the three
  role addresses are not distinct), `config/example-config.json`
  (three visibly different placeholders).
- Test: `tests/succession.test.js` → "separate identities" (three distinct
  addresses; funding key cannot publish — signature rejected).
- Evidence: `npm run inspect` prints `role separation: OK (3 distinct
  addresses)` or exits non-zero.
- Status: **proven offline**.

## TEST 3 — existing batch extended/topped-up (10 pts)

- Implementation: `src/bee/batches.js` — `planTopUp` / `planDilute`
  (pure, offline) vs `liveTopUpBatch` / `liveDiluteBatch`
  (`bee.stamp.topUp` / `bee.stamp.dilute`, bee-js v13); `describeBatchStrategy`
  separates `extend-or-topup-existing` from `create-new`. CLI:
  `storage:extend` (dilute = capacity extend), `storage:topup` (duration).
- Test: `tests/storage.test.js` (top-up planning, dilute planning, refusal
  to shrink, missing-batch refusal, strategy distinction).
- Evidence: CLI offline plans print; live execution pending (no Bee node).
- Status: **command paths proven offline, execution live-pending**.

## TEST 4 — written arrangement names successor + trigger (10 pts)

- Implementation: `STEWARDSHIP.md` §7 names the demonstration successor
  (Publisher B `0x5cbd…07fb`, second-save Publisher C `0x7564…bdac`) and §8
  states the exact trigger (signed declaration OR 30-day unreachability +
  4-of-7 attestations).
- Test: documentation requirement — verified by inspection; the named
  successor is the address actually rotated to in tests/demo/evidence.
- Status: **satisfied** (placeholders clearly marked; real custodians must
  be enrolled externally).

## TEST 5 — actual performed hand-off (10 pts)

- Implementation: `src/succession/handoff.js` (`performHandoff`),
  CLI `succession:handoff` (appends to `evidence/handoff.json`).
- Test: `tests/handoff-evidence.test.js` (evidence shape, honesty labels).
- Evidence: `evidence/handoff.json` — two real offline hand-offs executed
  through the CLI (A → B at root index 1, B → C at root index 2, with
  verification results and exact commands). `HANDOFF.md` summarises.
  Live hand-off: **pending** (no Bee node; infrastructure ready).
- Status: **performed offline, honestly labelled**; live pending.

## TEST 6 — authority changing publisher distinct from publisher (8 pts)

- Implementation: `src/succession/authority.js` (`buildRootPointer` throws
  when authority == publisher; root writes require the authority key),
  `src/succession/store.js` (key→owner derivation enforced on write).
- Test: `tests/succession.test.js` → "publisher rotation enforcement"
  (publisher key cannot write the root feed; authority==publisher rejected;
  rogue post-rotation publisher update does not move the reader) and
  `verifyAuthority` checks.
- Status: **proven offline**.

## TEST 7 — no secrets/authenticated URLs in tracked files (6 pts)

- Implementation: `.gitignore` (covers `.env`, keys, wallets, gift codes),
  `.env.example` (names only, no values), secret-free example config,
  `scripts/secret-scan.js` + `npm run secrets:scan`.
- Test: `tests/secrets.test.js` (no `.env`, no key assignments with values,
  no auth URLs, no mnemonics/gift values, example files clean).
- Evidence: `npm run secrets:scan` → `secret scan ok`; `git ls-files`
  must not list `.env`/`.state/`.
- Status: **proven offline**.

## TEST 8 — incoming steward identity supplied externally (4 pts)

- Implementation: `src/succession/handoff.js` (`performHandoff` requires
  `incomingPublisherAddress`; no successor constant exists in `src/`),
  CLI `--incoming-address` / `INCOMING_PUBLISHER_ADDRESS`.
- Test: `tests/succession.test.js` → "incoming steward supplied
  externally" (empty identity refused; any external address accepted).
- Evidence: `evidence/handoff.json` commands show the address passed on the
  command line.
- Status: **proven offline**.
