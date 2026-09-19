#!/usr/bin/env node
// Operator CLI. Every command fails loudly instead of printing fake success.
// Offline (default): deterministic, file-backed at .state/offline-store.json.
// Live (--live): requires BEE_URL + credentials + BATCH_ID and a running Bee node.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { validateCatalogue } from './catalogue/validate.js';
import { canonicalize } from './catalogue/canonicalize.js';
import { publishCatalogueOffline, publishCatalogueLive } from './catalogue/publish.js';
import { MemorySwarm, normalizeAddress } from './succession/store.js';
import { authorizeSuccessor, verifyAuthority } from './succession/authority.js';
import { performHandoff, buildHandoffEvidence } from './succession/handoff.js';
import { resolveCatalogue } from './succession/resolve.js';
import { readerResolveLive } from './reader/resolve.js';
import { loadPublicConfig, loadEnv } from './config/load.js';
import { createBeeClient } from './bee/client.js';
import { planTopUp, planDilute, liveInspectBatches, liveTopUpBatch, liveDiluteBatch, formatBatchSummary } from './bee/batches.js';
import { publishRootPayloadToFeed } from './bee/feeds.js';

loadDotenv();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = resolve(ROOT, '.state', 'offline-store.json');
const EVIDENCE_PATH = resolve(ROOT, 'evidence', 'handoff.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function redactPresence(name) {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== '' ? 'set' : 'missing';
}

function defaultConfigPath(args) {
  return resolve(ROOT, String(args.config ?? process.env.CONFIG_PATH ?? './config/example-config.json'));
}

// ---- offline persistence ----
function loadStore() {
  const store = new MemorySwarm();
  if (!existsSync(STATE_PATH)) return store;
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    for (const [k, v] of Object.entries(raw.content ?? {})) store.content.set(k, Buffer.from(v, 'base64'));
    for (const [k, v] of Object.entries(raw.publisherFeeds ?? {})) store.publisherFeeds.set(k, v);
    for (const [k, v] of Object.entries(raw.rootFeeds ?? {})) store.rootFeeds.set(k, v);
  } catch (error) {
    fail(`Cannot load offline state at ${STATE_PATH}: ${error.message}`);
  }
  return store;
}

function saveStore(store) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const raw = { content: {}, publisherFeeds: {}, rootFeeds: {} };
  for (const [k, v] of store.content) raw.content[k] = Buffer.from(v).toString('base64');
  for (const [k, v] of store.publisherFeeds) raw.publisherFeeds[k] = v;
  for (const [k, v] of store.rootFeeds) raw.rootFeeds[k] = v;
  writeFileSync(STATE_PATH, `${JSON.stringify(raw, null, 2)}\n`);
}

function readCatalogueFile(args) {
  const p = resolve(ROOT, String(args.file ?? process.env.CATALOGUE_PATH ?? './data/seed-catalogue.json'));
  if (!existsSync(p)) fail(`Catalogue file not found: ${p}`);
  try {
    return { catalogue: JSON.parse(readFileSync(p, 'utf8')), path: p };
  } catch (error) {
    fail(`Cannot parse catalogue at ${p}: ${error.message}`);
  }
}

async function cmdInspect(args) {
  const configPath = defaultConfigPath(args);
  const cfg = loadPublicConfig(configPath);
  console.log('Succession setup');
  console.log(`  config: ${configPath}`);
  console.log(`  reader root: owner=${cfg.reader.rootOwner} topic=${cfg.reader.rootTopic}`);
  console.log(`  funding:     ${cfg.funding.address}`);
  console.log(`  publisher:   ${cfg.publisher.address} topic=${cfg.publisher.topic}`);
  console.log(`  authority:   ${cfg.successionAuthority.address}`);
  console.log('Secrets (presence only, values never printed)');
  for (const k of ['BEE_URL', 'BATCH_ID', 'FUNDING_PRIVATE_KEY', 'PUBLISHER_PRIVATE_KEY', 'SUCCESSION_AUTHORITY_PRIVATE_KEY']) {
    console.log(`  ${k}=${redactPresence(k)}`);
  }
  const distinct = new Set([cfg.funding.address.toLowerCase(), cfg.publisher.address.toLowerCase(), cfg.successionAuthority.address.toLowerCase()]);
  console.log(`  role separation: ${distinct.size === 3 ? 'OK (3 distinct addresses)' : 'BROKEN (roles overlap)'}`);
  if (distinct.size !== 3) process.exit(2);
}

async function cmdCatalogueValidate(args) {
  const { catalogue, path } = readCatalogueFile(args);
  try {
    validateCatalogue(catalogue);
  } catch (error) {
    fail(`Refusing to publish because catalogue validation failed:\n${error.message}`);
  }
  console.log(`Catalogue valid: ${path} (version ${catalogue.catalogueVersion}, ${catalogue.libraries.length} libraries, ${canonicalize(catalogue).length} canonical bytes)`);
}

