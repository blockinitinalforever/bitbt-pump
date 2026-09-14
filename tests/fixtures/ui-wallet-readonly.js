// Injected only into the isolated local CDP audit tab. Never shipped in public/.
(() => {
  if (location.hostname !== '127.0.0.1') throw Error('UI fixture is local-only');
  const address = '0x1111111111111111111111111111111111111111';
  const audit = window.__uiAudit = { address, expired: false, calls: [], unknown: [], blocked: [], events: {} };
  sessionStorage.setItem('bitbt_pump_session', 'local-ui-fixture-not-a-real-session');
  sessionStorage.setItem('bitbt_pump_session_address', address);
  window.ethereum = {
    isMetaMask: true,
    on(name, callback) { audit.events[name] = callback; },
    removeListener(name) { delete audit.events[name]; },
    async request({ method }) {
      audit.calls.push(method);
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x38';
      if (method === 'eth_getBalance' || method === 'eth_call') return '0x0';
      audit.blocked.push(method);
      throw Error('Read-only UI audit blocks wallet method: ' + method);
    },
  };
  const json = (data, status = 200) => new Response(JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: data }), { status, headers: { 'content-type': 'application/json' } });
  const originalFetch = window.fetch.bind(window);
  const token = { token_name: 'UI 测试币（仅本地）', symbol: 'UITEST', contract_address: '0x2222222222222222222222222222222222222222', creator_address: address, quote_token: 'BNB', status: 'bonding', submitted_at: new Date().toISOString(), progress_percent: 42, current_price_quote: '0.0001', market_cap_quote: '10', volume_quote_24h: '2', trade_count_24h: 3 };
  const market = { marketId: 7, tokenAddress: token.contract_address, tokenName: token.token_name, tokenSymbol: token.symbol, quoteTokenAddress: '0x3333333333333333333333333333333333333333', quoteTokenSymbol: 'tTEST', quoteDecimals: 18, oraclePriceE18: '1000000000000000000', liquidityRaw: '1000000000000000000000', lockedNotionalRaw: '0', longNotionalRaw: '0', shortNotionalRaw: '0', maxPositionNotionalRaw: '100000000000000000000', maxOpenInterestRaw: '500000000000000000000', maxUtilizationPpm: 800000, maxLeverage: 10, maxFundingRatePpmPerDay: 1000, openFeePpm: 500, closeFeePpm: 500, enabled: true, closeOnly: false };
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/pump/')) {
      if (url.origin === location.origin) return originalFetch(input, init);
      audit.blocked.push('external fetch: ' + url.origin);
      throw Error('External network disabled in UI audit');
    }
    const key = url.pathname.replace('/api/pump/', '');
    audit.calls.push(key);
    if ((init.method || 'GET') !== 'GET') {
      audit.blocked.push(key);
      return json('Read-only UI audit: writes and signatures disabled', 403);
    }
    if (key === 'v1/auth/siwe/session') return audit.expired ? json('需要SIWE会话', 401) : json({ address, expires_in: 3600 });
    if (key === 'v1/app/config') return json({ pump: {} });
    if (key === 'wallet-config') return json({ enabled: false });
    if (key === 'v1/token/launch-options') return json({ network: { id: 'bsc', chain_id: 56, chain_id_hex: '0x38', native_symbol: 'BNB', launch_enabled: true, trade_enabled: true }, quotes: [{ symbol: 'BNB', address: '0x0000000000000000000000000000000000000000' }], dex_profiles: [{ id: 'pancakeswap_v2', name: 'PancakeSwap V2', enabled: true, lp_policy: 'burn' }] });
    if (key === 'v1/pump/market-activity') return json({ activity: [], summary: {} });
    if (key === 'v1/pump/wallet-activity') return json({ activity: [], launches: [], creator_rewards: [], holdings: [], holdings_complete: true, trade_history_complete: true, summary: {} });
    if (key === 'v1/pump/perpetual/config') return json({ enabled: true, operationsReady: true, openingsPaused: false, maxLeverage: 10, feePercent: '0.05%' });
    if (window.__uiPopulated) {
      if (key === 'v1/pump/announcements') return json([{id:'ui-notice',title:'本地排版检查公告',title_en:'Local layout notice',content:'仅用于离线排版核对，不是线上公告。',content_en:'Local layout fixture only. Not a production notice.',category:'product',pinned:true,published_at:'2026-09-14T08:00:00Z'}]);
      if (key === 'v1/pump/market') return json([token]);
      if (key === 'v1/pump/detail') return json({ ...token, creator: address, curve_address: '0x4444444444444444444444444444444444444444', total_raised_quote: '1' });
      if (key === 'v1/pump/perpetual/markets') return json([market]);
      if (key === 'v1/pump/perpetual/position') return json({ open: false, liquiditySharesRaw: '0' });
      if (key === 'v1/pump/perpetual/candles') return json([]);
      if (key === 'v1/pump/holders' || key === 'v1/pump/comments') return json([]);
    }
    if (key === 'v1/pump/vaults/config' || key === 'v1/pump/strategies/config') return json({ enabled: false, templates: [] });
    if (key === 'v1/pump/referral' || key === 'v1/pump/kol' || key === 'v1/pump/points') return json(null);
    if (key === 'v1/pump/integrations/status') return json({});
    const emptyLists = ['v1/pump/market', 'v1/pump/tokens', 'v1/pump/trades', 'v1/pump/candles', 'v1/pump/announcements', 'v1/market/favorites', 'v1/pump/alerts', 'v1/pump/campaigns', 'v1/pump/v3-fee-rewards', 'v1/pump/vaults', 'v1/pump/strategies', 'v1/pump/integrations/webhooks', 'v1/pump/vault-store/templates', 'v1/pump/vault-store/registry', 'v1/pump/perpetual/markets', 'v1/pump/perpetual/activity', 'v1/pump/perpetual/service-requests'];
    if (emptyLists.includes(key)) return json([]);
    audit.unknown.push(key);
    return json('UI fixture unavailable: ' + key, 503);
  };
})();
