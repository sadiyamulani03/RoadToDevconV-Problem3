# Operations Runbook

> Conventions: commands run from the repository root. Offline (default) is
> deterministic and needs no Bee node. Live commands add `--live` and need
> `BEE_URL`, `BATCH_ID`, and the relevant private key. Never expose the Bee
> API to the internet (Swarm docs warn the API has no authentication).

## First setup

1. Install Swarm Desktop and start Bee; verify the API responds:
   `npm run check:bee` (expects `BEE_URL`, default `http://localhost:1633`).
2. Fund the node (xDAI/BZZ via Swarm Desktop) and buy a postage batch as the
   **funding** identity. Prefer an **immutable** batch when using feeds.
3. Verify the batch: `npm run check:batch` (set `BATCH_ID` in `.env`).
4. Copy env: `cp .env.example .env` and fill in endpoints, `BATCH_ID`, and
   role keys (generate with `npm run identities:generate` — secrets go to
   the git-ignored `.state/`, never into git).
5. Put the three **public** addresses in a config file
   (`config/example-config.json` is the template; keep the three roles
   distinct, with `reader.rootOwner == successionAuthority.address`).
6. Initialise identities: `npm run inspect` must report
   `role separation: OK (3 distinct addresses)`.
7. Publish the initial catalogue:
   `npm run catalogue:validate && npm run catalogue:publish -- --live`
   (offline rehearsal first without `--live`).
8. Initialise the root feed: `npm run succession:prepare -- --live`.

## Normal update (publisher)

1. Edit the catalogue file; bump `catalogueVersion`.
2. `npm run catalogue:validate -- --file <path>` — refuses bad data.
3. Upload (immutable, new reference) + point the publisher feed:
   `npm run catalogue:publish -- --file <path> --live`.
4. Verify: `npm run reader:resolve -- --live` shows the new version under
   the unchanged reader root.
5. Record the resulting feed index / reference in `evidence/`.

## Storage maintenance (funding steward)

1. `npm run storage:inspect -- --live` — list real batches.
2. Check remaining capacity/duration; decide top-up (duration) vs
   dilute/extend (capacity).
3. Top up the **existing** batch:
   `npm run storage:topup -- --amount <units> --live`.
   Extend capacity of the **existing** batch:
   `npm run storage:extend -- --new-depth <21..255> --live`.
   Do NOT buy a new batch when the configured one is still usable
   (the CLI distinguishes `extend-or-topup-existing` from `create-new`).
4. Re-run `storage:inspect -- --live` and record the maintenance.

## Succession (authority)

1. Confirm the §8 trigger (signed declaration, or 30-day unreachability +
   4-of-7 attestations) and record it.
2. Identify the incoming steward; obtain their **address** (never their key).
3. Execute the hand-off:
   `npm run succession:handoff -- --incoming-address <0x...> --live`
   (offline rehearsal without `--live` first).
4. Update the tracker's `publisher.address` to the incoming address.
5. Verify: `npm run succession:verify -- --live`.
6. Incoming publisher publishes a test update (`catalogue:publish --live`).
7. Verify the old reader path still resolves (`reader:resolve --live` —
   same root, new publisher, new content).
8. Record evidence in `evidence/handoff.json` (previous + incoming
   identities, timestamp, feed index, tx hash if any, commands, live flag).

## Second succession

Repeat the succession section with a third identity. The reader root never
changes. The offline rehearsal is `npm run demo:offline` (A → B → C).

## Troubleshooting

- `Bee node unavailable at BEE_URL` → start Bee / fix `BEE_URL`.
- `Configured batch does not exist` → run `storage:inspect`, fix `BATCH_ID`.
- `Publisher identity is missing` → set `PUBLISHER_PRIVATE_KEY`.
- `Succession authority is not configured` → set
  `SUCCESSION_AUTHORITY_PRIVATE_KEY`.
- `Incoming publisher identity must be supplied` → pass
  `--incoming-address` / `INCOMING_PUBLISHER_ADDRESS`.
- `Refusing to publish because catalogue validation failed` → fix the data;
  the CLI prints every violation.
