// Bee connectivity probe (live, gated). Never fabricates batches or uploads.
import { config as loadDotenv } from 'dotenv';
import { createBeeClient, checkBeeConnectivity } from '../src/bee/client.js';

loadDotenv();
const beeUrl = process.env.BEE_URL ?? 'http://localhost:1633';
let bee;
try {
  bee = createBeeClient(beeUrl);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
const result = await checkBeeConnectivity(bee);
if (!result.ok) {
  console.error(`Bee node unavailable at BEE_URL (${beeUrl}). ${result.error}`);
  process.exit(2);
}
console.log(`Bee reachable at ${beeUrl}.`);
console.log(JSON.stringify(result.status ?? {}, null, 2).slice(0, 2000));
