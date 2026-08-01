#!/usr/bin/env node

/**
 * OpenFGA bootstrap.
 *
 * Idempotent. Two modes:
 *
 *   1. FGA_STORE_ID and FGA_MODEL_ID are already set (existing environment):
 *      verify the store + model exist on the server and exit ok.
 *
 *   2. FGA_STORE_ID and/or FGA_MODEL_ID are missing (fresh environment):
 *      create a store, write the model from fga/authorization-model.json,
 *      print the resulting IDs so they can be saved into .env.
 *
 * Requires FGA_API_URL. Reads the model from fga/authorization-model.json.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');

const MODEL_FILE = path.join(__dirname, '../../fga/authorization-model.json');
const API_URL = process.env.FGA_API_URL;
const STORE_ID = process.env.FGA_STORE_ID;
const MODEL_ID = process.env.FGA_MODEL_ID;
const STORE_NAME = process.env.FGA_STORE_NAME || 'patient-records';

if (!API_URL) {
  console.error('FGA_API_URL is not set. Refusing to run.');
  process.exit(1);
}

async function fgaFetch(pathname, init = {}) {
  const r = await fetch(`${API_URL}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`FGA ${r.status} on ${pathname}: ${body}`);
  }
  return r.json();
}

async function verifyExisting() {
  console.log('FGA_STORE_ID and FGA_MODEL_ID are set — verifying they exist on the server...');

  await fgaFetch(`/stores/${STORE_ID}`);
  console.log(`  store ${STORE_ID}  ok`);

  await fgaFetch(`/stores/${STORE_ID}/authorization-models/${MODEL_ID}`);
  console.log(`  model ${MODEL_ID}  ok`);

  console.log('\nBootstrap: nothing to do. Existing store + model are valid.');
}

async function createFresh() {
  console.log('No FGA_STORE_ID/FGA_MODEL_ID set — bootstrapping a fresh store + model.\n');

  const model = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));

  const store = await fgaFetch('/stores', {
    method: 'POST',
    body: JSON.stringify({ name: STORE_NAME }),
  });
  console.log(`  created store: ${store.id}`);

  const written = await fgaFetch(
    `/stores/${store.id}/authorization-models`,
    { method: 'POST', body: JSON.stringify(model) }
  );
  console.log(`  wrote model:   ${written.authorization_model_id}`);

  console.log('\nAdd these to your .env:\n');
  console.log(`  FGA_STORE_ID=${store.id}`);
  console.log(`  FGA_MODEL_ID=${written.authorization_model_id}`);
  console.log('');
}

async function main() {
  if (STORE_ID && MODEL_ID) {
    await verifyExisting();
  } else {
    await createFresh();
  }
}

main().catch((err) => {
  console.error(`\nBootstrap failed: ${err.message}\n`);
  process.exit(1);
});
