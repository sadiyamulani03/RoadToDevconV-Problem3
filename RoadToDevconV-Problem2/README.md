# Road to Devcon V — Problem 2: Deccan Birders Sighting on Swarm

Censorship-resistant bird-sighting records on [Swarm](https://ethswarm.org) through the
**subsidised gateway** — no personal stamp/batch required. A capability-gated writer
uploads portable JSON bytes; a genuinely independent reader downloads and renders them
through the same endpoint family.

## Layout (separation is the point)

```text
RoadToDevconV-Problem2/
  shared/format.js      standalone schema ONLY (format + version, build/parse/validate)
  writer/
    index.html          writer entrypoint (browser)
    writer.js           writer browser logic (DOM + specific error reasons)
    config.js           subsidisedGatewayUrl configuration
    capability.js       checkUploadCapability() + uploadCapability state
    upload.js           single audited upload entry point (capability-gated)
    cli.js              writer Node entrypoint (check | upload)
    style.css
  reader/               independent app — no writer imports
    index.html          reader entrypoint (browser)
    app.js              reader browser logic (own gateway constant, 5 steps)
    cli.js              reader Node entrypoint
    style.css
  scripts/audit.js      static + logic audit printing the judge matrix
  tests/unit.test.js    offline deterministic tests (node --test)
```

The reader is **not** another route/page/tab/component of the writer. It has its own
entrypoints (`reader/index.html`, `reader/cli.js`), its own gateway constant, its own
download/parse/validate/render flow, and imports only `../shared/format.js`. It never
imports `writer/` code.

## Endpoint family: raw `/bytes` both ways

- Writer upload: `POST https://api.gateway.ethswarm.org/bytes`
  (`writer/upload.js` derives the URL from `swarmConfig.subsidisedGatewayUrl`).
- Reader download: `GET https://api.gateway.ethswarm.org/bytes/<reference>`
  (`reader/app.js` and `reader/cli.js` each define their own `READER_GATEWAY_URL`
  for the same host and fetch `bytes/<ref>`).

No `/bzz` mixing in any upload/download path. The reference returned by the `POST`
is directly usable with the `GET` (verified live: `POST → 201 {reference}` then
`GET → 200` identical bytes).

## Portable record (format + version live in the bytes)

`shared/format.js` is the single schema definition:

```js
export const SIGHTING_FORMAT = 'deccan-birders-sighting'
export const SIGHTING_VERSION = 1
```

`buildSightingRecord()` embeds both inline; `serializeSightingRecordToString()`
produces the exact bytes uploaded. Inspect `serializedText` before upload to verify.

Serialized example (actual bytes uploaded):

```json
{"format":"deccan-birders-sighting","version":1,"species":"Indian Roller","count":2,"location":"Deccan scrub","observedAt":"2026-01-15T07:30:00.000Z","observer":"demo-observer","notes":""}
```

## Capability before upload (sign-in is never enough)

1. Sign in with Swarm ID (demo local session — no credentials stored).
2. Press **Check upload capability** — `checkUploadCapability()` probes the subsidised
   gateway and sets `uploadCapability = { available, reason, checkedAt }`.
3. The upload button stays disabled until **both** sign-in and capability are confirmed.
4. `uploadSightingRecord()` re-checks `uploadCapability.available` as its first
   statement and throws `upload-capability-unavailable` otherwise. There is exactly one
   upload call site; every write path goes through it.

## Subsidised gateway (no-stamp route)

`writer/config.js`:

```js
export const swarmConfig = {
  subsidisedGatewayUrl: 'https://api.gateway.ethswarm.org/',
}
```

The upload path uses it directly: `` `${swarmConfig.subsidisedGatewayUrl}bytes` ``.
No personal stamp/batch header is required, so a fresh Swarm ID user can upload.

## Gateway upload carries no extra arguments

The gateway `fetch` sends only the bytes with `Content-Type: application/json`.
No additional upload arguments are passed on the gateway path. See
`writer/upload.js` fetch block (headers contain `Content-Type` only).

## Specific, actionable failure reasons (user-visible)

`UploadError.reason` is one of:

`upload-capability-unavailable`, `gateway-unavailable`, `auth-connection-problem`,
`validation-failed`, `network-failure`, `upload-rejected`, `malformed-response`,
`unknown-error`.

Browser failures render `[reason] message. Action: …` into `#upload-error` (DOM, not
console-only). CLI failures print `[reason] …` plus an `Action:` line to stderr.
No path collapses to a bare "Upload failed."

## Run

```bash
npm test          # offline unit tests
npm run audit     # repository audit → judge matrix (must be all PASS)

# Writer (Node)
node writer/cli.js check
node writer/cli.js upload --species "Indian Roller" --count 2 --location "Deccan scrub" --observer "demo"

# Reader (Node)
node reader/cli.js <64-hex-reference-from-writer>

# Browser
# open writer/index.html then reader/index.html (serve the folder, e.g. npx serve .)
```

## Secrets

No private keys, mnemonics, gift codes, credential-bearing URLs, API keys,
authenticated URLs, seed phrases, or wallet secrets are tracked. Secrets would come
from environment/ignored files only. `.env.example` holds placeholders.

## Judge matrix (produced by `npm run audit`)

| Check | Requirement               | Evidence                       | Status    |
| ----- | ------------------------- | ------------------------------ | --------- |
| 1     | Capability before upload  | writer/upload.js:uploadSightingRecord + writer/capability.js:checkUploadCapability | PASS |
| 2     | No-stamp gateway          | writer/config.js:swarmConfig.subsidisedGatewayUrl='https://api.gateway.ethswarm.org/' used by writer/upload.js | PASS |
| 3     | Format + version in bytes | shared/format.js:buildSightingRecord → {"format":"deccan-birders-sighting","version":1,…} | PASS |
| 4     | Independent reader        | reader/cli.js + reader/index.html:reader/app.js (imports only ../shared/format.js; no writer/*) | PASS |
| 5     | Matching endpoint family  | writer POST <gateway>bytes + reader GET <gateway>bytes/<ref> (no /bzz mixing) | PASS |
| 6     | No pin/tag gateway        | writer/upload.js gateway fetch (Content-Type only; no extra upload arguments) | PASS |
| 7     | Specific failure reason   | writer/upload.js:UploadError(reason) → #upload-error (DOM) + CLI [reason] | PASS |
| 8     | No tracked credentials    | .env.example placeholders only; scanned files clean | PASS |
