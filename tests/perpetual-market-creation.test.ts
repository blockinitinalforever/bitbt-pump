import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync('src/client/launchpad-live.js', 'utf8');

type TestMarket = {
  marketId: number;
  tokenAddress: string;
  tokenSymbol?: string;
};

type TestState = {
  account: string;
  selectedChain: string;
  perpConfig: {
    enabled: boolean;
    permissionlessMarketCreation: boolean;
    contractAddress: string;
  };
  perpMarkets: TestMarket[];
  perpServiceBusy: boolean;
  selectedPerpMarketId?: number;
};

const receiptStatus = (receipt: unknown): unknown =>
  typeof receipt === 'object' && receipt !== null
    ? (receipt as { status?: unknown }).status
    : undefined;

const parsePerpMarketId = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

test('pilot dashboard and creation card show the same 4x cap; non-pilot keeps its configured cap', async () => {
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(fs.readFileSync('public/launchpad/bitbt-launch-ui-app.html', 'utf8'));
  const card = document.querySelector('[data-panel="perps-add-contract"]');
  assert.ok(card);
  const leverage = card.querySelectorAll('.contract-shell')[1]?.querySelectorAll('select,input')[2];
  assert.ok(leverage);
  leverage.setAttribute('data-service-setting', '2');
  const start = source.indexOf('  const renderPerpetualCreationLeverage =');
  const end = source.indexOf('  const renderPerpetual =', start);
  assert.ok(start >= 0 && end > start);
  const render = vm.runInNewContext(
    `${source.slice(start, end)}\nrenderPerpetualCreationLeverage`,
    { text: (selector: string, value: string) => { const node = document.querySelector(selector); if (node) node.textContent = value; } },
  ) as (config: { internalPilot: boolean; maxLeverage: number }, card: typeof card) => void;
  render({ internalPilot: true, maxLeverage: 100 }, card);
  assert.equal(document.querySelector('[data-perp-max-leverage]')?.textContent, '4×');
  assert.equal(leverage.querySelector('option')?.textContent, '4×');
  render({ internalPilot: false, maxLeverage: 20 }, card);
  assert.equal(document.querySelector('[data-perp-max-leverage]')?.textContent, '20×');
  assert.equal(leverage.querySelector('option')?.textContent, '20×');
});

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