async function cmdCataloguePublish(args) {
  const { catalogue, path } = readCatalogueFile(args);
  try {
    validateCatalogue(catalogue);
  } catch (error) {
    fail(`Refusing to publish because catalogue validation failed:\n${error.message}`);
  }
  if (args.live) {
    const beeUrl = loadEnv('BEE_URL', { required: true });
    const batchId = loadEnv('BATCH_ID', { required: true });
    const publisherKey = loadEnv('PUBLISHER_PRIVATE_KEY', { required: true });
    const topic = String(args.topic ?? process.env.PUBLISHER_FEED_TOPIC ?? 'monastery-catalogue-pub-v1');
    const bee = createBeeClient(beeUrl);
    try {
      const out = await publishCatalogueLive(bee, { batchId, topic, publisherPrivateKey: publisherKey, catalogue });
      console.log(`Published catalogue v${catalogue.catalogueVersion} from ${path}`);
      console.log(`  reference: ${out.reference}`);
      console.log(`  feed: owner=<publisher key address> topic=${topic}`);
    } catch (error) {
      fail(`Live publish failed: ${error?.message ?? error}`);
    }
    return;
  }
  const configPath = defaultConfigPath(args);
  const cfg = loadPublicConfig(configPath);
  const publisherKey = loadEnv('PUBLISHER_PRIVATE_KEY', { required: true });
  const store = loadStore();
  try {
    const out = publishCatalogueOffline(store, { owner: cfg.publisher.address, topic: cfg.publisher.topic, publisherPrivateKey: publisherKey, catalogue });
    saveStore(store);
    console.log(`Published catalogue v${catalogue.catalogueVersion} (offline store)`);
    console.log(`  reference: ${out.reference}`);
    console.log(`  feed index: ${out.feedIndex}`);
  } catch (error) {
    fail(error?.message ?? String(error));
  }
}

async function cmdSuccessionPrepare(args) {
  // Initialise the root feed: authority authorises the FIRST publisher.
  const configPath = defaultConfigPath(args);
  const cfg = loadPublicConfig(configPath);
  const authorityKey = loadEnv('SUCCESSION_AUTHORITY_PRIVATE_KEY', { required: true });
  const initialPublisher = String(args['initial-publisher'] ?? args.incoming ?? process.env.INCOMING_PUBLISHER_ADDRESS ?? cfg.publisher.address);
  if (!/^(0x)?[0-9a-fA-F]{40}$/.test(initialPublisher.trim())) {
    fail('Initial publisher identity must be supplied (--initial-publisher <0x...> or INCOMING_PUBLISHER_ADDRESS).');
  }
  if (args.live) {
    const beeUrl = loadEnv('BEE_URL', { required: true });
    const batchId = loadEnv('BATCH_ID', { required: true });
    const bee = createBeeClient(beeUrl);
    const pointer = {
      schema: 1, successionVersion: 1,
      publisherAddress: normalizeAddress(initialPublisher),
      publisherTopic: cfg.publisher.topic,
      authorisedBy: normalizeAddress(cfg.successionAuthority.address),
      previousPublisher: null,
      authorisedAt: new Date().toISOString(),
    };
    try {
      await publishRootPayloadToFeed(bee, { topic: cfg.successionAuthority.rootTopic, authorityPrivateKey: authorityKey, postageBatchId: batchId, payloadObject: pointer });
      console.log(`Root feed initialised (live): ${cfg.successionAuthority.address} -> ${pointer.publisherAddress}`);
    } catch (error) {
      fail(`Live succession prepare failed: ${error?.message ?? error}`);
    }
    return;
  }
  const store = loadStore();
  try {
    const entry = authorizeSuccessor(store, {
      rootOwner: cfg.successionAuthority.address,
      rootTopic: cfg.successionAuthority.rootTopic,
      authorityPrivateKey: authorityKey,
      incomingPublisherAddress: initialPublisher,
      incomingPublisherTopic: cfg.publisher.topic,
      successionVersion: 1,
    });
    saveStore(store);
    console.log(`Root feed initialised (offline): authority ${cfg.successionAuthority.address} authorised ${normalizeAddress(initialPublisher)} at index ${entry.index}`);
  } catch (error) {
    fail(error?.message ?? String(error));
  }
}

