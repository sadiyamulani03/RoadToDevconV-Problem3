# Hand-off record

> Machine-readable log: `evidence/handoff.json`.
> No live Bee network was available in this environment, so every entry below
> is an **offline** hand-off: really executed (through `src/cli.js`, against
> the owner-enforcing store with real secp256k1 keys), honestly labelled
> `live: { executed: false, status: 'pending' }`. Nothing here is presented
> as a live transaction.

## Demonstration hand-offs (offline, executed 2026-09-19)

Root feed: owner `0x25d8af045fab7d454a3bab27417a909c85a9a1d3`
(succession authority), topic `monastery-catalogue-root-v1`.
Publisher topic: `monastery-catalogue-pub-v1` throughout.

| # | Previous publisher | Incoming publisher | Root index | Succession v | Catalogue after |
|---|--------------------|--------------------|------------|--------------|-----------------|
| 0 | — (genesis) | `0x1efb…da1fb` (A) | 0 | 1 | v1 `f2dda1c1…` |
| 1 | `0x1efb…da1fb` (A) | `0x16c9…bfc1` (B) | 1 | 2 | v2 `b5e491e2…` |
| 2 | `0x16c9…bfc1` (B) | `0x344a…2cfe` (C) | 2 | 3 | v3 `bd49370f…` |

Commands used (exact):

```
node src/cli.js succession:prepare --config .state/local-config.json
node src/cli.js catalogue:publish --config .state/local-config.json
node src/cli.js reader:resolve --config .state/local-config.json
node src/cli.js succession:handoff --config .state/local-config.json --incoming-address 0x16c9a16b8fe89c85bca6c48ec59ccbd05626bfc1
node src/cli.js catalogue:publish --config .state/local-config.json --file .state/catalogue-v2.json   # as B
node src/cli.js reader:resolve --config .state/local-config.json                                       # v2, same root
node src/cli.js succession:handoff --config .state/local-config.json --incoming-address 0x344aa90044dc0e1d7af0a8c1fe64b2bec7782cfe
node src/cli.js catalogue:publish --config .state/local-config.json --file .state/catalogue-v3.json   # as C
node src/cli.js succession:verify --config .state/local-config.json
```

Verification after each step: `verifyAuthority` (authority owns root,
`authorisedBy` == root owner, publisher != authority, expected publisher
matches) plus `reader:resolve` showing the same reader root resolving to
the new publisher's catalogue.

## Live hand-off (pending)

To convert this into live evidence, run the same commands with `--live`
against a funded Bee node (`BEE_URL`, `BATCH_ID`, role keys in `.env`).
Append the resulting feed indexes and transaction/batch artefacts to
`evidence/handoff.json` under a `live` entry with `executed: true`.
Until then, the live status is **pending** — see `OPERATIONS.md`.
