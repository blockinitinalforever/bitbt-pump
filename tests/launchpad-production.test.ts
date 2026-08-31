import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

const root = path.resolve(process.cwd());
const html = fs.readFileSync(path.join(root, "public/launchpad/bitbt-launch-ui-app.html"), "utf8");
const shell = fs.readFileSync(path.join(root, "public/launchpad/bitbt-wallet-ui.html"), "utf8");
const walletShell = fs.readFileSync(path.join(root, "public/launchpad/bitbt-wallet-ui.html"), "utf8");
const bridge = fs.readFileSync(path.join(root, "public/launchpad/launchpad-live.js"), "utf8");
const walletConnectBridge = fs.readFileSync(path.join(root, "src/client/walletconnect-provider.ts"), "utf8");
const walletConfigRoute = fs.readFileSync(path.join(root, "src/app/api/pump/wallet-config/route.ts"), "utf8");
const logoUpload = fs.readFileSync(path.join(root, "public/launchpad/launch-logo-upload.js"), "utf8");
const proxy = fs.readFileSync(path.join(root, "src/app/api/pump/[...path]/route.ts"), "utf8");
const edgeProxy = fs.readFileSync(path.join(root, "src/proxy.ts"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
const deployScript = fs.readFileSync(path.join(root, "deploy/deploy-server.sh"), "utf8");
const launchFormSource = fs.readFileSync(path.join(root, "src/components/PumpLaunchForm.tsx"), "utf8");
const pumpApiSource = fs.readFileSync(path.join(root, "src/lib/pump-api.ts"), "utf8");

type BootOptions = { account?: string; chainId?: string | number; receiptStatus?: unknown; receiptPromise?: Promise<unknown>; sendRejects?: number; sendErrorCode?: number; estimateRejects?: number; nullHash?: boolean; nativeBalance?: bigint; tokenBalance?: bigint; estimatedGas?: bigint; pathname?: string; parentPathname?: string; session?: { token: string; address: string; expiresIn?: number }; pendingConfirmation?: Record<string, unknown>; providerTarget?: "ethereum" | "okxwallet" | "parent-okxwallet" | "binance" | "tokenpocket" | "eip6963" | "none"; walletConnect?: boolean; maliciousAnnouncement?: boolean };

const boot = async (fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>, options: BootOptions = {}) => {
  const { window } = parseHTML(html);
  const storage = new Map<string, string>();
  if (options.session) {
    storage.set("bitbt_pump_session", options.session.token);
    storage.set("bitbt_pump_session_address", options.session.address.toLowerCase());
  }
  if (options.pendingConfirmation) storage.set("bitbt_pump_pending_launch_confirmation", JSON.stringify(options.pendingConfirmation));
  const providerCalls: string[] = [];
  const untrustedProviderCalls: string[] = [];
  const providerTransactions: Array<Record<string, unknown>> = [];
  const providerEvents: Record<string, (value: unknown) => void> = {};
  const chartData: unknown[][] = [];
  const historyPaths: string[] = [];
  const clipboardWrites: string[] = [];
  const location = { origin: "https://bitbt.fun", pathname: options.pathname || "/pump", search: "", assign: (path: string) => { location.pathname = path.split("?", 1)[0]; historyPaths.push(path); } };
  const history = { pushState: (_state: unknown, _title: string, path: string) => { location.pathname = path.split("?", 1)[0]; historyPaths.push(path); }, replaceState: (_state: unknown, _title: string, path: string) => { location.pathname = path.split("?", 1)[0]; historyPaths.push(path); } };
  const navigator = { clipboard: { writeText: async (value: string) => { clipboardWrites.push(value); } } };
  const account = options.account || "";
  let currentChainId = options.chainId ?? "0x38";
  let sendRejectsRemaining = options.sendRejects ?? 0;
  let estimateRejectsRemaining = options.estimateRejects ?? 0;
  const ethereum = { request: async ({ method, params }: { method: string; params?: Array<Record<string, unknown>> }) => { providerCalls.push(method); if (method === "eth_accounts" || method === "eth_requestAccounts") return account ? [account] : []; if (method === "eth_chainId") return currentChainId; if (method === "wallet_switchEthereumChain") { currentChainId = String(params?.[0]?.chainId || currentChainId); return null; } if (method === "personal_sign") return "0xsigned"; if (method === "eth_getBalance") return `0x${(options.nativeBalance ?? 10n ** 19n).toString(16)}`; if (method === "eth_call") return `0x${(options.tokenBalance ?? 0n).toString(16)}`; if (method === "eth_getBlockByNumber") return { baseFeePerGas: "0x3b9aca00" }; if (method === "eth_estimateGas") { if (estimateRejectsRemaining > 0) { estimateRejectsRemaining -= 1; throw new Error("execution reverted: Address must end with 8888"); } return `0x${(options.estimatedGas ?? 2_000_000n).toString(16)}`; } if (method === "eth_sendTransaction") { if (sendRejectsRemaining > 0) { sendRejectsRemaining -= 1; const error = new Error("Provider rejected the request") as Error & { code?: number }; error.code = options.sendErrorCode; throw error; } if (options.nullHash) return null; if (params?.[0]) providerTransactions.push(params[0]); return `0x${"ab".repeat(32)}`; } if (method === "eth_getTransactionReceipt") return options.receiptPromise ? await options.receiptPromise : { status: options.receiptStatus ?? "0x1" }; throw new Error(`unexpected provider call: ${method}`); }, on: (event: string, callback: (value: unknown) => void) => { providerEvents[event] = callback; } };
  const untrustedProvider = { request: async ({ method }: { method: string }) => { untrustedProviderCalls.push(method); if (method === "eth_accounts" || method === "eth_requestAccounts") return ["0x9999999999999999999999999999999999999999"]; if (method === "eth_chainId") return "0x38"; if (method === "wallet_switchEthereumChain") return null; if (method === "personal_sign") return "0xattacker"; throw new Error(`unexpected untrusted provider call: ${method}`); }, on: () => undefined };
  Object.defineProperty(window, "location", { configurable: true, value: location });
  Object.defineProperty(window, "history", { configurable: true, value: history });
  if (options.parentPathname) {
    const parentLocation = { ...location, pathname: options.parentPathname };
    const parentHistory = { pushState: (_state: unknown, _title: string, path: string) => { parentLocation.pathname = path.split("?", 1)[0]; historyPaths.push(path); }, replaceState: (_state: unknown, _title: string, path: string) => { parentLocation.pathname = path.split("?", 1)[0]; historyPaths.push(path); } };
    const parentListeners: Record<string, Array<(event: unknown) => void>> = {};
    const parentWindow = { location: parentLocation, history: parentHistory, parent: null as unknown, Event: window.Event, CustomEvent: window.CustomEvent, addEventListener: (name: string, listener: (event: unknown) => void) => { (parentListeners[name] ||= []).push(listener); }, dispatchEvent: (event: Event) => { for (const listener of parentListeners[event.type] || []) listener(event); return true; } };
    parentWindow.parent = parentWindow;
    Object.defineProperty(window, "parent", { configurable: true, value: parentWindow });
    Object.defineProperty(window, "frameElement", { configurable: true, value: {} });
  } else {
    Object.defineProperty(window, "parent", { configurable: true, value: window });
  }
  for (const key of ["ethereum", "okxwallet", "BinanceChain", "binancew3w", "tokenpocket"] as const) Object.defineProperty(window, key, { configurable: true, writable: true, value: undefined });
  const providerTarget = options.providerTarget || "ethereum";
  const providerGlobals = providerTarget === "okxwallet" ? { okxwallet: ethereum }
    : providerTarget === "binance" ? { BinanceChain: ethereum }
      : providerTarget === "tokenpocket" ? { tokenpocket: { ethereum } }
        : providerTarget === "eip6963" || providerTarget === "parent-okxwallet" || providerTarget === "none" ? {}
          : { ethereum };
  if (providerTarget === "parent-okxwallet") (window.parent as Window & { okxwallet?: unknown }).okxwallet = ethereum;
  if (providerTarget === "eip6963") window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new window.CustomEvent("eip6963:announceProvider", { detail: { info: { name: "EIP Wallet", rdns: "wallet.example" }, provider: ethereum } })));
  if (options.walletConnect) Object.defineProperty(window, "BitBTWalletConnect", { configurable: true, value: { getProvider: async () => Object.assign(ethereum, { isWalletConnect: true, connected: false, connect: async () => undefined }) } });
  if (options.maliciousAnnouncement) window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new window.CustomEvent("eip6963:announceProvider", { detail: { info: { name: "OKX Wallet", rdns: "com.okex.wallet" }, provider: untrustedProvider } })));
  const context = { window, document: window.document, fetch: fetchImpl, ...providerGlobals, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, CSS: { escape: (value: string) => value }, history, location, navigator, TextEncoder, console, setTimeout, clearTimeout, setInterval: () => 0 } as Record<string, unknown>;
  const windowContext = { ...context };
  delete windowContext.history;
  delete windowContext.location;
  delete windowContext.navigator;
  Object.assign(window, windowContext, { LightweightCharts: { createChart: () => ({ addCandlestickSeries: () => ({ setData: (data: unknown[]) => chartData.push(data), }), addHistogramSeries: () => ({ setData: (data: unknown[]) => chartData.push(data), priceScale: () => ({ applyOptions: () => undefined }) }), applyOptions: () => undefined, remove: () => undefined, timeScale: () => ({ fitContent: () => undefined }) }) } });
  vm.runInNewContext(bridge, context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { window, providerCalls, untrustedProviderCalls, providerEvents, chartData, providerTransactions, historyPaths, clipboardWrites, storage };
};

test("production HTML boots with API failure without exposing prototype financial data", async () => {
  const { window } = await boot(async () => { throw new Error("API unavailable"); });
  const body = window.document.body.textContent || "";
  for (const sample of ["842.63", "1,284", "18.6M", "64,812,904", "AGENT404", "2.84M LIVE TOKEN", "12,842", "$0.000721", "0.005 BNB"]) assert.equal(body.includes(sample), false, `sample financial data leaked after API failure: ${sample}`);
  assert.match(body, /实时 Pump 数据暂不可用/);
});

test("global Pump API failures show actionable prompts instead of raw transport errors", async () => {
  const scenarios = [
    { response: async () => { throw new Error("Failed to fetch"); }, expected: "网络连接中断，请检查网络后重试" },
    { response: async () => ({ ok: false, status: 429, text: async () => "<html>Too Many Requests</html>" }), expected: "操作过于频繁，请稍后重试" },
    { response: async () => ({ ok: false, status: 502, text: async () => "<html>Bad Gateway</html>" }), expected: "服务暂时不可用，请稍后重试" },
  ];
  for (const scenario of scenarios) {
    const { window } = await boot(scenario.response);
    assert.equal(window.document.querySelector(".toast")?.textContent, scenario.expected);
  }
});