async function cmdSuccessionHandoff(args) {
  const configPath = defaultConfigPath(args);
  const cfg = loadPublicConfig(configPath);
  const incoming = String(args['incoming-address'] ?? args.incoming ?? process.env.INCOMING_PUBLISHER_ADDRESS ?? '');
  if (incoming.trim() === '') {
    fail('Incoming publisher identity must be supplied. Use --incoming-address <0x...> or INCOMING_PUBLISHER_ADDRESS.');
  }
  const authorityKey = loadEnv('SUCCESSION_AUTHORITY_PRIVATE_KEY', { required: true });
  if (args.live) {
    fail('Live hand-off requires a running Bee node and is executed by the operator; no live node is configured in this environment. Run offline hand-off first, then re-run with --live against your node. Refusing to fabricate live evidence.');
  }
  const store = loadStore();
  let record;
  try {
    record = performHandoff(store, {
      rootOwner: cfg.successionAuthority.address,
      rootTopic: cfg.successionAuthority.rootTopic,
      authorityPrivateKey: authorityKey,
      incomingPublisherAddress: incoming,
      incomingPublisherTopic: cfg.publisher.topic,
    });
    saveStore(store);
  } catch (error) {
    fail(error?.message ?? String(error));
  }
  appendEvidence(record, args);
  console.log(`Hand-off complete (offline): ${record.previousPublisher ?? '(none)'} -> ${record.incomingPublisher} (root index ${record.feedIndex})`);
  console.log(`Evidence appended to ${EVIDENCE_PATH} (mode: offline; live: pending)`);
}

