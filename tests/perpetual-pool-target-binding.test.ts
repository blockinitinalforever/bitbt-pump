import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');
const addressGuard = source.slice(source.indexOf('  const isNonZeroPerpTokenAddress ='), source.indexOf('  const selectedPerpMarket ='));
const code = source.slice(source.indexOf('  const submitPerpetualService ='), source.indexOf('  const toggleFavorite ='));
const wallet = `0x${'11'.repeat(20)}`;
const feeRecipient = `0x${'22'.repeat(20)}`;
const oldToken = `0x${'33'.repeat(20)}`;
const newToken = `0x${'44'.repeat(20)}`;

function fixture(targetToken = newToken, targetMarketId: number | null = 1, domMarketId = '0') {
  const serviceBodies: any[] = [];
  let walletSends = 0;
  let completedRequest: any = null;
  const state: any = {
    account: wallet,
    selectedPerpMarketId: 0,
    perpPoolTarget: targetMarketId == null ? null : { marketId: targetMarketId, tokenAddress: targetToken },
    perpServiceBusy: false,
    perpConfig: { serviceFeeRecipient: feeRecipient },
    perpServiceRequests: [],
    perpMarkets: [
      { marketId: 0, tokenAddress: oldToken, quoteDecimals: 18 },
      { marketId: 1, tokenAddress: newToken, quoteDecimals: 18 },
    ],
  };
  const controls: Record<string, { value: string }> = {
    '#perps-pool-market': { value: domMarketId },
    '#perps-pool-amount': { value: '10000' },
  };
  const context: any = {
    state,
    connectWallet: async () => undefined,
    isBscFeatureChain: () => true,
    $: (selector: string) => controls[selector] || null,
    parseUnits: (value: string, decimals: number) => BigInt(value) * 10n ** BigInt(decimals),
    renderPerpetualServices: () => undefined,
    sendVaultTransaction: async () => { walletSends += 1; return `0x${'aa'.repeat(32)}`; },
    completePaidPoolRequest: async (request: any) => { completedRequest = request; },
    api: async (url: string, options: any) => {
      const body = JSON.parse(options.body);
      if (url.endsWith('/service-requests')) {
        serviceBodies.push(body);
        return {
          requestId: 'request-1', feeAmountWei: '1',
          transaction: { to: feeRecipient, data: '0x', value: '0x1' },
        };
      }
      assert.ok(url.endsWith('/service-requests/confirm'));
      return { requestId: 'request-1', status: 'paid', walletAddress: wallet, payload: serviceBodies[0].payload };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${addressGuard}${code}\nglobalThis.run = submitPerpetualService;`, context);
  return { context, state, serviceBodies, walletSends: () => walletSends, completed: () => completedRequest };
}

test('VM: create_pool payload uses the bound new token and market despite stale market zero state and DOM', async () => {
  const f = fixture();
  await f.context.run('create_pool');
  assert.equal(f.serviceBodies.length, 1);
  assert.deepEqual(f.serviceBodies[0].payload, {
    tokenAddress: newToken,
    marketId: 1,
    amount: '10000',
    amountRaw: '10000000000000000000000',
  });
  assert.equal(f.walletSends(), 1);
  assert.equal(f.completed().payload.marketId, 1);
  assert.equal(f.completed().payload.tokenAddress, newToken);
});

test('VM: mismatched bound token fails before service preparation or wallet send', async () => {
  const f = fixture(`0x${'55'.repeat(20)}`);
  await assert.rejects(f.context.run('create_pool'), /代币与永续市场不一致/);
  assert.equal(f.serviceBodies.length, 0);
  assert.equal(f.walletSends(), 0);
  assert.equal(f.completed(), null);
});

test('VM: zero bound token fails before service preparation or wallet send', async () => {
  const f = fixture(`0x${'00'.repeat(20)}`);
  await assert.rejects(f.context.run('create_pool'), /代币与永续市场不一致/);
  assert.equal(f.serviceBodies.length, 0);
  assert.equal(f.walletSends(), 0);
});

test('VM: zero resolved market token fails before service preparation or wallet send', async () => {
  const f = fixture();
  f.state.perpMarkets[1].tokenAddress = `0x${'00'.repeat(20)}`;
  await assert.rejects(f.context.run('create_pool'), /代币与永续市场不一致/);
  assert.equal(f.serviceBodies.length, 0);
  assert.equal(f.walletSends(), 0);
});

test('VM: blank unbound market fails closed without defaulting to market zero', async () => {
  const f = fixture(newToken, null, '');
  await assert.rejects(f.context.run('create_pool'), /请选择有效的永续市场/);
  assert.equal(f.serviceBodies.length, 0);
  assert.equal(f.walletSends(), 0);
});