test("discovery, full-market on-chain stream, rankings, and holders use real APIs with local filters", async () => {
  const tokenA = "0x1111111111111111111111111111111111111111";
  const tokenB = "0x2222222222222222222222222222222222222222";
  const now = Math.floor(Date.now() / 1000);
  const tokens = [
    { token_name: "Alpha", symbol: "ALPHA", contract_address: tokenA, creator_address: "0x3333333333333333333333333333333333333333", quote_token: "BNB", classification: "Meme", tax_enabled: true, buy_tax_percent: 5, sell_tax_percent: 6, status: "bonding", submitted_at: new Date(Date.now() - 60_000).toISOString(), progress_percent: 80, current_price_quote: "0.01", current_price_usd: "6", market_cap_quote: "1", market_cap_usd: "600", total_raised_quote: "8", trade_count_5m: 1, trade_count_24h: 8, volume_quote_5m: "1", volume_usd_5m: "600", volume_quote_24h: "10", volume_usd_24h: "6000", buy_volume_usd_24h: "4200", sell_volume_usd_24h: "1800", net_flow_usd_24h: "2400", buy_ratio_24h_percent: "70", price_change_5m_percent: 1, price_change_24h_percent: 20 },
    { token_name: "Beta", symbol: "BETA", contract_address: tokenB, creator_address: "0x4444444444444444444444444444444444444444", quote_token: "USDT", classification: "AI", tax_enabled: false, status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 10, current_price_quote: "0.02", current_price_usd: "0.02", market_cap_quote: "200", market_cap_usd: "200", total_raised_quote: "2", trade_count_5m: 3, trade_count_24h: 4, volume_quote_5m: "2", volume_usd_5m: "2", volume_quote_24h: "5", volume_usd_24h: "5", buy_volume_usd_24h: "1", sell_volume_usd_24h: "4", net_flow_usd_24h: "-3", buy_ratio_24h_percent: "20", price_change_5m_percent: 9, price_change_24h_percent: 2 },
  ];
  const activity = [
    { activity_type: "buy", tx_hash: `0x${"11".repeat(32)}`, trader: "0x5555555555555555555555555555555555555555", token_address: tokenA, token_name: "Alpha", symbol: "ALPHA", quote_token: "BNB", quote_amount: "0.1", token_amount: "100", status: "success", timestamp: now },
    { activity_type: "sell", tx_hash: `0x${"22".repeat(32)}`, trader: "0x6666666666666666666666666666666666666666", token_address: tokenB, token_name: "Beta", symbol: "BETA", quote_token: "USDT", quote_amount: "20", token_amount: "1000", status: "success", timestamp: now - 1 },
    { activity_type: "create", tx_hash: `0x${"33".repeat(32)}`, trader: tokens[1].creator_address, token_address: tokenB, token_name: "Beta", symbol: "BETA", quote_token: "USDT", status: "deployed", timestamp: now - 2 },
  ];
  let marketRequests = 0;
  let holderRequests = 0;
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/market-activity")) { marketRequests += 1; return { ok: true, json: async () => ({ data: { activity, summary: { total_tokens: 2, launches_24h: 1, trades_24h: 2 } } }) }; }
    if (url.includes("v1/pump/holders")) { holderRequests += 1; return { ok: true, json: async () => ({ data: { holders_count: 7, top_holders: [{ address: tokens[0].creator_address, percentage: 12.5 }] } }) }; }
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: tokens }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { ...tokens[0], creator: tokens[0].creator_address, curve_address: "0x7777777777777777777777777777777777777777", tax_enabled: true, buy_tax_percent: 5, sell_tax_percent: 6 } }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window } = await boot(response);
  assert.equal(window.document.querySelector("[data-market-total]")?.textContent, "2");
  assert.equal(window.document.querySelector("[data-market-launches]")?.textContent, "1");
  assert.equal(window.document.querySelector("[data-market-trades]")?.textContent, "2");
  assert.equal(window.document.querySelectorAll('[data-panel="live"] .live-row').length, 3);
  assert.equal(window.document.querySelectorAll('[data-panel="rank"] .rank-row').length, 2);
  const alphaCard = window.document.querySelector(`[data-panel="discover"] [data-live-token="${tokenA}"]`);
  assert.match(alphaCard?.textContent || "", /\$600\.00/);
  assert.match(alphaCard?.textContent || "", /\$6\.00K/);
  assert.match(alphaCard?.textContent || "", /税 买5% \/ 卖6%/);
  assert.match(alphaCard?.textContent || "", /买入 70%/);
  assert.match(alphaCard?.textContent || "", /净流入 \$2\.40K/);
  window.document.querySelector('[data-live-filter="buy"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(window.document.querySelectorAll('[data-panel="live"] .live-row').length, 1);
  window.document.querySelector('[data-live-filter="create"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(window.document.querySelectorAll('[data-panel="live"] .live-row').length, 1);
  const quoteFilter = window.document.querySelector('[data-market-quote-filter]') as HTMLSelectElement;
  quoteFilter.querySelector('option[value="all"]')?.removeAttribute("selected");
  quoteFilter.querySelector('option[value="usdt"]')?.setAttribute("selected", "selected");
  quoteFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(window.document.querySelectorAll('[data-panel="discover"] .token-card').length, 1);
  assert.match(window.document.querySelector('[data-panel="discover"] .token-card')?.textContent || "", /BETA/);
  quoteFilter.querySelector('option[value="usdt"]')?.removeAttribute("selected");
  quoteFilter.querySelector('option[value="all"]')?.setAttribute("selected", "selected");
  quoteFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector('[data-rank-filter="volume"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  window.document.querySelector('[data-rank-window="5m"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.match(window.document.querySelector('[data-panel="rank"] .rank-row')?.textContent || "", /ALPHA/);
  assert.match(window.document.querySelector('[data-panel="rank"] .rank-row')?.textContent || "", /5M 1 笔/);
  window.document.querySelector('[data-rank-filter="net-flow"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.match(window.document.querySelector('[data-panel="rank"] .rank-row')?.textContent || "", /ALPHA/);
  assert.match(window.document.querySelector('[data-panel="rank"] .rank-row')?.textContent || "", /买入 70%/);
  assert.equal(marketRequests, 1, "live/rank local filters made an extra API request");
  window.document.querySelector('[data-live-token="' + tokenA + '"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(window.document.querySelector("[data-token-tax-detail]")?.textContent, "买 5% / 卖 6%");
  assert.equal(window.document.querySelector("[data-active-market]")?.textContent, "$600.00");
  assert.equal(window.document.querySelector("[data-active-volume]")?.textContent, "$6.00K");
  assert.equal(window.document.querySelector("[data-active-net-flow]")?.textContent, "$2.40K");
  assert.equal(window.document.querySelector("[data-active-buy-ratio]")?.textContent, "70.0%");
  window.document.querySelector('[data-detail-tab="holders"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(holderRequests, 1);
  assert.match(window.document.querySelector('[data-detail-panel="holders"]')?.textContent || "", /7 位持有人/);
  assert.match(window.document.querySelector('[data-detail-panel="holders"]')?.textContent || "", /12\.50%/);
});

test("holder provider indexing delay is rendered as an honest non-fatal state", () => {
  assert.match(bridge, /payload\?\.available === false/);
  assert.match(bridge, /等待链上索引/);
  assert.match(bridge, /不会展示推测数据/);
});

test("wrong quote-token contract is rejected before any provider send", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const curve = "0x2222222222222222222222222222222222222222";
  const expectedQuote = "0x3333333333333333333333333333333333333333";
  const wrongQuote = "0x4444444444444444444444444444444444444444";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [{ token_name: "Real", symbol: "REAL", contract_address: token, quote_token: "USDT", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1, current_price_quote: "1", total_raised_quote: "1" }] }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { symbol: "REAL", quote_token: "USDT", quote_token_address: expectedQuote, curve_address: curve, progress_percent: 1, current_price_quote: "1", total_raised_quote: "1" } }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("buy-quote")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, quote_token: "USDT", quote_token_address: wrongQuote, chain_id: "0x38", quote_id: "q1", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "100", min_out: "98", slippage_bps: 200 } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerCalls } = await boot(response);
  const input = window.document.querySelector("#trade-amount") as HTMLInputElement;
  input.value = "1";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal((window.document.querySelector("[data-quote-output]")?.textContent || "").trim(), "—");
  assert.equal(providerCalls.includes("eth_sendTransaction"), false);
});

test("migrated Pump tokens quote and execute through the verified PancakeSwap V2 router", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const token = "0x2222222222222222222222222222222222222222";
  const curve = "0x3333333333333333333333333333333333333333";
  const pair = "0x4444444444444444444444444444444444444444";
  const router = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
  const reports: Array<Record<string, unknown>> = [];
  const response = async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market-activity")) return { ok: true, json: async () => ({ data: { activity: [], summary: {} } }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [{ token_name: "Migrated", symbol: "MIG", contract_address: token, quote_token: "BNB", status: "migrated", migrated: true, submitted_at: new Date().toISOString(), progress_percent: 100 }] }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { token_name: "Migrated", symbol: "MIG", contract_address: token, quote_token: "BNB", quote_token_address: null, curve_address: curve, status: "migrated", migrated: true, progress_percent: 100 } }) };
    if (url.includes("v1/pump/migration-proof")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, migrated: true, router_address: router, router_verified: true, pair_address: pair, lp_burn_verified: true } }) };
    if (url.includes("v1/pump/trades") || url.includes("v1/pump/candles")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    if (url.includes("buy-quote")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, route_type: "pancakeswap_v2", router_address: router, pair_address: pair, quote_token: "BNB", quote_token_address: "0x0000000000000000000000000000000000000000", chain_id: "0x38", quote_id: "dex-quote", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "1000000000000000000", min_out: "980000000000000000", slippage_bps: 200, fee_rate_percent: "0.000000%", fee_quote: "0" } }) };
    if (url.includes("v1/wallet/tx/report")) { reports.push(JSON.parse(String(init?.body || "{}"))); return { ok: true, json: async () => ({ data: { accepted: true } }) }; }
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerTransactions } = await boot(response, { account, session: { token: "session", address: account } });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const input = window.document.querySelector("#trade-amount") as HTMLInputElement;
  input.value = "0.001";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.match(window.document.querySelector("[data-quote-route]")?.textContent || "", /PancakeSwap V2/);
  window.document.querySelector("#trade-submit")?.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 120));
  const trade = providerTransactions.find((transaction) => String(transaction.to).toLowerCase() === router);
  assert.ok(trade, "migrated trade was not sent to PancakeSwap V2");
  assert.match(String(trade?.data), /^0xb6f9de95/);
  assert.equal(String(trade?.value), "0x38d7ea4c68000");
  const tradeReports = reports.filter((report) => report.tx_type === "pump_buy");
  assert.deepEqual(tradeReports.map((report) => report.status), ["pending", "success"]);
  assert.ok(tradeReports.every((report) => (report.metadata as Record<string, unknown>).route_type === "pancakeswap_v2"));
});