function appendEvidence(record, args) {
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  let doc = { schema: 'succession-handoff-log/1', live: null, offline: [] };
  if (existsSync(EVIDENCE_PATH)) {
    try { doc = { ...doc, ...JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) }; } catch { /* keep fresh doc */ }
  }
  const evidence = buildHandoffEvidence(record, {
    commands: [`node src/cli.js succession:handoff --incoming-address ${record.incomingPublisher}`],
    live: { executed: false, status: 'pending', note: 'Offline demonstration only. Re-run against a live Bee node to attach live evidence (tx hash, feed index, manifest).' },
  });
  doc.offline = [...(doc.offline ?? []), evidence];
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(doc, null, 2)}\n`);
}

async function cmdSuccessionVerify(args) {
  const configPath = defaultConfigPath(args);
  const cfg = loadPublicConfig(configPath);
  if (args.live) {
    const beeUrl = loadEnv('BEE_URL', { required: true });
    const bee = createBeeClient(beeUrl);
    try {
      const resolved = await readerResolveLive(bee, { rootOwner: cfg.reader.rootOwner, rootTopic: cfg.reader.rootTopic });
      console.log('Succession verified (live):');
      console.log(`  publisher: ${resolved.publisher.address}`);
      console.log(`  catalogue v${resolved.catalogue.catalogueVersion} ref ${resolved.catalogueReference}`);
    } catch (error) {
      fail(`Live verification failed: ${error?.message ?? error}`);
    }
    return;
  }
  const store = loadStore();
  const verification = verifyAuthority(store, { rootOwner: cfg.reader.rootOwner, rootTopic: cfg.reader.rootTopic });
  if (!verification.ok) fail(`Succession verification failed: ${verification.reason ?? JSON.stringify(verification.checks)}`);
  let resolved;
  try {
    resolved = resolveCatalogue(store, { rootOwner: cfg.reader.rootOwner, rootTopic: cfg.reader.rootTopic });
  } catch (error) {
    fail(`Publisher authorised but catalogue unreachable: ${error?.message ?? error}`);
  }
  console.log('Succession verified (offline):');
  console.log(`  publisher: ${resolved.publisher.address}`);
  console.log(`  catalogue v${resolved.catalogue.catalogueVersion} ref ${resolved.catalogueReference}`);
  console.log(`  reader root unchanged: ${resolved.readerRoot.owner} / ${resolved.readerRoot.topic}`);
}

async function cmdStorageInspect(args) {
  if (!args.live) {
    console.log('Storage inspect (offline): planning interface only — no live batches queried.');
    console.log('Re-run with --live (requires BEE_URL + BEE_DEBUG_URL and a funded node) to list real batches.');
    console.log(`Configured BATCH_ID=${redactPresence('BATCH_ID') ? (process.env.BATCH_ID ? `${String(process.env.BATCH_ID).slice(0, 10)}…` : 'missing') : 'missing'}`);
    return;
  }
  const beeUrl = loadEnv('BEE_URL', { required: true });
  const bee = createBeeClient(beeUrl);
  try {
    const batches = await liveInspectBatches(bee);
    if (batches.length === 0) console.log('No postage batches on this node.');
    for (const b of batches) console.log(formatBatchSummary(b));
  } catch (error) {
    fail(`Bee node unavailable at BEE_URL (${beeUrl}). ${error?.message ?? error}`);
  }
}

async function cmdStorageExtend(args) {
  const newDepth = args['new-depth'] ?? args.depth;
  if (newDepth === undefined) fail('Provide --new-depth <17..255> greater than the current depth.');
  if (args.live) {
    const beeUrl = loadEnv('BEE_URL', { required: true });
    const batchId = loadEnv('BATCH_ID', { required: true });
    const bee = createBeeClient(beeUrl);
    try {
      await liveDiluteBatch(bee, batchId, Number(newDepth));
      console.log(`Batch ${batchId} diluted to depth ${newDepth} (capacity extended).`);
    } catch (error) {
      fail(`Batch dilute failed: ${error?.message ?? error}`);
    }
    return;
  }
  const currentDepth = Number(args['current-depth'] ?? 20);
  try {
    const plan = planDilute({ batch: { depth: currentDepth }, newDepth: Number(newDepth) });
    console.log(`Dilute plan (offline): depth ${plan.fromDepth} -> ${plan.toDepth}. Re-run with --live to execute against the real batch.`);
  } catch (error) {
    fail(error?.message ?? String(error));
  }
}

async function cmdStorageTopup(args) {
  const amount = args.amount ?? args['topup-amount'];
  if (amount === undefined) fail('Provide --amount <positive integer> (postage-amount units).');
  if (args.live) {
    const beeUrl = loadEnv('BEE_URL', { required: true });
    const batchId = loadEnv('BATCH_ID', { required: true });
    const bee = createBeeClient(beeUrl);
    try {
      await liveTopUpBatch(bee, batchId, BigInt(amount));
      console.log(`Batch ${batchId} topped up by ${amount} (duration extended).`);
    } catch (error) {
      fail(`Batch top-up failed: ${error?.message ?? error}`);
    }
    return;
  }
  try {
    planTopUp({ batch: { immutable: true }, additionalAmount: BigInt(amount) });
    console.log(`Top-up plan (offline): +${amount} amount units. Re-run with --live to execute against the real batch.`);
  } catch (error) {
    fail(error?.message ?? String(error));
  }
}

async function cmdReaderResolve(args) {
  const configPath = defaultConfigPath(args);
  const cfg = loadPublicConfig(configPath);
  if (args.live) {
    const beeUrl = loadEnv('BEE_URL', { required: true });
    const bee = createBeeClient(beeUrl);
    try {
      const resolved = await readerResolveLive(bee, { rootOwner: cfg.reader.rootOwner, rootTopic: cfg.reader.rootTopic });
      if (args.json) console.log(JSON.stringify(resolved, null, 2));
      else {
        console.log(`Catalogue v${resolved.catalogue.catalogueVersion} via stable root ${cfg.reader.rootOwner}/${cfg.reader.rootTopic}`);
        console.log(`  publisher: ${resolved.publisher.address}`);
        console.log(`  reference: ${resolved.catalogueReference}`);
      }
    } catch (error) {
      fail(`Reader failed: ${error?.message ?? error}`);
    }
    return;
  }
  const store = loadStore();
  try {
    const resolved = resolveCatalogue(store, { rootOwner: cfg.reader.rootOwner, rootTopic: cfg.reader.rootTopic });
    if (args.json) console.log(JSON.stringify({ ...resolved, catalogue: resolved.catalogue }, null, 2));
    else {
      console.log(`Catalogue v${resolved.catalogue.catalogueVersion} via stable root ${cfg.reader.rootOwner}/${cfg.reader.rootTopic}`);
      console.log(`  publisher: ${resolved.publisher.address}`);
      console.log(`  reference: ${resolved.catalogueReference}`);
    }
  } catch (error) {
    fail(`Reader failed: ${error?.message ?? error}`);
  }
}

const COMMANDS = {
  inspect: cmdInspect,
  'catalogue:validate': cmdCatalogueValidate,
  'catalogue:publish': cmdCataloguePublish,
  'succession:prepare': cmdSuccessionPrepare,
  'succession:handoff': cmdSuccessionHandoff,
  'succession:verify': cmdSuccessionVerify,
  'storage:inspect': cmdStorageInspect,
  'storage:extend': cmdStorageExtend,
  'storage:topup': cmdStorageTopup,
  'reader:resolve': cmdReaderResolve,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command] = args._;
  if (!command || args.help || args.h) {
    console.log('Usage: node src/cli.js <command> [options]');
    console.log(`Commands: ${Object.keys(COMMANDS).join(', ')}`);
    console.log('Global: --config <path> --file <catalogue.json> --live --json');
    console.log('Handoff: --incoming-address <0x...> (or INCOMING_PUBLISHER_ADDRESS)');
    process.exit(command ? 0 : 1);
  }
  const fn = COMMANDS[command];
  if (!fn) fail(`Unknown command ${JSON.stringify(command)}. Available: ${Object.keys(COMMANDS).join(', ')}`);
  await fn(args);
}

main().catch((error) => fail(error?.message ?? String(error)));
