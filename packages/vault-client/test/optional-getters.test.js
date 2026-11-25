const assert = require('node:assert/strict');
const test = require('node:test');
const { Account, Address, Keypair, StrKey, nativeToScVal, scValToNative, xdr } = require('@stellar/stellar-sdk');
const { VaultClient } = require('../dist/generated/vault.js');
const { functions } = require('../../../contract-spec.json');

const source = Keypair.random().publicKey();
const pool = StrKey.encodeContract(Buffer.alloc(32, 1));
const poolAddress = new Address(pool).toScVal();
const pendingOwner = new Address(source).toScVal();
const wasmHash = Uint8Array.from({ length: 32 }, (_, index) => index);
const prediction = {
  protocol: 'blend',
  predicted_apy_bps: 615n,
  apy_1h_bps: 610n,
  apy_6h_bps: 620n,
  apy_24h_bps: 630n,
  confidence_bps: 8_500,
  submitted_at_ledger: 190,
};
const ownership = { pending_owner: source, timelock_expiry: 1_700_000_000n };

const fixtures = {
  get_apy_prediction: {
    type: 'Option<ApyPrediction>',
    args: ['blend'],
    value: nativeToScVal(prediction, {
      type: {
        protocol: ['symbol', 'symbol'],
        predicted_apy_bps: ['symbol', 'i128'],
        apy_1h_bps: ['symbol', 'i128'],
        apy_6h_bps: ['symbol', 'i128'],
        apy_24h_bps: ['symbol', 'i128'],
        confidence_bps: ['symbol', 'u32'],
        submitted_at_ledger: ['symbol', 'u32'],
      },
    }),
    expected: prediction,
  },
  get_pending_agent_update: {
    type: 'Option<(Address, u32)>',
    value: xdr.ScVal.scvVec([pendingOwner, xdr.ScVal.scvU32(210)]),
    expected: [source, 210],
  },
  get_pending_owner: {
    type: 'Option<Address>',
    value: pendingOwner,
    expected: source,
  },
  get_pending_ownership: {
    type: 'Option<PendingOwnershipInfo>',
    value: nativeToScVal(
      { ...ownership, pending_owner: pendingOwner },
      { type: { pending_owner: ['symbol', null], timelock_expiry: ['symbol', 'u64'] } },
    ),
    expected: ownership,
  },
  get_pending_upgrade: {
    type: 'Option<(BytesN<32>, u32)>',
    value: xdr.ScVal.scvVec([nativeToScVal(wasmHash), xdr.ScVal.scvU32(220)]),
    expected: [wasmHash, 220],
  },
  get_blend_pool: { type: 'Option<Address>', value: poolAddress, expected: pool },
  get_dex_pool: { type: 'Option<Address>', value: poolAddress, expected: pool },
};

test('fixtures cover the optional getters in the contract spec', () => {
  const optionalGetters = functions
    .filter(({ name, returns }) => name.startsWith('get_') && returns?.startsWith?.('Option<'))
    .map(({ name, returns }) => [name, returns]);

  assert.deepEqual(
    Object.fromEntries(optionalGetters),
    Object.fromEntries(Object.entries(fixtures).map(([name, { type }]) => [name, type])),
  );
});

for (const [name, { args = [], value, expected }] of Object.entries(fixtures)) {
  for (const [state, result, decoded] of [
    ['present', value, expected],
    ['absent', xdr.ScVal.scvVoid(), null],
  ]) {
    test(`${name} round-trips a ${state} value through the generated client`, async () => {
      const client = new VaultClient({ contractId: pool });
      client.server.getAccount = async (publicKey) => new Account(publicKey, '0');
      client.server.simulateTransaction = async (transaction) => {
        assert.equal(transaction.operations.length, 1);
        const { functionName, args: encodedArgs } = transaction.operations[0].func.invokeContract;
        assert.equal(functionName.asStringOrBytes(), name);
        assert.deepEqual(encodedArgs.map(scValToNative), args);
        if (name === 'get_apy_prediction') {
          assert.equal(encodedArgs[0].type, 'scvSymbol');
        }
        return { result: { retval: xdr.ScVal.fromXdr(result.toXdr('base64'), 'base64') } };
      };

      assert.deepEqual(await client[name](...args, source), decoded);
    });
  }
}