test("native BNB quote accepts API chain aliases and keeps exact zero-sentinel binding", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const curve = "0x2222222222222222222222222222222222222222";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [{ token_name: "Real", symbol: "REAL", contract_address: token, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1 }] }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { symbol: "REAL", quote_token: "BNB", quote_token_address: null, curve_address: curve, progress_percent: 1 } }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [{ quote_amount: "1000000000000000000", token_amount: "100000000000000000000000000000000000000", timestamp: Date.now() }] }) };
    if (url.includes("buy-quote")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, quote_token: "BNB", quote_token_address: "0x0000000000000000000000000000000000000000", chain_id: "bsc", quote_id: "q-bnb", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "100", min_out: "98", slippage_bps: 200 } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerCalls, chartData } = await boot(response);
  const input = window.document.querySelector("#trade-amount") as HTMLInputElement;
  input.value = "1";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.notEqual((window.document.querySelector("[data-quote-output]")?.textContent || "").trim(), "—");
  assert.equal(providerCalls.includes("eth_sendTransaction"), false);
  assert.ok(chartData.flat().every((point) => Object.values(point as Record<string, unknown>).every((value) => typeof value !== "number" || Number.isFinite(value))));
});

test("a broadcast trade keeps its original wallet, side, and token metadata after UI selection changes", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const tokenA = "0x2222222222222222222222222222222222222222";
  const tokenB = "0x3333333333333333333333333333333333333333";
  const curveA = "0x4444444444444444444444444444444444444444";
  const curveB = "0x5555555555555555555555555555555555555555";
  const tokens = [
    { token_name: "Alpha", symbol: "ALPHA", contract_address: tokenA, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1 },
    { token_name: "Beta", symbol: "BETA", contract_address: tokenB, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 2 },
  ];
  let resolveReceipt: (value: unknown) => void = () => undefined;
  const receiptPromise = new Promise<unknown>((resolve) => { resolveReceipt = resolve; });
  const reports: Array<Record<string, unknown>> = [];
  const response = async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: tokens }) };
    if (url.includes("v1/pump/market-activity")) return { ok: true, json: async () => ({ data: { activity: [], summary: {} } }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    if (url.includes("v1/pump/detail")) { const beta = url.toLowerCase().includes(tokenB); return { ok: true, json: async () => ({ data: { ...(beta ? tokens[1] : tokens[0]), quote_token_address: null, curve_address: beta ? curveB : curveA } }) }; }
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("buy-quote")) { const beta = url.toLowerCase().includes(tokenB); return { ok: true, json: async () => ({ data: { token_address: beta ? tokenB : tokenA, curve_address: beta ? curveB : curveA, quote_token: "BNB", quote_token_address: "0x0000000000000000000000000000000000000000", chain_id: "0x38", quote_id: beta ? "q-beta" : "q-alpha", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "1000000000000000000", min_out: "980000000000000000", slippage_bps: 200 } }) }; }
    if (url.includes("v1/wallet/tx/report")) { reports.push(JSON.parse(String(init?.body || "{}"))); return { ok: true, json: async () => ({ data: { accepted: true } }) }; }
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerCalls } = await boot(response, { account, session: { token: "session", address: account }, receiptPromise });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const input = window.document.querySelector("#trade-amount") as HTMLInputElement;
  input.value = "0.001";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  window.document.querySelector("#trade-submit")?.dispatchEvent(new window.Event("click", { bubbles: true }));
  for (let attempt = 0; attempt < 20 && !providerCalls.includes("eth_getTransactionReceipt"); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(providerCalls.includes("eth_getTransactionReceipt"), "trade was not broadcast before the UI selection changed");
  window.document.querySelector(`[data-live-token="${tokenB}"]`)?.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(window.document.querySelector("[data-active-symbol]")?.textContent, "BETA");
  resolveReceipt({ status: "0x1" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const tradeReports = reports.filter((report) => report.tx_type === "pump_buy");
  assert.deepEqual(tradeReports.map((report) => report.status), ["pending", "success"]);
  for (const report of tradeReports) {
    assert.equal(report.user_address, account);
    assert.equal(report.from_token, "BNB");
    assert.equal(report.to_token, "ALPHA");
    assert.equal((report.metadata as Record<string, unknown>).token_address, tokenA);
    assert.equal((report.metadata as Record<string, unknown>).curve_address, curveA);
  }
});

test("token details use a canonical address URL and copy the full contract address", async () => {
  const token = "0x5bae7612602aa6919246b056c2652f0922078888";
  const curve = "0x2222222222222222222222222222222222222222";
  const fixture = { token_name: "Pepe", symbol: "PEPE", contract_address: token, quote_token: "BNB", quote_token_address: null, curve_address: curve, status: "deployed", progress_percent: 0 };
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/detail?")) return { ok: true, json: async () => ({ data: fixture }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [fixture] }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };

  const direct = await boot(response, { pathname: "/launchpad/bitbt-launch-ui-app.html", parentPathname: `/pump/${token}` });
  assert.equal(direct.window.document.querySelector('[data-panel="detail"]')?.classList.contains("active"), true, "direct token URL did not restore the detail panel");
  direct.window.document.querySelector("[data-copy-token-address]")?.dispatchEvent(new direct.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(direct.clipboardWrites, [token], "copy control did not write the complete contract address");

  const selected = await boot(response, { pathname: "/launchpad/bitbt-launch-ui-app.html", parentPathname: "/pump" });
  selected.window.document.querySelector(`[data-live-token="${token}"]`)?.dispatchEvent(new selected.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(selected.historyPaths.at(-1), `/pump/${token}`, "selecting a token did not update the parent canonical URL");
});

test("detail and trade panels render only real API values, decimal K-lines, and formatted quote units", async () => {
  const token = "0x5bae7612602aa6919246b056c2652f0922078888";
  const curve = "0x2222222222222222222222222222222222222222";
  const logo = "https://cdn.example.com/pepe.png";
  const now = Math.floor(Date.now() / 1000);
  const fixture = { token_name: "Pepe", symbol: "PEPE", creator_address: "0x3333333333333333333333333333333333333333", creator: "0x3333333333333333333333333333333333333333", contract_address: token, quote_token: "BNB", quote_token_address: null, curve_address: curve, status: "deployed", submitted_at: new Date().toISOString(), logo_url: logo, description: "Community-built PEPE launch", website: "https://pepe.example.com", twitter: "https://x.com/pepe", telegram: "https://t.me/pepe", discord: "javascript:alert(1)", progress_percent: 12, current_price_quote: "0.000000000000000305", total_raised_quote: "0.25", tokens_sold: "819672.131147540983606557" };
  const trades = [
    { trader: fixture.creator, trade_type: "buy", quote_amount: "0.1", token_amount: "327868.852459016393442622", timestamp: now - 60 },
    { trader: "0x4444444444444444444444444444444444444444", trade_type: "sell", quote_amount: "0.05", token_amount: "163934.426229508196721311", timestamp: now },
  ];
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/detail?")) return { ok: true, json: async () => ({ data: fixture }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [fixture] }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: trades }) };
    if (url.includes("v1/pump/candles")) return { ok: true, json: async () => ({ data: [{ open_time: now - 60, open: "0.000000000000000305", high: "0.000000000000000305", low: "0.000000000000000305", close: "0.000000000000000305", volume_quote: "0.1" }, { open_time: now, open: "0.000000000000000305", high: "0.000000000000000305", low: "0.000000000000000305", close: "0.000000000000000305", volume_quote: "0.05" }] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    if (url.includes("buy-quote")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, quote_token: "BNB", quote_token_address: "0x0000000000000000000000000000000000000000", chain_id: "0x38", quote_id: "q-real", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "1000000000000000000", min_out: "980000000000000000", slippage_bps: 200, fee_quote: "0.01", fee_rate_percent: "1.000000%", price_impact_percent: "1.234567" } }) };
    throw new Error(`unmocked ${url}`);
  };
  const app = await boot(response, { pathname: "/launchpad/bitbt-launch-ui-app.html", parentPathname: `/pump/${token}` });
  for (let attempt = 0; attempt < 20 && app.window.document.querySelector("[data-active-price]")?.textContent === "—"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(app.window.document.querySelector("[data-active-image]")?.getAttribute("src"), logo);
  assert.match(app.window.document.querySelector("[data-active-price]")?.textContent || "", /0\.000000000000000305 BNB/);
  assert.equal(app.window.document.querySelector("[data-active-trade-count]")?.textContent, "2");
  assert.equal(app.window.document.querySelector("[data-active-volume]")?.textContent, "0.15 BNB");
  assert.equal(app.window.document.querySelector("[data-token-description]")?.textContent, fixture.description);
  const projectLinks = [...app.window.document.querySelectorAll<HTMLAnchorElement>("[data-token-socials] a")];
  assert.deepEqual(projectLinks.map((link) => link.textContent), ["官网", "X", "Telegram"]);
  assert.ok(projectLinks.every((link) => /^https:/.test(link.href)));
  assert.equal(projectLinks.some((link) => link.href.startsWith("javascript:")), false);
  assert.ok(app.chartData.flat().length > 0, "decimal trade amounts did not produce K-line candles");
  assert.ok(app.chartData.flat().every((point) => Object.values(point as Record<string, unknown>).every((value) => typeof value !== "number" || Number.isFinite(value))));
  for (const fake of ["$483K", "$35.2K", "6,062", "15.1%", "未发现高风险项"]) assert.equal((app.window.document.body.textContent || "").includes(fake), false, `prototype detail value leaked: ${fake}`);
  app.window.document.querySelector("[data-share-token]")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(app.clipboardWrites.at(-1), `https://bitbt.fun/pump/${token}`);
  const beforeIntervals = app.chartData.length;
  app.window.document.querySelector('[data-chart-interval="60"]')?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  for (let attempt = 0; attempt < 20 && app.chartData.length <= beforeIntervals; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(app.chartData.length > beforeIntervals, "K-line interval button did not redraw the chart");
  const amount = app.window.document.querySelector("#trade-amount") as HTMLInputElement;
  amount.value = "1";
  amount.dispatchEvent(new app.window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(app.window.document.querySelector("[data-quote-output]")?.textContent, "1 PEPE");
  assert.match(app.window.document.querySelector("[data-quote-fee]")?.textContent || "", /1\.000000% · 0\.01 BNB/);
  assert.equal(app.window.document.querySelector("[data-price-impact]")?.textContent, "1.23%");
});

test("a token without trades shows an explicit empty K-line instead of a permanent loading state", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const fixture = { token_name: "Empty", symbol: "EMPTY", contract_address: token, quote_token: "BNB", curve_address: "0x2222222222222222222222222222222222222222", status: "deployed", progress_percent: 0 };
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/detail?")) return { ok: true, json: async () => ({ data: fixture }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [fixture] }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window } = await boot(response);
  for (let attempt = 0; attempt < 20 && !/暂无真实成交/.test(window.document.querySelector("[data-chart-empty]")?.textContent || ""); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(window.document.querySelector("[data-chart-empty]")?.textContent || "", /暂无真实成交/);
});

test("zero, unsafe, and lower-than-policy minOut are rejected", async () => {
  for (const [minOut, slippage] of [["0", 200], ["100", 10000], ["97", 200]] as const) {
    const token = "0x1111111111111111111111111111111111111111";
    const curve = "0x2222222222222222222222222222222222222222";
    const response = async (input: string) => {
      const url = String(input);
      if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [{ symbol: "REAL", contract_address: token, quote_token: "BNB", status: "deployed" }] }) };
      if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { symbol: "REAL", quote_token: "BNB", quote_token_address: null, curve_address: curve } }) };
      if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
      if (url.includes("buy-quote")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, quote_token: "BNB", quote_token_address: "0x0000000000000000000000000000000000000000", chain_id: 56, quote_id: "q-invalid", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "100", min_out: minOut, slippage_bps: slippage } }) };
      throw new Error(`unmocked ${url}`);
    };
    const { window, providerCalls } = await boot(response);
    const input = window.document.querySelector("#trade-amount") as HTMLInputElement;
    input.value = "1";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal((window.document.querySelector("[data-quote-output]")?.textContent || "").trim(), "—");
    assert.equal(providerCalls.includes("eth_sendTransaction"), false);
  }
});