test('wallet rendering also refreshes the mounted perpetual creation summary', () => {
  const start = source.indexOf('  const renderWalletState =');
  const end = source.indexOf('  const restoreSessionOnce =', start);
  assert.ok(start >= 0 && end > start);
  const renderWalletState = source.slice(start, end);
  assert.match(renderWalletState, /renderPerpetualServices\(\);/);
  assert.match(source, /\[data-service-summary\][\s\S]*state\.account \? short\(state\.account\)/);
  assert.match(source, /config\.contractAddress \|\| uiCopy\('等待配置', 'Awaiting configuration'\)/);
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
  const approval = `0x095ea7b3${wordAddress(contract)}${wordUint(1000n)}`;
  const state: TestState = {
    account,
    selectedChain: 'bsc',
    perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
    perpMarkets: [],
    perpServiceBusy: false,
  };
  const shown: string[] = [];
  const preferences = new Map<string, string>();
  let transactionsSent = 0;
  const context = vm.createContext({
    state,
    parsePerpMarketId,
    walletSessionEpoch: 7,
    selectedProvider: () => provider,
    isBscFeatureChain: () => true,
    connectWallet: async () => account,
    assertProviderState: async () => ({ account, chainId: '0x38' }),
    renderPerpetualServices: () => undefined,
    readLocalPreference: (key: string) => preferences.get(key) || '',
    writeLocalPreference: (key: string, value: string) => value ? preferences.set(key, value) : preferences.delete(key),
    $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
    api: async (path: string) => path.endsWith('/market-created')
      ? { marketId: 9, tokenAddress: token }
      : {
        tokenAddress: token,
        quoteTokenAddress: quote,
        oracleAddress: oracle,
        maxLeverage: 10,
        minLiquidityRaw: '1000',
        transactions: [
          { to: quote, chainId: '0x38', value: '0x0', data: approval, label: 'Approve tBTUSD' },
          { to: contract, chainId: '0x38', value: '0x0', data, label: 'Create and fund' },
        ],
      },
    normalizeChainId: (value: string) => value,
    sendVaultTransaction: async (_tx: unknown, _label: string, _broadcast: unknown, _submitting: unknown, assertContext: () => void) => {
      assertContext();
      transactionsSent += 1;
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
  assert.equal(transactionsSent, 2);
  assert.equal(state.selectedPerpMarketId, 9);
  assert.equal(shown.at(-1), 'perps-create-pool');
  assert.equal(state.perpServiceBusy, false);
});

test('market creation accepts only the exact 1/2/3-step matrix and stops before unsafe follow-up sends', async () => {
  const start = source.indexOf('  const createPermissionlessPerpetualMarket =');
  const end = source.indexOf('  const submitPerpetualService =', start);
  const account = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const quote = '0x4444444444444444444444444444444444444444';
  const oracle = '0x5555555555555555555555555555555555555555';
  const wordAddress = (value: string) => value.slice(2).padStart(64, '0');
  const wordUint = (value: bigint) => value.toString(16).padStart(64, '0');
  const createData = `0x723219d3${wordAddress(token)}${wordAddress(quote)}${wordAddress(oracle)}${wordUint(10n)}${wordUint(1000n)}`;
  const approveData = `0x095ea7b3${wordAddress(contract)}${wordUint(1000n)}`;
  const resetData = `0x095ea7b3${wordAddress(contract)}${wordUint(0n)}`;
  const create = { to: contract, chainId: '0x38', value: '0x0', data: createData, label: 'Create' };
  const approve = { to: quote, chainId: '0x38', value: '0x0', data: approveData, label: 'Approve' };
  const reset = { to: quote, chainId: '0x38', value: '0x0', data: resetData, label: 'Reset' };

  const run = async (transactions: Record<string, string>[], failAt = -1, changeContextAt = -1, confirmedMarketId: unknown = 9) => {
    const provider = {};
    const state: TestState = {
      account,
      selectedChain: 'bsc',
      perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
      perpMarkets: [],
      perpServiceBusy: false,
    };
    let sends = 0;
    const context = vm.createContext({
      state,
      parsePerpMarketId,
      walletSessionEpoch: 1,
      selectedProvider: () => provider,
      isBscFeatureChain: () => true,
      connectWallet: async () => account,
      assertProviderState: async () => ({ account, chainId: '0x38' }),
      renderPerpetualServices: () => undefined,
      readLocalPreference: () => '',
      writeLocalPreference: () => undefined,
      $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
      api: async (path: string) => path.endsWith('/market-created')
        ? { marketId: confirmedMarketId, tokenAddress: token }
        : { tokenAddress: token, quoteTokenAddress: quote, oracleAddress: oracle, maxLeverage: 10, minLiquidityRaw: '1000', transactions },
      normalizeChainId: (value: string) => value,
      sendVaultTransaction: async (_tx: unknown, _label: string, _broadcast: unknown, _submitting: unknown, assertContext: () => void) => {
        assertContext();
        sends += 1;
        if (sends === changeContextAt) context.walletSessionEpoch = 2;
        if (sends === failAt) throw new Error('approval failed');
        assertContext();
        return `0x${'6'.repeat(64)}`;
      },
      loadPerpetual: async () => { state.perpMarkets = [{ marketId: 9, tokenAddress: token }]; },
      show: () => undefined,
      showOperationDialog: () => undefined,
    });
    vm.runInContext(`${source.slice(start, end)}\nglobalThis.run = createPermissionlessPerpetualMarket;`, context);
    return { invoke: () => context.run(), sends: () => sends };
  };

  for (const valid of [[create], [approve, create], [reset, approve, create]]) {
    const harness = await run(valid);
    await harness.invoke();
    assert.equal(harness.sends(), valid.length);
  }

  const invalid = [
    [approve],
    [create, approve],
    [approve, approve, create],
    [{ ...approve, to: contract }, create],
    [{ ...approve, data: resetData }, create],
    [{ ...approve, value: '0x1' }, create],
    [{ ...approve, chainId: '0x1' }, create],
    [approve, { ...create, to: quote }],
    [approve, { ...create, data: `${createData.slice(0, -1)}0` }],
    [approve, { ...create, value: '0x1' }],
    [approve, { ...create, chainId: '0x1' }],
  ];
  for (const sequence of invalid) {
    const harness = await run(sequence);
    await assert.rejects(harness.invoke());
    assert.equal(harness.sends(), 0);
  }

  const failedApproval = await run([approve, create], 1);
  await assert.rejects(failedApproval.invoke(), /approval failed/);
  assert.equal(failedApproval.sends(), 1);
  const changedWallet = await run([approve, create], -1, 1);
  await assert.rejects(changedWallet.invoke(), /钱包、网络或永续合约配置已变化/);
  assert.equal(changedWallet.sends(), 1);
  const blankConfirmation = await run([create], -1, -1, '');
  await assert.rejects(blankConfirmation.invoke(), /市场创建确认结果/);
  assert.equal(blankConfirmation.sends(), 1);
});

test('confirmed market creation recovers bookkeeping without preparing or rebroadcasting', async () => {
  const start = source.indexOf('  const createPermissionlessPerpetualMarket =');
  const end = source.indexOf('  const submitPerpetualService =', start);
  const account = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const txHash = `0x${'6'.repeat(64)}`;
  const input = `0x723219d3${token.slice(2).padStart(64, '0')}${'0'.repeat(256)}`;
  const provider = {
    request: async ({ method }: { method: string }) => method === 'eth_getTransactionReceipt'
      ? { status: '0x1', transactionHash: txHash, from: account, to: contract }
      : { hash: txHash, from: account, to: contract, value: '0x0', chainId: '0x38', input },
  };
  const state: TestState = {
    account,
    selectedChain: 'bsc',
    perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
    perpMarkets: [],
    perpServiceBusy: false,
  };
  const key = `bitbt_perp_market_creation:bsc:${contract}:${account}:${token}`;
  const preferences = new Map([[key, txHash]]);
  const apiCalls: string[] = [];
  let sends = 0;
  const context = vm.createContext({
    state,
    parsePerpMarketId,
    walletSessionEpoch: 3,
    selectedProvider: () => provider,
    isBscFeatureChain: () => true,
    connectWallet: async () => account,
    assertProviderState: async () => ({ account, chainId: '0x38' }),
    receiptHasStatus: (receipt: unknown) => receiptStatus(receipt) != null,
    receiptSucceeded: (receipt: unknown) => receiptStatus(receipt) === '0x1',
    normalizeChainId: (value: string) => value,
    renderPerpetualServices: () => undefined,
    readLocalPreference: (storageKey: string) => preferences.get(storageKey) || '',
    writeLocalPreference: (storageKey: string, value: string) => value ? preferences.set(storageKey, value) : preferences.delete(storageKey),
    $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
    api: async (path: string) => {
      apiCalls.push(path);
      if (path.endsWith('/prepare-market')) throw new Error('must not prepare again');
      return { marketId: 9, tokenAddress: token };
    },
    sendVaultTransaction: async () => { sends += 1; return txHash; },
    loadPerpetual: async () => { state.perpMarkets = [{ marketId: 9, tokenAddress: token }]; },
    show: () => undefined,
    showOperationDialog: () => undefined,
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.run = createPermissionlessPerpetualMarket;`, context);
  await context.run();
  assert.equal(sends, 0);
  assert.deepEqual(apiCalls, ['v1/pump/perpetual/market-created']);
  assert.equal(preferences.has(key), false);
  assert.equal(state.selectedPerpMarketId, 9);
});

test('market creation recovery rejects unrelated contract calldata before reconciliation', async () => {
  const start = source.indexOf('  const createPermissionlessPerpetualMarket =');
  const end = source.indexOf('  const submitPerpetualService =', start);
  const account = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const txHash = `0x${'6'.repeat(64)}`;
  const provider = {
    request: async ({ method }: { method: string }) => method === 'eth_getTransactionReceipt'
      ? { status: '0x1', transactionHash: txHash, from: account, to: contract }
      : { hash: txHash, from: account, to: contract, value: '0x0', chainId: '0x38', input: '0x12345678' },
  };
  const state: TestState = {
    account,
    selectedChain: 'bsc',
    perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
    perpMarkets: [],
    perpServiceBusy: false,
  };
  const key = `bitbt_perp_market_creation:bsc:${contract}:${account}:${token}`;
  const preferences = new Map([[key, txHash]]);
  let apiCalls = 0;
  const context = vm.createContext({
    state,
    parsePerpMarketId,
    walletSessionEpoch: 3,
    selectedProvider: () => provider,
    isBscFeatureChain: () => true,
    assertProviderState: async () => ({ account, chainId: '0x38' }),
    receiptHasStatus: (receipt: unknown) => receiptStatus(receipt) != null,
    receiptSucceeded: (receipt: unknown) => receiptStatus(receipt) === '0x1',
    normalizeChainId: (value: string) => value,
    renderPerpetualServices: () => undefined,
    readLocalPreference: (storageKey: string) => preferences.get(storageKey) || '',
    writeLocalPreference: (storageKey: string, value: string) => value ? preferences.set(storageKey, value) : preferences.delete(storageKey),
    $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
    api: async () => { apiCalls += 1; return {}; },
    loadPerpetual: async () => undefined,
    show: () => undefined,
    showOperationDialog: () => undefined,
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.run = createPermissionlessPerpetualMarket;`, context);
  await assert.rejects(() => context.run(), /当前钱包、代币或合约不匹配/);
  assert.equal(apiCalls, 0);
  assert.equal(preferences.has(key), false);
});

test('an existing market goes straight to pool funding without another wallet transaction', async () => {
  const start = source.indexOf('  const createPermissionlessPerpetualMarket =');
  const end = source.indexOf('  const submitPerpetualService =', start);
  const account = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const provider = {};
  const state: TestState = {
    account,
    selectedChain: 'bsc',
    perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
    perpMarkets: [],
    perpServiceBusy: false,
  };
  const shown: string[] = [];
  let sends = 0;
  let confirmations = 0;
  const context = vm.createContext({
    state,
    parsePerpMarketId,
    walletSessionEpoch: 4,
    selectedProvider: () => provider,
    isBscFeatureChain: () => true,
    assertProviderState: async () => ({ account, chainId: '0x38' }),
    renderPerpetualServices: () => undefined,
    readLocalPreference: () => '',
    writeLocalPreference: () => undefined,
    $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
    api: async (path: string) => {
      if (path.endsWith('/market-created')) confirmations += 1;
      return { tokenAddress: token, existingMarketId: 0, transactions: [] };
    },
    sendVaultTransaction: async () => { sends += 1; return `0x${'6'.repeat(64)}`; },
    loadPerpetual: async () => { state.perpMarkets = [{ marketId: 0, tokenAddress: token }]; },
    show: (panel: string) => shown.push(panel),
    showOperationDialog: () => undefined,
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.run = createPermissionlessPerpetualMarket;`, context);
  await context.run();
  assert.equal(sends, 0);
  assert.equal(confirmations, 0);
  assert.equal(state.selectedPerpMarketId, 0);
  assert.equal(shown.at(-1), 'perps-create-pool');
});

test('blank existing market ID is rejected and never becomes market zero', async () => {
  const start = source.indexOf('  const createPermissionlessPerpetualMarket =');
  const end = source.indexOf('  const submitPerpetualService =', start);
  const account = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const provider = {};
  const state: TestState = {
    account,
    selectedChain: 'bsc',
    perpConfig: { enabled: true, permissionlessMarketCreation: true, contractAddress: contract },
    perpMarkets: [{ marketId: 0, tokenAddress: token }],
    perpServiceBusy: false,
  };
  let sends = 0;
  const context = vm.createContext({
    state,
    parsePerpMarketId,
    walletSessionEpoch: 4,
    selectedProvider: () => provider,
    isBscFeatureChain: () => true,
    assertProviderState: async () => ({ account, chainId: '0x38' }),
    renderPerpetualServices: () => undefined,
    readLocalPreference: () => '',
    writeLocalPreference: () => undefined,
    $: (selector: string) => selector === '#perps-contract-address' ? { value: token } : null,
    api: async () => ({ tokenAddress: token, existingMarketId: ' ', transactions: [] }),
    sendVaultTransaction: async () => { sends += 1; return `0x${'6'.repeat(64)}`; },
    loadPerpetual: async () => undefined,
    show: () => undefined,
    showOperationDialog: () => undefined,
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.run = createPermissionlessPerpetualMarket;`, context);
  await assert.rejects(() => context.run(), /已有市场编号无效/);
  assert.equal(sends, 0);
  assert.equal(state.selectedPerpMarketId, undefined);
});

test('perpetual market creation refuses to sign after wallet context changes', async () => {
  assert.match(source, /钱包、网络或永续合约配置已变化，请重新核对后创建/);
  assert.match(source, /bitbt_perp_market_creation:bsc:/);
  assert.match(source, /本次不会重新签名/);
  assert.match(source, /await continueToPool\(confirmedMarketId, txHash\)/);
  assert.match(source, /show\("perps-create-pool"\)/);
});
