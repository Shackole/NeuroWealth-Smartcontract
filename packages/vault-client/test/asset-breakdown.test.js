/**
 * Tests for VaultClient.getAssetBreakdown (Issue #59)
 *
 * Verifies:
 *  1. getAssetBreakdown normalises both the array and object return shapes.
 *  2. The returned idle + deployed sum ≈ total_deposits (within rounding).
 *  3. The method is faster than two sequential simulate() calls (benchmark stub).
 */

const assert = require('node:assert/strict');
const test = require('node:test');

// ---------------------------------------------------------------------------
// Minimal VaultClient test double
// ---------------------------------------------------------------------------

/**
 * Creates a minimal VaultClient stand-in that stubs the internal simulate()
 * helper with a custom response, letting us test getAssetBreakdown's parsing
 * logic without a live Soroban RPC node.
 */
function makeClientWithStub(simulateResponse) {
  // We import the built module to exercise real code paths.
  const { VaultClient } = require('../dist/index.js');

  const client = new VaultClient({
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    rpcUrl: 'https://soroban-testnet.stellar.org',
  });

  // Monkey-patch the private simulate method
  client._simulateStub = simulateResponse;
  const original = Object.getPrototypeOf(client);
  const proto = Object.create(original);
  proto.simulate = async function (_method, _args, _key) {
    if (client._simulateStub !== undefined) return client._simulateStub;
    return original.simulate.call(this, _method, _args, _key);
  };
  Object.setPrototypeOf(client, proto);

  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('getAssetBreakdown: handles tuple [idle, deployed] return shape', async () => {
  const idleRaw = 5_000_000_000n;      // 500 USDC
  const deployedRaw = 10_000_000_000n; // 1 000 USDC

  const client = makeClientWithStub([idleRaw, deployedRaw]);
  const breakdown = await client.getAssetBreakdown('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');

  assert.equal(breakdown.idle, idleRaw, 'idle should match raw tuple[0]');
  assert.equal(breakdown.deployed, deployedRaw, 'deployed should match raw tuple[1]');
});

test('getAssetBreakdown: handles object { idle, deployed } return shape', async () => {
  const idleRaw = 3_000_000_000n;
  const deployedRaw = 7_000_000_000n;

  const client = makeClientWithStub({ idle: idleRaw, deployed: deployedRaw });
  const breakdown = await client.getAssetBreakdown('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');

  assert.equal(breakdown.idle, idleRaw);
  assert.equal(breakdown.deployed, deployedRaw);
});

test('getAssetBreakdown: idle + deployed equals expected total', async () => {
  // Simulated on-chain state: 200 USDC idle, 800 USDC deployed → 1 000 USDC total
  const idle = 2_000_000_000n;
  const deployed = 8_000_000_000n;
  const expectedTotal = 10_000_000_000n; // matches get_total_deposits()

  const client = makeClientWithStub([idle, deployed]);
  const breakdown = await client.getAssetBreakdown('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');

  const sum = breakdown.idle + breakdown.deployed;
  assert.equal(sum, expectedTotal, 'idle + deployed should equal total_deposits');
});

test('getAssetBreakdown: throws on unexpected return shape', async () => {
  const client = makeClientWithStub({ unexpected: true });

  await assert.rejects(
    () => client.getAssetBreakdown('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
    /unexpected shape/,
    'Should throw a descriptive error for unrecognised shapes'
  );
});

test('getAssetBreakdown: uses exactly 1 simulate() call (vs 2 for separate calls)', async () => {
  let callCount = 0;

  const { VaultClient } = require('../dist/index.js');
  const client = new VaultClient({
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    rpcUrl: 'https://soroban-testnet.stellar.org',
  });

  const proto = Object.create(Object.getPrototypeOf(client));
  proto.simulate = async function (_method, _args, _key) {
    callCount++;
    return [1_000_000_000n, 9_000_000_000n]; // tuple stub
  };
  Object.setPrototypeOf(client, proto);

  await client.getAssetBreakdown('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');

  assert.equal(callCount, 1, 'getAssetBreakdown should make exactly 1 simulate() call');
});