test("launch signing binds every prepare field and single-flights the wallet send", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const factory = "0x2222222222222222222222222222222222222222";
  const recipient = "0x3333333333333333333333333333333333333333";
  const predicted = "0x4444444444444444444444444444444444444444";
  const curve = "0x5555555555555555555555555555555555555555";
  const fee = { fee_wei: "5000000000000000", receive_address: recipient, factory_address: factory, chain_id: "bsc" };
  const quoteAddresses = { BNB: "0x0000000000000000000000000000000000000000", USDT: "0x55d398326f99059fF775485246999027B3197955", USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", USD1: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" } as const;
  type PreparedFixture = { launch: { id: string; token_name: string; symbol: string; creator_address: string; quote_token: string; launch_settings?: Record<string, unknown> }; fee_wei: string; factory_address: string; fee_recipient: string; chain_id: string; salt: string; predicted_token_address: string; curve_address: string; migration_threshold_wei: string; quote_token_address: string; method: string; initial_buy_wei: string; initial_buy_min_tokens_out: string; transaction_value_wei: string; tax_lifecycle?: Record<string, string> };
  const prepared: PreparedFixture = { launch: { id: "launch-1", token_name: "Real Token", symbol: "REAL", creator_address: account, quote_token: "BNB" }, fee_wei: fee.fee_wei, factory_address: factory, fee_recipient: recipient, chain_id: "bsc", salt: `0x${"ab".repeat(32)}`, predicted_token_address: predicted, curve_address: curve, migration_threshold_wei: "6140000000000000000", quote_token_address: quoteAddresses.BNB, method: "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)", initial_buy_wei: "0", initial_buy_min_tokens_out: "0", transaction_value_wei: fee.fee_wei };
  const run = async (quote: keyof typeof quoteAddresses, mutate?: (value: typeof prepared) => typeof prepared, changeAfterLoad = false, receiptStatus = "0x1", sendRejects = 0, sendErrorCode?: number, nullHash = false, retryAfterReject = false, nativeBalance = 10n ** 19n, taxMode = false, backgroundRetry = false, customCurve = false, estimateRejects = 0, confirmFailures = 0, logoUploadFailures = 0, confirmFailureMode: "500" | "timeout" = "500") => {
    const curveMode = customCurve ? "custom" : "standard";
    const taxSettings = { antisniper: true, enable_tax: true, request_platform_lp: false, curve_mode: curveMode, buy_tax_rate: "5", sell_tax_rate: "5", funds_recipient_pct: "40", burn_pct: "20", holders_pct: "20", liquidity_pct: "20", min_dividend_balance: "100000", recipient_wallet: account, tax_duration_days: "0", anti_bot_duration_minutes: "5", anti_bot_extra_tax_rate: "2", max_wallet_pct: "2", sell_cooldown_seconds: "30" };
    const taxLifecycle = { tax_duration_seconds: "0", anti_bot_duration_seconds: "300", anti_bot_extra_tax_bps: "200", max_wallet_bps: "200", sell_cooldown_seconds: "30" };
    const quotePrepared = { ...prepared, launch: { ...prepared.launch, quote_token: quote, launch_settings: taxMode ? taxSettings : { antisniper: true, enable_tax: false, request_platform_lp: false, curve_mode: curveMode } }, quote_token_address: quoteAddresses[quote], method: taxMode ? "launchTaxTokenV2WithQuotePaid(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32))" : prepared.method, ...(taxMode ? { tax_lifecycle: taxLifecycle } : {}) };
    let sendCount = 0;
    let prepareCount = 0;
    let statusCount = 0;
    let confirmCount = 0;
    let logoUploadCount = 0;
    let prepareBody: Record<string, unknown> | undefined;
    let confirmBody: Record<string, unknown> | undefined;
    const fetchUrls: string[] = [];
    const response = async (input: string, init?: RequestInit) => {
      const url = String(input);
      fetchUrls.push(url);
      if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
      if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { domain: "bitbt.fun", nonce: "n1" } }) };
      if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account } }) };
      if (url.includes("v1/pump/name-check")) return { ok: true, json: async () => ({ data: { available: true } }) };
      if (url.includes("v1/token/launch-fee")) return { ok: true, json: async () => ({ data: fee }) };
      if (url.includes("v1/token/prepare-launch")) { prepareCount += 1; prepareBody = JSON.parse(String(init?.body || "{}")); return { ok: true, json: async () => ({ data: mutate ? mutate(quotePrepared) : quotePrepared }) }; }
      if (url.includes("v1/token/status")) { statusCount += 1; return { ok: true, json: async () => ({ data: { status: "deployed", contract_address: predicted } }) }; }
      if (url.includes("v1/token/launch")) {
        confirmCount += 1;
        confirmBody = JSON.parse(String(init?.body || "{}"));
        if (confirmCount <= confirmFailures) {
          if (confirmFailureMode === "timeout") throw new Error("Request timed out");
          return { ok: false, status: 500, json: async () => ({ error: "Temporary confirmation failure" }) };
        }
        return { ok: true, json: async () => ({ data: backgroundRetry ? { status: "deploying", rejection_reason: "Deploy tx sent (0xabc) pending confirmation" } : { status: "deployed", contract_address: predicted, logo_url: confirmBody?.logo_url || null } }) };
      }
      throw new Error(`unmocked ${url}`);
    };
    const { window, providerCalls, providerTransactions, historyPaths } = await boot(response, { account, receiptStatus, sendRejects, sendErrorCode, nullHash, nativeBalance, estimateRejects });
    if (logoUploadFailures > 0) {
      (window as typeof window & { bitbtLaunchLogoSelectionKey?: () => string }).bitbtLaunchLogoSelectionKey = () => "selected-logo";
      (window as typeof window & { bitbtUploadSelectedLaunchLogo?: () => Promise<string> }).bitbtUploadSelectedLaunchLogo = async () => { logoUploadCount += 1; if (logoUploadCount <= logoUploadFailures) throw new Error("Logo upload timed out"); return "https://bucket.s3.ap-east-1.amazonaws.com/logos/retried.png"; };
    }
    const name = window.document.querySelector("#token-name") as HTMLInputElement;
    const symbol = window.document.querySelector("#token-symbol") as HTMLInputElement;
    if (customCurve) {
      window.document.querySelector('[data-curve-mode="custom"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
      (window.document.querySelector("#migration-threshold-quote") as HTMLInputElement).value = quote === "BNB" ? "115" : "69000";
    }
    name.value = "Real Token";
    symbol.value = "REAL";
    (window.document.querySelector("#token-story") as HTMLTextAreaElement).value = "Fresh launch story";
    if (taxMode) {
      window.document.querySelector('[data-tax-mode="tax"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
      assert.equal((window.document.querySelector("#buy-tax-rate") as HTMLInputElement).value, "5");
      assert.equal((window.document.querySelector("#sell-tax-rate") as HTMLInputElement).value, "5");
    }
    window.document.querySelector(`[data-launch-quote="${quote}"]`)?.dispatchEvent(new window.Event("click", { bubbles: true }));
    window.document.querySelector("[data-open='create-review']")?.dispatchEvent(new window.Event("click", { bubbles: true }));
    const submit = window.document.querySelector("[data-launch-publish]") as HTMLButtonElement;
    assert.equal(submit.disabled, true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (taxMode) assert.equal((window.document.querySelector("#tax-recipient-wallet") as HTMLInputElement).value, account);
    const snapshotText = window.document.querySelector("[data-panel='create-review']")?.textContent || "";
    if (!mutate) { const diagnostic = `toast=${window.document.querySelector(".toast")?.textContent || ""} fetch=${fetchUrls.join(",")}`; assert.match(snapshotText, /Real Token/, diagnostic); assert.match(snapshotText, /REAL/); assert.match(snapshotText, /Fresh launch story/); assert.match(snapshotText, new RegExp(quote)); assert.match(snapshotText, /0\.005 BNB/); }
    // linkedom does not reflect the boolean disabled property after async DOM mutation;
    // the production browser path removes the attribute in renderLaunchReview.
    submit.disabled = false;
    submit.removeAttribute("disabled");
    assert.equal(providerCalls.includes("eth_sendTransaction"), false);
    if (changeAfterLoad) {
      const story = window.document.querySelector("#token-story") as HTMLTextAreaElement;
      story.value = "Changed after review";
      story.dispatchEvent(new window.Event("input", { bubbles: true }));
      assert.equal(submit.disabled, true);
      submit.disabled = false;
      submit.dispatchEvent(new window.Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { sendCount: providerCalls.filter((method) => method === "eth_sendTransaction").length, prepareCount, statusCount, providerCalls, providerTransactions, prepareBody, body: window.document.body.textContent, fetchUrls, historyPaths };
    }
    submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    if (!sendRejects && !estimateRejects) submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    sendCount = providerCalls.filter((method) => method === "eth_sendTransaction").length;
    if (estimateRejects) return { sendCount, prepareCount, statusCount, providerCalls, providerTransactions, prepareBody, body: window.document.body.textContent, fetchUrls, historyPaths };
    if (sendRejects && retryAfterReject) {
      submit.disabled = false;
      submit.dispatchEvent(new window.Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      sendCount = providerCalls.filter((method) => method === "eth_sendTransaction").length;
    } else if (!sendRejects) {
      submit.disabled = false;
      submit.dispatchEvent(new window.Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    sendCount = providerCalls.filter((method) => method === "eth_sendTransaction").length;
    return { sendCount, prepareCount, statusCount, confirmCount, logoUploadCount, providerCalls, providerTransactions, prepareBody, confirmBody, body: window.document.body.textContent, fetchUrls, historyPaths };
  };
  for (const quote of Object.keys(quoteAddresses) as Array<keyof typeof quoteAddresses>) {
    const result = await run(quote);
    assert.equal(result.sendCount, 1, `launch quote ${quote} did not send; request=${JSON.stringify(result.prepareBody)} calls=${result.providerCalls.join(",")} fetch=${result.fetchUrls.join(",")} body=${result.body?.slice(-200)}`);
    assert.equal(result.prepareCount, 1, `launch quote ${quote} was prepared more than once`);
    assert.equal(result.prepareBody?.quote_token, quote);
    assert.equal(result.prepareBody?.chain_id, "bsc");
    assert.deepEqual(result.prepareBody?.launch_settings, { antisniper: true, enable_tax: false, request_platform_lp: false, curve_mode: "standard" });
    assert.equal(result.providerTransactions[0]?.value, "0x11c37937e08000");
    assert.equal(result.providerTransactions[0]?.gas, "0x249f00");
    assert.equal(result.providerTransactions[0]?.data?.toString().includes(quoteAddresses[quote].slice(2).toLowerCase()), true);
    for (let attempt = 0; attempt < 20 && result.historyPaths.at(-1) !== `/pump/${predicted}`; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(result.historyPaths.at(-1), `/pump/${predicted}`, `successful ${quote} launch did not open its canonical token URL; history=${result.historyPaths.join(",")} body=${result.body?.slice(-300)}`);
  }
  const taxed = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 10n ** 19n, true);
  assert.equal(taxed.sendCount, 1, "tax-token launch did not broadcast");
  assert.deepEqual(taxed.prepareBody?.launch_settings, { antisniper: true, enable_tax: true, request_platform_lp: false, curve_mode: "standard", buy_tax_rate: "5", sell_tax_rate: "5", funds_recipient_pct: "40", burn_pct: "20", holders_pct: "20", liquidity_pct: "20", min_dividend_balance: "100000", recipient_wallet: account, tax_duration_days: "0", anti_bot_duration_minutes: "5", anti_bot_extra_tax_rate: "2", max_wallet_pct: "2", sell_cooldown_seconds: "30" });
  assert.equal(String(taxed.providerTransactions[0]?.data).slice(0, 10), "0xb6d56503");
  const taxedBackgroundRetry = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 10n ** 19n, true, true);
  assert.equal(taxedBackgroundRetry.sendCount, 1, "tax-token retry flow rebroadcast the wallet transaction");
  assert.equal(taxedBackgroundRetry.statusCount, 1, "tax-token retry flow did not reconcile through the status endpoint");
  assert.equal(taxedBackgroundRetry.historyPaths.at(-1), `/pump/${predicted}`);
  const custom = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 10n ** 19n, false, false, true);
  assert.equal(custom.sendCount, 1, "custom-curve launch did not broadcast");
  assert.equal(custom.prepareBody?.migration_threshold_quote, "115");
  assert.equal((custom.prepareBody?.launch_settings as Record<string, unknown>)?.curve_mode, "custom");
  const stale = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 10n ** 19n, false, false, false, 1);
  assert.equal(stale.sendCount, 0, "stale Factory snapshot must not broadcast");
  assert.equal(stale.prepareCount, 2, "stale Factory snapshot was not regenerated exactly once");
  for (const failureMode of ["500", "timeout"] as const) {
    const confirmationRetry = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 10n ** 19n, false, false, false, 0, 1, 0, failureMode);
    assert.equal(confirmationRetry.sendCount, 1, `${failureMode} confirmation retry rebroadcast the wallet transaction`);
    assert.equal(confirmationRetry.confirmCount, 2, `${failureMode} confirmation failure did not retry exactly once`);
    assert.equal(confirmationRetry.historyPaths.at(-1), `/pump/${predicted}`);
  }
  const logoRetry = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 10n ** 19n, false, false, false, 0, 0, 1);
  assert.equal(logoRetry.sendCount, 1, "Logo retry rebroadcast the wallet transaction");
  assert.equal(logoRetry.logoUploadCount, 2, "Logo upload failure was not retried exactly once");
  assert.equal(logoRetry.confirmCount, 1, "launch confirmation ran before Logo upload recovered");
  assert.equal(logoRetry.confirmBody?.logo_url, "https://bucket.s3.ap-east-1.amazonaws.com/logos/retried.png");
  const changed = await run("BNB", undefined, true);
  assert.equal(changed.sendCount, 0, "changed launch metadata was signed");
  assert.equal(changed.prepareCount, 2, "changed launch metadata did not require a fresh prepare response");
  const failed = await run("BNB", undefined, false, "0x0");
  assert.equal(failed.sendCount, 1, "failed receipt should still have exactly one broadcast");
  assert.equal(failed.prepareCount, 1, "failed receipt made the same snapshot reusable");
  const retry = await run("BNB", undefined, false, "0x1", 1, 4001, false, true);
  assert.equal(retry.providerTransactions.length, 1, `explicit wallet rejection should allow exactly one later retry: ${retry.providerCalls.join(",")}`);
  assert.equal(retry.prepareCount, 1, "explicit wallet rejection should preserve the prepared snapshot for retry");
  const ambiguous = await run("BNB", undefined, false, "0x1", 1, -32000);
  assert.equal(ambiguous.providerTransactions.length, 0, "ambiguous provider errors must not be retried");
  assert.equal(ambiguous.prepareCount, 1, "ambiguous provider errors must keep the single prepared snapshot");
  assert.match(ambiguous.body, /交易状态未知/);
  const nullHash = await run("BNB", undefined, false, "0x1", 0, undefined, true);
  assert.equal(nullHash.providerTransactions.length, 0, "null transaction hashes must not be treated as broadcasts");
  assert.equal(nullHash.prepareCount, 1, "null transaction hashes must not re-prepare");
  assert.match(nullHash.body, /交易状态未知/);
  const insufficient = await run("BNB", undefined, false, "0x1", 0, undefined, false, false, 1_000_000_000_000_000n);
  assert.equal(insufficient.sendCount, 0, "insufficient launch balance must never open a wallet transaction");
  assert.equal(insufficient.providerCalls.includes("eth_estimateGas"), false, "balance below the launch fee must fail before gas simulation");
  assert.match(insufficient.body, /BNB 余额不足/);
  const altered = [
    (value: typeof prepared) => ({ ...value, chain_id: "1" }),
    (value: typeof prepared) => ({ ...value, fee_recipient: factory }),
    (value: typeof prepared) => ({ ...value, factory_address: recipient }),
    (value: typeof prepared) => ({ ...value, quote_token_address: recipient }),
    (value: typeof prepared) => ({ ...value, curve_address: "0x0000000000000000000000000000000000000000" }),
    (value: typeof prepared) => ({ ...value, predicted_token_address: "0x0000000000000000000000000000000000000000" }),
    (value: typeof prepared) => ({ ...value, migration_threshold_wei: "0" }),
    (value: typeof prepared) => ({ ...value, method: "wrong" }),
    (value: typeof prepared) => ({ ...value, salt: "0x00" }),
    (value: typeof prepared) => ({ ...value, launch: { ...value.launch, creator_address: recipient } }),
  ];
  for (const [index, mutation] of altered.entries()) assert.equal((await run("BNB", mutation)).sendCount, 0, `altered launch field ${index} was signed`);
});

