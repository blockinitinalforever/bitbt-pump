import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');

test('all BNB/BSC and Robinhood network selectors use their real logos', async () => {
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const controls = [
    ...document.querySelectorAll('[data-global-chain-option]'),
    ...document.querySelectorAll('[data-launch-chain]'),
    ...document.querySelectorAll('[data-contract-chain]'),
  ];
  assert.ok(controls.length >= 6);
  for (const control of controls) {
    const key = control.getAttribute('data-global-chain-option')
      || control.getAttribute('data-launch-chain')
      || control.getAttribute('data-contract-chain');
    const image = control.querySelector('img');
    assert.ok(image, `${key} selector must contain a logo image`);
    const expected = key === 'robinhood' ? 'robinhood-chain-brand.png' : 'bnb-chain-brand.png';
    assert.match(image!.getAttribute('src') || '', new RegExp(expected.replace('.', '\\.')));
  }
  assert.match(document.querySelector('[data-launch-quote="BNB"] img')?.getAttribute('src') || '', /tokens\/bnb\.png$/);
  assert.ok(document.querySelector('[data-panel="perps-create-pool"] .network-field [data-active-network-logo]'));
  assert.match(source, /\$\$\('\[data-global-chain-logo\], \[data-active-network-logo\]'\)/);
});

test('wallet-created perpetual market pins context and continues directly to pool funding', async () => {
  const start = source.indexOf('  const createPermissionlessPerpetualMarket =');
  const end = source.indexOf('  const submitPerpetualService =', start);
  assert.ok(start >= 0 && end > start);
  const account = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const quote = '0x4444444444444444444444444444444444444444';
  const oracle = '0x5555555555555555555555555555555555555555';
  const provider = {};
  const wordAddress = (value: string) => value.slice(2).padStart(64, '0');
  const wordUint = (value: bigint) => value.toString(16).padStart(64, '0');
  const data = `0x723219d3${wordAddress(token)}${wordAddress(quote)}${wordAddress(oracle)}${wordUint(10n)}${wordUint(1000n)}`;
  const state: any = {
    account,
    selectedChain: 'bsc',
    perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
    perpMarkets: [],
    perpServiceBusy: false,
  };
  const shown: string[] = [];
  let transactionSent = false;
  const context = vm.createContext({
    state,
    walletSessionEpoch: 7,
    selectedProvider: () => provider,
    isBscFeatureChain: () => true,
    connectWallet: async () => account,
    assertProviderState: async () => ({ account, chainId: '0x38' }),
    renderPerpetualServices: () => undefined,
    $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
    api: async (path: string) => path.endsWith('/market-created')
      ? { marketId: 9, tokenAddress: token }
      : {
        tokenAddress: token,
        quoteTokenAddress: quote,
        oracleAddress: oracle,
        maxLeverage: 10,
        minLiquidityRaw: '1000',
        transaction: { to: contract, chainId: '0x38', value: '0x0', data },
      },
    normalizeChainId: (value: string) => value,
    sendVaultTransaction: async (_tx: unknown, _label: string, _broadcast: unknown, _submitting: unknown, assertContext: () => void) => {
      assertContext();
      transactionSent = true;
      return `0x${'6'.repeat(64)}`;
    },
    loadPerpetual: async () => {
      state.perpMarkets = [{ marketId: 9, tokenAddress: token, tokenSymbol: 'TEST' }];
    },
    show: (panel: string) => shown.push(panel),
    showOperationDialog: () => undefined,
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.run = createPermissionlessPerpetualMarket;`, context);
  await context.run();
  assert.equal(transactionSent, true);
  assert.equal(state.selectedPerpMarketId, 9);
  assert.equal(shown.at(-1), 'perps-create-pool');
  assert.equal(state.perpServiceBusy, false);
});

test('perpetual market creation refuses to sign after wallet context changes', async () => {
  assert.match(source, /钱包、网络或永续合约配置已变化，请重新核对后创建/);
  assert.match(source, /sendVaultTransaction\(transaction, "永续市场创建", undefined, undefined, assertCurrent\)/);
  assert.match(source, /state\.selectedPerpMarketId = Number\(created\.marketId\)/);
  assert.match(source, /show\("perps-create-pool"\)/);
});