test("a persisted successful receipt retries confirmation after refresh without rebroadcasting", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const predicted = "0x4444444444444444444444444444444444444444";
  const curve = "0x5555555555555555555555555555555555555555";
  const pendingConfirmation = {
    hash: `0x${"ab".repeat(32)}`,
    name: "Recovered Token",
    symbol: "REC",
    quote: "BNB",
    logoRequired: false,
    confirmedLogoUrl: "",
    prepared: { launch: { id: "launch-recovery", token_name: "Recovered Token", symbol: "REC", creator_address: account, quote_token: "BNB" }, predicted_token_address: predicted, curve_address: curve, quote_token_address: "0x0000000000000000000000000000000000000000" },
  };
  let confirms = 0;
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/token/launch")) { confirms += 1; return { ok: true, json: async () => ({ data: { status: "deployed", contract_address: predicted } }) }; }
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { ...pendingConfirmation.prepared.launch, status: "deployed", contract_address: predicted, curve_address: curve, quote_token_address: null } }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerCalls, historyPaths, storage } = await boot(response, { account, session: { token: "session", address: account }, pendingConfirmation });
  const retry = window.document.querySelector("[data-launch-publish]") as HTMLButtonElement;
  assert.equal(retry.textContent, "重试保存发币结果");
  retry.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(confirms, 1);
  assert.equal(providerCalls.includes("eth_sendTransaction"), false);
  assert.equal(historyPaths.at(-1), `/pump/${predicted}`);
  assert.equal(storage.has("bitbt_pump_pending_launch_confirmation"), false);
});

test("bridge contains provider-state, session-expiry, non-zero launch, and quote binding guards", () => {
  for (const marker of ["accountsChanged", "chainChanged", "assertProviderState", "restoreSession", "revalidateSession", "visibilitychange", "sessionExpiresAt", "bitbt_pump_session_address", "v1/auth/siwe/session", "SESSION_EXPIRED", "isNonZeroAddress", "normalizeChainId", "quoteTokenAddress", "quoteId", "expiresAt", "minOut", "state.busy", "launchBusy", "launchTerminal", "launchFormKey", "assertLaunchBinding", "4001", "交易状态未知", "data-wallet-label], .connect-global, .connect", "disabled", "renderUnavailable"]) assert.match(bridge, new RegExp(marker));
  assert.equal(bridge.includes("state.quote = response"), false);
  assert.equal(bridge.includes("Math.sin"), false);
});

test("a valid SIWE session restores the wallet label after a page refresh", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  let resolveActivity: (value: unknown) => void = () => undefined;
  const delayedActivity = new Promise<unknown>((resolve) => { resolveActivity = resolve; });
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/wallet-activity")) return delayedActivity;
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerEvents, storage } = await boot(response, { account, session: { token: "session", address: account } });
  assert.equal(window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  providerEvents.accountsChanged?.([account]);
  assert.equal(window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  providerEvents.accountsChanged?.(["0x2222222222222222222222222222222222222222"]);
  assert.equal(window.document.querySelector(".connect-global")?.textContent, "连接钱包");
  resolveActivity({ ok: true, json: async () => ({ data: { activity: [{ token_name: "STALE ACCOUNT TRADE" }], launches: [{ token_name: "STALE ACCOUNT TOKEN" }], creator_rewards: [{ status: "accrued", amount_wei: "1" }], summary: {} } }) });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.doesNotMatch(window.document.body.textContent || "", /STALE ACCOUNT/);
  assert.equal(storage.has("bitbt_pump_session"), false);
});

test("BNB balance refresh reuses one native-balance request per token-balance request", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const token = "0x2222222222222222222222222222222222222222";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [{ token_name: "Alpha", symbol: "ALPHA", contract_address: token, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1 }] }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { symbol: "ALPHA", quote_token: "BNB", quote_token_address: null, curve_address: "0x3333333333333333333333333333333333333333", progress_percent: 1 } }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market-activity")) return { ok: true, json: async () => ({ data: { activity: [], summary: {} } }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { providerCalls } = await boot(response, { account, session: { token: "session", address: account }, tokenBalance: 10n ** 18n });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const nativeReads = providerCalls.filter((method) => method === "eth_getBalance").length;
  const tokenReads = providerCalls.filter((method) => method === "eth_call").length;
  assert.ok(nativeReads > 0, "native BNB balance was not loaded");
  assert.equal(nativeReads, tokenReads, "BNB quote balance made a duplicate eth_getBalance request");
});

test("OKX, TokenPocket, and Binance Wallet connect on BSC without redundant switching and switch once from another chain", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { nonce: "nonce-123", domain: "bitbt.fun" } }) };
    if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account, expires_in: 3600 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };

  for (const providerTarget of ["okxwallet", "tokenpocket", "binance"] as const) {
    const app = await boot(response, { account, providerTarget });
    assert.equal((app.window as Window & { ethereum?: unknown }).ethereum, undefined, `${providerTarget} test unexpectedly relied on window.ethereum`);
    app.window.document.querySelector(".connect-global")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(app.window.document.querySelector(".connect-global")?.textContent, "0x1111…1111", `${providerTarget} did not connect`);
    for (const method of ["eth_requestAccounts", "personal_sign", "eth_accounts", "eth_chainId"]) assert.ok(app.providerCalls.includes(method), `${providerTarget} did not use ${method}`);
    assert.equal(app.providerCalls.includes("wallet_switchEthereumChain"), false, `${providerTarget} redundantly switched an already-BSC wallet`);
  }

  const switched = await boot(response, { account, providerTarget: "binance", chainId: "0x1" });
  switched.window.document.querySelector(".connect-global")?.dispatchEvent(new switched.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(switched.window.document.querySelector(".connect-global")?.textContent, "0x1111…1111", "Binance Wallet did not connect after switching to BSC");
  assert.equal(switched.providerCalls.filter((method) => method === "wallet_switchEthereumChain").length, 1, "non-BSC wallet did not switch exactly once");
  assert.ok(switched.providerCalls.filter((method) => method === "eth_chainId").length >= 2, "wallet chain was not confirmed after switching");
});

test("the iframe connects through an OKX provider injected only into its same-origin parent", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { nonce: "nonce-123", domain: "bitbt.fun" } }) };
    if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account, expires_in: 3600 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const app = await boot(response, { account, providerTarget: "parent-okxwallet", parentPathname: "/launchpad/bitbt-wallet-ui.html" });
  assert.equal((app.window as Window & { okxwallet?: unknown }).okxwallet, undefined, "OKX provider leaked into the iframe test window");
  app.window.document.querySelector(".connect-global")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(app.window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  for (const method of ["eth_requestAccounts", "personal_sign", "eth_accounts", "eth_chainId"]) assert.ok(app.providerCalls.includes(method), `parent OKX provider did not use ${method}`);
  assert.equal(app.providerCalls.includes("wallet_switchEthereumChain"), false, "parent OKX provider redundantly switched an already-BSC wallet");
});

test("an EIP-6963-only wallet connects only after explicit user selection", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { nonce: "nonce-123", domain: "bitbt.fun" } }) };
    if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account, expires_in: 3600 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const app = await boot(response, { account, providerTarget: "eip6963" });
  app.window.document.querySelector(".connect-global")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(app.providerCalls.length, 0, "EIP-6963 provider was called before user selection");
  const choice = app.window.document.querySelector("[data-eip6963-provider]");
  assert.ok(choice, "explicit EIP-6963 wallet chooser was not rendered");
  choice.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(app.window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  assert.ok(app.providerCalls.includes("personal_sign"));
});

test("a regular browser can connect through WalletConnect and exposes wallet-app deep links", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("/api/pump/wallet-config")) return { ok: true, json: async () => ({ data: { walletConnectProjectId: "test-project" } }) };
    if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { nonce: "nonce-123", domain: "bitbt.fun" } }) };
    if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account, expires_in: 3600 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const app = await boot(response, { account, providerTarget: "none", walletConnect: true });
  app.window.document.querySelector(".connect-global")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  const buttons = [...app.window.document.querySelectorAll(".wallet-provider-list button")];
  assert.ok(buttons.some((button) => button.textContent?.includes("OKX Wallet App")));
  assert.ok(buttons.some((button) => button.textContent?.includes("MetaMask App")));
  assert.ok(buttons.some((button) => button.textContent?.includes("Trust Wallet App")));
  assert.ok(buttons.some((button) => button.textContent?.includes("TokenPocket App")));
  assert.match(bridge, /tpdapp:\/\/open\?params=/);
  assert.match(bridge, /okx:\/\/wallet\/dapp\/url\?dappUrl=/);
  assert.match(html, /wss:\/\/\*\.walletconnect\.org/);
  assert.match(html, /https:\/\/fonts\.reown\.com/);
  assert.match(walletConfigRoute, /api\/v1\/connect\/capabilities/);
  for (const method of ["personal_sign", "eth_sendTransaction", "eth_estimateGas"]) assert.match(walletConnectBridge, new RegExp(method));
  const walletConnect = buttons.find((button) => button.textContent?.includes("WalletConnect"));
  assert.ok(walletConnect, "WalletConnect choice was not rendered in a regular browser");
  walletConnect.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(app.window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  assert.equal(app.storage.get("bitbt_pump_provider_kind"), "walletconnect");
  assert.ok(app.providerCalls.includes("personal_sign"));
});

test("a forged EIP-6963 OKX announcement cannot replace a directly injected wallet", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { nonce: "nonce-123", domain: "bitbt.fun" } }) };
    if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account, expires_in: 3600 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [], launches: [], creator_rewards: [], summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const app = await boot(response, { account, maliciousAnnouncement: true });
  app.window.document.querySelector(".connect-global")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(app.window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  assert.equal(app.untrustedProviderCalls.length, 0, "forged EIP-6963 provider received wallet requests");
  assert.ok(app.providerCalls.includes("personal_sign"));
});

test("wallet activity loads buy, sell, and create once and filters them locally", async () => {
  const account = "0x5945f53249015dae01fbfb039f5a64af5cff5629";
  const token = "0xb749f8fb754c583b0557cdedcd4b1c88df148888";
  let activityRequests = 0;
  const createdAt = new Date().toISOString();
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/wallet-activity")) {
      activityRequests += 1;
      return { ok: true, json: async () => ({ data: {
        activity: [
          { activity_type: "buy", tx_type: "pump_buy", tx_hash: `0x${"7f".repeat(32)}`, token_address: token, token_name: "TROLL", symbol: "TROLL", quote_token: "BNB", quote_amount: "0.001", token_amount: "2518400.75094142798917018", status: "success", created_at: createdAt },
          { activity_type: "sell", tx_type: "pump_sell", tx_hash: `0x${"8a".repeat(32)}`, token_address: token, token_name: "TROLL", symbol: "TROLL", quote_token: "BNB", quote_amount: "0.0005", token_amount: "1000", status: "success", created_at: createdAt },
          { activity_type: "create", tx_type: "pump_launch", tx_hash: `0x${"9b".repeat(31)}\" onmouseover=\"alert(1)`, token_address: token, token_name: '\"><img data-wallet-xss src=x onerror=alert(1)>', symbol: "TROLL", quote_token: "BNB", status: "</small><script data-wallet-xss>alert(1)</script>", created_at: createdAt },
        ],
        launches: [{ id: "launch-1", token_name: "TROLL", symbol: "TROLL", contract_address: token, chain_id: "bsc", quote_token: "BNB", status: "deployed", submitted_at: createdAt }],
        creator_rewards: [{ launch_id: "launch-1", token_address: token, quote_symbol: '<img data-reward-xss src=x onerror=alert(1)>', status: "accrued", amount_wei: "1000000000000000" }],
        summary: { total: 3, buys: 1, sells: 1, creates: 1 },
      } }) };
    }
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window } = await boot(response, { account, session: { token: "session", address: account } });
  for (let attempt = 0; attempt < 20 && window.document.querySelectorAll('[data-panel="activity"] .activity-card').length !== 3; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(activityRequests, 1);
  assert.equal(window.document.querySelectorAll('[data-panel="activity"] .activity-card').length, 3);
  assert.match(window.document.querySelector('[data-panel="activity"]')?.textContent || "", /买入 · TROLL/);
  assert.match(window.document.querySelector('[data-panel="activity"]')?.textContent || "", /0\.001 BNB/);
  assert.match(window.document.querySelector('[data-reward-summary]')?.textContent || "", /创作者奖励账本/);
  assert.match(window.document.querySelector('[data-reward-summary]')?.textContent || "", /0\.001 <img data-reward-xss/);
  assert.equal(window.document.querySelector("[data-wallet-xss]"), null, "wallet activity API fields created an executable element");
  assert.equal(window.document.querySelector("[data-reward-xss]"), null, "reward API fields created an executable element");
  assert.equal(window.document.querySelectorAll('[data-panel="activity"] a[href^="https://bscscan.com/tx/"]').length, 2, "invalid tx hash generated an explorer link");
  window.document.querySelector('[data-history-filter="pump_buy"]')?.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(window.document.querySelectorAll('[data-panel="activity"] .activity-card').length, 1);
  assert.equal(activityRequests, 1, "local history filtering made an unnecessary API request");
});

test("wallet position keeps BNB cost basis and USD valuation in the same unit", async () => {
  const account = "0x5945f53249015dae01fbfb039f5a64af5cff5629";
  const token = "0xb749f8fb754c583b0557cdedcd4b1c88df148888";
  const curve = "0x7777777777777777777777777777777777777777";
  const market = { token_name: "Position", symbol: "POS", contract_address: token, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 10, current_price_quote: "0.1666666667", current_price_usd: "100", quote_price_usd: 600, market_cap_usd: "1000", fdv_usd: "100000000000", total_raised_quote: "1" };
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/wallet-activity")) return { ok: true, json: async () => ({ data: { activity: [{ activity_type: "buy", token_address: token, quote_amount: "1", token_amount: "10", quote_token: "BNB", status: "success", created_at: new Date().toISOString() }], launches: [], creator_rewards: [], holdings: [{ token_address: token, balance_raw: String(10n * 10n ** 18n) }], holdings_complete: true, trade_history_complete: true, summary: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: [market] }) };
    if (url.includes("v1/pump/detail")) return { ok: true, json: async () => ({ data: { ...market, curve_address: curve, creator: account, tokens_sold: "10" } }) };
    if (url.includes("v1/pump/trades") || url.includes("v1/pump/kline")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window } = await boot(response, { account, session: { token: "session", address: account }, tokenBalance: 10n * 10n ** 18n });
  for (let attempt = 0; attempt < 20 && window.document.querySelector("[data-holding-value]")?.textContent === "—"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(window.document.querySelector("[data-holding-cost]")?.textContent, "0.1 BNB");
  assert.equal(window.document.querySelector("[data-holding-value]")?.textContent, "$1.00K");
  assert.equal(window.document.querySelector("[data-holding-pnl]")?.textContent, "+$400.00");
  assert.equal(window.document.querySelector("[data-holding-return]")?.textContent, "+66.67%");
  assert.equal(window.document.querySelector("[data-holding-share]")?.textContent, "100.00%");
});

test("production wallet bridge applies the fixed 0.05 Gwei policy and normalizes provider receipt states", () => {
  for (const marker of ["PRIORITY_FEE_WEI = 50_000_000n", "maxPriorityFeePerGas", "maxFeePerGas", "eth_getBlockByNumber", 'status: "pending"', 'status: "failed"']) assert.match(bridge, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  assert.match(bridge, /status: ok \? "success" : "failed"/);
  assert.match(bridge, /\[true, 1, "1", "0x1", "0x01"\]\.includes\(receipt\.status\)/);
  assert.match(bridge, /receipt\.status !== undefined && receipt\.status !== null/);
  assert.match(bridge, /const send = async \(tx, provider = selectedProvider\(\)\)/);
  assert.doesNotMatch(bridge, /launchTokenSingleFlight[\\s\\S]*eth_sendTransaction/);
});

test("live tokens use API logo URLs and launch Logo upload is deferred until a successful receipt", () => {
  assert.match(bridge, /logo_url \|\| token\?\.image_url \|\| token\?\.logo/);
  for (const marker of ["token-logo-file", "/api/pump/v1/upload/image", "dataset.launchLogoSelection", "bitbtUploadSelectedLaunchLogo", "发币成功后上传", "bitbt:launch-reset"]) assert.match(logoUpload, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(bridge, /receipt\.status[\s\S]*rememberLaunchConfirmation/);
  assert.match(bridge, /const confirmSuccessfulLaunch[\s\S]*bitbtUploadSelectedLaunchLogo[\s\S]*logo_url: pending\.confirmedLogoUrl/);
  assert.doesNotMatch(bridge, /prepare-launch[\s\S]{0,700}logo_url/);
  assert.match(html, /img-src 'self' https:\/\/\*\.amazonaws\.com https:\/\/\*\.cloudfront\.net/);
  assert.match(html, /https:\/\/\*\.walletconnect\.org/);
});

test("logo file chooser is enabled inside the production wallet iframe", () => {
  assert.match(walletShell, /sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/);
  assert.match(html, /id="token-logo-file" type="file"/);
  assert.match(html, /data-launch-file/);
});

test("Pump static shells expose the official Website favicon and contact channels", () => {
  const icon = fs.readFileSync(path.join(root, "src/app/icon.svg"), "utf8");
  const websiteIcon = fs.readFileSync(path.join(root, "../bitbt-website/src/app/icon.svg"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "src/app/manifest.ts"), "utf8");
  assert.equal(icon.trimEnd(), websiteIcon.trimEnd());
  for (const document of [shell, html]) {
    assert.match(document, /img-src 'self'/);
    assert.match(document, /manifest-src 'self'/);
    assert.match(document, /rel="icon" type="image\/png" sizes="32x32"/);
    assert.match(document, /rel="icon" type="image\/png" sizes="16x16"/);
    assert.match(document, /rel="icon" type="image\/svg\+xml" href="\/icon\.svg\?v=20260829-3"/);
    assert.match(document, /rel="shortcut icon" href="\/favicon\.ico\?v=20260829-3"/);
    assert.match(document, /rel="apple-touch-icon"/);
    assert.match(document, /rel="manifest" href="\/manifest\.webmanifest\?v=20260829-3"/);
  }
  assert.match(nextConfig, /source: "\/favicon\.ico", destination: "\/launchpad\/assets\/app-icons\/pwa\/bitbt-32\.png"/);
  for (const size of ["192x192", "512x512"]) assert.match(manifest, new RegExp(size));
  for (const marker of ["https://bitbt.com", "mailto:support@bitbt.com", "https://t.me/BitBTVentures", "https://x.com/0xcryptolin", "@BitBTVentures", "@0xcryptolin"]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /data-global-official-contacts/);
  assert.match(html, /<footer class="official-contact-footer">/);
  assert.ok(html.indexOf("data-global-official-contacts") > html.indexOf('class="workbench"'), "official contacts must be in the global footer below the interface");
  assert.ok(html.indexOf("data-global-official-contacts") < html.indexOf("</main>"), "official contacts must remain inside the global application shell");
  for (const marker of [".official-contact-footer{", ".official-contact-bar{", "overflow-x:auto", "scroll-snap-type:x proximity", ".official-contact-bar strong{display:none}", "calc(100dvh - 155px)"]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("clicking the visible logo button opens the hidden native file input", () => {
  const { window } = parseHTML(html);
  const input = window.document.querySelector("#token-logo-file") as HTMLInputElement;
  const button = window.document.querySelector("[data-launch-file]") as HTMLButtonElement;
  let pickerOpens = 0;
  input.click = () => { pickerOpens += 1; };
  const context = { window, document: window.document, CustomEvent: window.CustomEvent, FileReader: class {}, sessionStorage: { getItem: () => null }, fetch: async () => ({ json: async () => ({}) }) };
  Object.assign(window, context);
  vm.runInNewContext(logoUpload, context);
  button.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(pickerOpens, 1);
});

const exerciseLogoUpload = async (file: { name: string; size: number; type: string; lastModified?: number }, fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>, session = "session", triggerUpload = false) => {
  const { window } = parseHTML(html);
  const input = window.document.querySelector("#token-logo-file") as HTMLInputElement;
  const toasts: string[] = [];
  let reads = 0;
  let deferredUploadError = "";
  let deferredUploadUrl = "";
  class MockFileReader {
    result: string | null = null;
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    readAsDataURL() { reads += 1; this.result = "data:image/png;base64,AA=="; queueMicrotask(() => this.onload?.()); }
  }
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  window.addEventListener("bitbt:toast", (event) => toasts.push(String((event as CustomEvent).detail)));
  const context = { window, document: window.document, CustomEvent: window.CustomEvent, FileReader: MockFileReader, AbortController, sessionStorage: { getItem: () => session || null }, fetch: fetchImpl, setTimeout, clearTimeout, queueMicrotask };
  Object.assign(window, context);
  vm.runInNewContext(logoUpload, context);
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (triggerUpload) {
    try { deferredUploadUrl = await (window as typeof window & { bitbtUploadSelectedLaunchLogo?: () => Promise<string> }).bitbtUploadSelectedLaunchLogo?.() || ""; }
    catch (error) { deferredUploadError = String((error as Error)?.message || error); }
  }
  return { toasts, reads, deferredUploadError, deferredUploadUrl, storedUrl: window.document.documentElement.dataset.launchLogoUrl || "" };
};

test("selecting a valid Logo only creates a local preview and does not upload", async () => {
  let fetches = 0;
  const result = await exerciseLogoUpload({ name: "logo.png", size: 1024, type: "image/png", lastModified: 1 }, async () => { fetches += 1; throw new Error("must not upload before receipt"); });
  assert.equal(result.reads, 1);
  assert.equal(fetches, 0);
  assert.deepEqual(result.toasts, ["Logo 已选择，将在代币创建成功后上传"]);
});

test("the selected Logo uploads exactly once when the post-receipt hook runs", async () => {
  let fetches = 0;
  const url = "https://bucket.s3.ap-east-1.amazonaws.com/logos/token.png";
  const result = await exerciseLogoUpload({ name: "logo.png", size: 1024, type: "image/png", lastModified: 1 }, async () => { fetches += 1; return { ok: true, status: 200, text: async () => JSON.stringify({ data: { url } }) }; }, "session", true);
  assert.equal(fetches, 1);
  assert.equal(result.deferredUploadUrl, url);
  assert.equal(result.storedUrl, url);
});

test("logo upload rejects files over 5MB locally without reading or sending them", async () => {
  let fetches = 0;
  const result = await exerciseLogoUpload({ name: "large.jpg", size: 5 * 1024 * 1024 + 1, type: "image/jpeg" }, async () => { fetches += 1; throw new Error("must not fetch"); });
  assert.equal(result.reads, 0);
  assert.equal(fetches, 0);
  assert.deepEqual(result.toasts, ["图片不能超过 5MB，请压缩后重新选择"]);
});

test("logo upload rejects unsupported formats locally", async () => {
  let fetches = 0;
  const result = await exerciseLogoUpload({ name: "logo.gif", size: 100, type: "image/gif" }, async () => { fetches += 1; throw new Error("must not fetch"); });
  assert.equal(result.reads, 0);
  assert.equal(fetches, 0);
  assert.deepEqual(result.toasts, ["图片格式无效，请选择 PNG、JPG 或 WEBP"]);
});

test("logo upload converts an HTML 413 response into a clear size prompt", async () => {
  const result = await exerciseLogoUpload({ name: "logo.jpg", size: 1024, type: "image/jpeg" }, async () => ({ ok: false, status: 413, text: async () => "<html>Request Entity Too Large</html>" }), "session", true);
  assert.deepEqual(result.toasts, ["Logo 已选择，将在代币创建成功后上传"]);
  assert.equal(result.deferredUploadError, "图片不能超过 5MB，请压缩后重新选择");
});

test("logo upload converts a network interruption into a retry prompt", async () => {
  const result = await exerciseLogoUpload({ name: "logo.webp", size: 1024, type: "image/webp" }, async () => { throw new Error("Failed to fetch"); }, "session", true);
  assert.deepEqual(result.toasts, ["Logo 已选择，将在代币创建成功后上传"]);
  assert.equal(result.deferredUploadError, "网络连接中断，请检查网络后重试");
});

test("production upload limits and error responses stay aligned across browser, proxy, and nginx", () => {
  const nginx = fs.readFileSync(path.join(root, "deploy/bitbt.fun.nginx.conf"), "utf8");
  for (const marker of ["MAX_LOGO_BYTES = 5 * 1024 * 1024", "上传超时", "网络连接中断", "图片服务暂时不可用"]) assert.match(logoUpload, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(proxy, /MAX_IMAGE_REQUEST_BYTES = 8 \* 1024 \* 1024/);
  assert.match(nginx, /client_max_body_size 8m/);
  assert.match(nginx, /error_page 413 = @payload_too_large/);
  for (const marker of ["friendlyError", "SESSION_EXPIRED", "钱包中已有待处理请求", "操作过于频繁", "服务返回异常"]) assert.match(bridge, new RegExp(marker));
  assert.doesNotMatch(bridge, /catch\(\(error\) => toast\(error\.message\)\)/);
});

test("every locale-relative Launchpad script has an executable public rewrite", () => {
  assert.match(nextConfig, /source: "\/pump\/:address"/);
  assert.match(nextConfig, /source: "\/pump"/);
  assert.match(nextConfig, /\/:locale\(en\|zh\)\/pump\/:address/);
  assert.doesNotMatch(nextConfig, /source: "\/:locale\/pump/);
  assert.match(shell, /src="\/launchpad\/bitbt-launch-ui-app\.html"/);
  assert.match(html, /<base href="\/launchpad\/">/);
  for (const script of ["launch-logo-upload.js", "launchpad-live.js"]) {
    assert.match(html, new RegExp(`<script src="\\./${script.replaceAll(".", "\\.")}">`));
    assert.match(nextConfig, new RegExp(`/:locale/${script.replaceAll(".", "\\.")}`));
  }
});

test("WalletConnect config route cannot collide with a locale Pump rewrite", () => {
  assert.match(nextConfig, /source: "\/:locale\(en\|zh\)\/pump\/:address"/);
  assert.doesNotMatch(nextConfig, /source: "\/:locale\/pump\/:address"/);
  assert.match(deployScript, /walletConnectProjectId/);
  assert.match(deployScript, /WalletConnect project configuration is unavailable or invalid/);
});

test("canonical Pump routes are locale-free and legacy locale URLs redirect", () => {
  assert.match(edgeProxy, /\/pump\$\{tokenAddress/);
  assert.match(edgeProxy, /return NextResponse\.next\(\)/);
  assert.match(edgeProxy, /return NextResponse\.redirect\(redirect, 301\)/);
  assert.match(bridge, /const pumpBasePath = \(\) => "\/pump"/);
  assert.match(bridge, /bitbt_pump_locale/);
  assert.doesNotMatch(bridge, /`\/\$\{pumpLocale\(\)\}\/pump`/);
});

test("token filters sort the already-loaded list locally without another token-list request", () => {
  for (const marker of ["data-token-filter=\"trending\"", "data-token-filter=\"latest\"", "data-token-filter=\"near-migration\"", "data-token-filter=\"dex\"", "data-token-filter=\"high-tax\""]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  assert.match(bridge, /const filteredTokens = \(\) =>/);
  assert.match(bridge, /state\.tokenFilter/);
  assert.match(bridge, /renderTokens\(\);/);
  assert.doesNotMatch(bridge, /data-token-filter[\\s\\S]{0,1000}api\(/);
  for (const marker of ["data-market-quote-filter", "data-market-category-filter", "data-market-type-filter", "data-rank-window=\"5m\"", "data-live-filter=\"create\""]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(bridge, /marketMetric/);
  assert.match(bridge, /bindMarketSelect/);
});

test("mobile market keeps search visible and floats trade actions above the bottom navigation", () => {
  assert.match(html, /class="field token-search-field" data-token-search/);
  assert.doesNotMatch(html, /data-token-search[^>]*hidden/);
  assert.match(html, /\.fixed-trade\{height:76px;bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /screen\[data-panel="detail"\]\.has-bottom-nav\{padding-bottom:calc\(166px \+ env\(safe-area-inset-bottom\)\)/);
});

test("all launch entry points are wallet-gated until SIWE connection succeeds", () => {
  for (const marker of ["setLaunchAvailability", "data-open=\"create-mode\"", "data-nav=\"create-mode\"", "data-launch-mode", "wallet-gated", "请先连接并验证钱包"]) assert.match(bridge + html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /BitBT Pump/);
  assert.doesNotMatch(html, /BitBT LAUNCH/);
  assert.equal((html.match(/class="connect-global"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="connect"/);
});

test("web launch exposes quote, metadata, and on-chain DEX transfer-tax configuration", () => {
  for (const quote of ["BNB", "USDT", "USDC", "USD1"]) assert.match(html, new RegExp(`data-launch-quote="${quote}"`));
  assert.doesNotMatch(html, /data-launch-quote="GW"|<option>GW<\/option>/);
  assert.doesNotMatch(launchFormSource, /<option>GW<\/option>/);
  assert.match(pumpApiSource, /PumpLaunchQuoteToken = Exclude<PumpQuoteToken, "GW">/);
  assert.match(bridge, /LAUNCH_QUOTE_TOKENS = new Set\(\["BNB", "USDT", "USDC", "USD1"\]\)/);
  assert.match(bridge, /!LAUNCH_QUOTE_TOKENS\.has\(quote\)/);
  assert.match(bridge, /GW: "0x68985a6E02f80DE4d71732ca66E4e5d4e303965F"/, "existing GW projects must remain resolvable");
  for (const id of ["token-classification", "token-twitter", "token-telegram", "token-website", "token-discord"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const field of ["classification", "twitter", "telegram", "website", "discord", "launch_settings", "antisniper", "enable_tax", "request_platform_lp"]) assert.match(bridge, new RegExp(field));
  for (const mode of ["fair", "custom", "community"]) assert.match(html, new RegExp(`data-launch-mode="${mode}"`));
  for (const marker of ["migration-threshold-quote", "data-custom-curve-fields", "data-curve-mode=\"custom\"", "标准目标的 50%–200%", "社区收益代币", "链上执行"]) assert.match(html, new RegExp(marker));
  for (const id of ["buy-tax-rate", "sell-tax-rate", "funds-recipient-pct", "burn-pct", "holders-pct", "liquidity-pct", "min-dividend-balance", "tax-recipient-wallet"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const marker of ["launchTaxTokenV2WithQuotePaid", "0xb6d56503", "launchTaxConfig", "data-tax-mode", "data-tax-fields", "买入和卖出税率必须在 1%–10%", "税费分配比例合计必须为 100%", "发币准备方法与税费或首购模式不匹配"]) assert.match(bridge + html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const marker of ["launchCurveTarget", "migration_threshold_quote", "curve_mode", "setCurveMode", "setTaxMode", "链上 Factory 状态已变化，参数已自动更新"]) assert.match(bridge, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const marker of ["autoPrepareLaunch", "正在自动准备发币参数", "发币参数已自动准备", '"#buy-tax-rate": "5"', '"#sell-tax-rate": "5"', '"#tax-recipient-wallet": state.account']) assert.match(bridge, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /data-launch-load/);
  assert.match(html, /默认使用当前 Owner（连接钱包）地址；这是可编辑的默认值/);
  assert.match(html, /迁移 PancakeSwap 后对 Pair 买卖持续执行所选税率/);
  assert.match(html, /创建者初始买入.*可选 · 与发币原子执行/);
  assert.doesNotMatch(html, /预计获得 16\.84M MOON/);
});

test("Pump startup loads only selected detail and a stale response cannot replace a newer token", async () => {
  assert.doesNotMatch(bridge, /loadAllDetails/);
  assert.doesNotMatch(bridge, /api\("v1\/pump\/details"\)/);
  assert.match(bridge, /state\.details\[address\]/);
  assert.match(bridge, /v1\/pump\/detail\?address/);
  assert.match(bridge, /v1\/pump\/trades\?token_address/);
  assert.match(proxy, /v1\/pump\/details/);

  const tokenA = "0x1111111111111111111111111111111111111111";
  const tokenB = "0x2222222222222222222222222222222222222222";
  const tokens = [
    { token_name: "Alpha", symbol: "ALPHA", contract_address: tokenA, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1 },
    { token_name: "Beta", symbol: "BETA", contract_address: tokenB, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 2 },
  ];
  let resolveAlpha: (value: unknown) => void = () => undefined;
  const delayedAlpha = new Promise<unknown>((resolve) => { resolveAlpha = resolve; });
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/market")) return { ok: true, json: async () => ({ data: tokens }) };
    if (url.includes("v1/pump/market-activity")) return { ok: true, json: async () => ({ data: { activity: [], summary: {} } }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    if (url.includes("v1/market/favorites")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/pump/detail") && url.toLowerCase().includes(tokenA)) return delayedAlpha;
    if (url.includes("v1/pump/detail") && url.toLowerCase().includes(tokenB)) return { ok: true, json: async () => ({ data: { ...tokens[1], curve_address: "0x3333333333333333333333333333333333333333" } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window } = await boot(response);
  const beta = window.document.querySelector(`[data-live-token="${tokenB}"]`);
  assert.ok(beta, "second token was not rendered while the first detail request was pending");
  beta.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(window.document.querySelector("[data-active-symbol]")?.textContent, "BETA");
  resolveAlpha({ ok: true, json: async () => ({ data: { ...tokens[0], curve_address: "0x4444444444444444444444444444444444444444" } }) });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(window.document.querySelector("[data-active-symbol]")?.textContent, "BETA", "stale Alpha detail replaced the newer Beta selection");
});

test("Pump polling refreshes selected trades every cycle but batches full market refreshes", () => {
  assert.match(bridge, /refreshSelectedTrades/);
  assert.match(bridge, /const refreshMarket = !socketHealthy \|\| refreshCycle % 4 === 0/);
  assert.match(bridge, /const refreshTrades = !socketHealthy \|\| refreshCycle % 2 === 0/);
  assert.match(bridge, /loadDetail\(freshToken, \{ refreshBalance: false, forceDetail: true, refreshTrades: false \}\)/);
  assert.match(bridge, /requestSequence !== detailRequestSequence/);
  assert.match(bridge, /if \(!state\.candles\.length\).*charts\.delete\(selector\)/);
});

test("Pump proxy hides wallet RPC credentials and protects every write endpoint", () => {
  assert.match(proxy, /delete payload\.data\.rpc/);
  assert.match(proxy, /delete payload\.data\.rpcFallback/);
  assert.match(proxy, /SIWE_REQUIRED_ENDPOINTS/);
  assert.match(proxy, /SIWE_REQUIRED_ENDPOINTS = new Set\(\[[\s\S]*v1\/pump\/wallet-activity/);
  for (const endpoint of ["v1/upload/image", "v1/token/prepare-launch", "v1/token/launch"]) assert.match(proxy, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(proxy, /SIWE session required for this operation/);
  assert.match(proxy, /request\.headers\.get\("authorization"\)\?\.startsWith\("Bearer "\)/);
  assert.match(proxy, /export async function HEAD/);
});

test("prototype UI stays hidden until real-data cleanup has run", () => {
  assert.match(html, /<body class="runtime-pending">/);
  assert.match(html, /body\.runtime-pending #bitbt-launch\{visibility:hidden\}/);
  assert.match(bridge, /clearPrototype\(\); document\.body\.classList\.remove\("runtime-pending"\)/);
});
