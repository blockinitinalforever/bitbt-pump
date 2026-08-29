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
const logoUpload = fs.readFileSync(path.join(root, "public/launchpad/launch-logo-upload.js"), "utf8");
const proxy = fs.readFileSync(path.join(root, "src/app/api/pump/[...path]/route.ts"), "utf8");
const edgeProxy = fs.readFileSync(path.join(root, "src/proxy.ts"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

type BootOptions = { account?: string; chainId?: string | number; receiptStatus?: string; sendRejects?: number; sendErrorCode?: number; estimateRejects?: number; nullHash?: boolean; nativeBalance?: bigint; estimatedGas?: bigint; pathname?: string; parentPathname?: string; session?: { token: string; address: string; expiresIn?: number }; pendingConfirmation?: Record<string, unknown> };

const boot = async (fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>, options: BootOptions = {}) => {
  const { window } = parseHTML(html);
  const storage = new Map<string, string>();
  if (options.session) {
    storage.set("bitbt_pump_session", options.session.token);
    storage.set("bitbt_pump_session_address", options.session.address.toLowerCase());
  }
  if (options.pendingConfirmation) storage.set("bitbt_pump_pending_launch_confirmation", JSON.stringify(options.pendingConfirmation));
  const providerCalls: string[] = [];
  const providerTransactions: Array<Record<string, unknown>> = [];
  const providerEvents: Record<string, (value: unknown) => void> = {};
  const chartData: unknown[][] = [];
  const historyPaths: string[] = [];
  const clipboardWrites: string[] = [];
  const location = { origin: "https://bitbt.fun", pathname: options.pathname || "/pump", search: "", assign: (path: string) => { location.pathname = path.split("?", 1)[0]; historyPaths.push(path); } };
  const history = { pushState: (_state: unknown, _title: string, path: string) => { location.pathname = path.split("?", 1)[0]; historyPaths.push(path); }, replaceState: (_state: unknown, _title: string, path: string) => { location.pathname = path.split("?", 1)[0]; historyPaths.push(path); } };
  const navigator = { clipboard: { writeText: async (value: string) => { clipboardWrites.push(value); } } };
  const account = options.account || "";
  let sendRejectsRemaining = options.sendRejects ?? 0;
  let estimateRejectsRemaining = options.estimateRejects ?? 0;
  const ethereum = { request: async ({ method, params }: { method: string; params?: Array<Record<string, unknown>> }) => { providerCalls.push(method); if (method === "eth_accounts" || method === "eth_requestAccounts") return account ? [account] : []; if (method === "eth_chainId") return options.chainId ?? "0x38"; if (method === "wallet_switchEthereumChain" || method === "personal_sign") return method === "personal_sign" ? "0xsigned" : null; if (method === "eth_getBalance") return `0x${(options.nativeBalance ?? 10n ** 19n).toString(16)}`; if (method === "eth_getBlockByNumber") return { baseFeePerGas: "0x3b9aca00" }; if (method === "eth_estimateGas") { if (estimateRejectsRemaining > 0) { estimateRejectsRemaining -= 1; throw new Error("execution reverted: Address must end with 8888"); } return `0x${(options.estimatedGas ?? 2_000_000n).toString(16)}`; } if (method === "eth_sendTransaction") { if (sendRejectsRemaining > 0) { sendRejectsRemaining -= 1; const error = new Error("Provider rejected the request") as Error & { code?: number }; error.code = options.sendErrorCode; throw error; } if (options.nullHash) return null; if (params?.[0]) providerTransactions.push(params[0]); return `0x${"ab".repeat(32)}`; } if (method === "eth_getTransactionReceipt") return { status: options.receiptStatus ?? "0x1" }; throw new Error(`unexpected provider call: ${method}`); }, on: (event: string, callback: (value: unknown) => void) => { providerEvents[event] = callback; } };
  Object.defineProperty(window, "location", { configurable: true, value: location });
  Object.defineProperty(window, "history", { configurable: true, value: history });
  if (options.parentPathname) {
    const parentLocation = { ...location, pathname: options.parentPathname };
    const parentHistory = { pushState: (_state: unknown, _title: string, path: string) => { parentLocation.pathname = path.split("?", 1)[0]; historyPaths.push(path); }, replaceState: (_state: unknown, _title: string, path: string) => { parentLocation.pathname = path.split("?", 1)[0]; historyPaths.push(path); } };
    Object.defineProperty(window, "parent", { configurable: true, value: { location: parentLocation, history: parentHistory, addEventListener: () => undefined } });
    Object.defineProperty(window, "frameElement", { configurable: true, value: {} });
  } else {
    Object.defineProperty(window, "parent", { configurable: true, value: window });
  }
  const context = { window, document: window.document, fetch: fetchImpl, ethereum, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, CSS: { escape: (value: string) => value }, history, location, navigator, TextEncoder, console, setTimeout, clearTimeout, setInterval: () => 0 } as Record<string, unknown>;
  const windowContext = { ...context };
  delete windowContext.history;
  delete windowContext.location;
  delete windowContext.navigator;
  Object.assign(window, windowContext, { LightweightCharts: { createChart: () => ({ addCandlestickSeries: () => ({ setData: (data: unknown[]) => chartData.push(data), }), timeScale: () => ({ fitContent: () => undefined }) }) } });
  vm.runInNewContext(bridge, context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { window, providerCalls, providerEvents, chartData, providerTransactions, historyPaths, clipboardWrites, storage };
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

test("wrong quote-token contract is rejected before any provider send", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const curve = "0x2222222222222222222222222222222222222222";
  const expectedQuote = "0x3333333333333333333333333333333333333333";
  const wrongQuote = "0x4444444444444444444444444444444444444444";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [{ token_name: "Real", symbol: "REAL", contract_address: token, quote_token: "USDT", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1, current_price_quote: "1", total_raised_quote: "1" }] }) };
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

test("native BNB quote accepts API chain aliases and keeps exact zero-sentinel binding", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const curve = "0x2222222222222222222222222222222222222222";
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [{ token_name: "Real", symbol: "REAL", contract_address: token, quote_token: "BNB", status: "deployed", submitted_at: new Date().toISOString(), progress_percent: 1 }] }) };
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

test("token details use a canonical address URL and copy the full contract address", async () => {
  const token = "0x5bae7612602aa6919246b056c2652f0922078888";
  const curve = "0x2222222222222222222222222222222222222222";
  const fixture = { token_name: "Pepe", symbol: "PEPE", contract_address: token, quote_token: "BNB", quote_token_address: null, curve_address: curve, status: "deployed", progress_percent: 0 };
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/detail?")) return { ok: true, json: async () => ({ data: fixture }) };
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [fixture] }) };
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
  const fixture = { token_name: "Pepe", symbol: "PEPE", creator_address: "0x3333333333333333333333333333333333333333", creator: "0x3333333333333333333333333333333333333333", contract_address: token, quote_token: "BNB", quote_token_address: null, curve_address: curve, status: "deployed", submitted_at: new Date().toISOString(), logo_url: logo, progress_percent: 12, current_price_quote: "0.000000000000000305", total_raised_quote: "0.25", tokens_sold: "819672.131147540983606557" };
  const trades = [
    { trader: fixture.creator, trade_type: "buy", quote_amount: "0.1", token_amount: "327868.852459016393442622", timestamp: now - 60 },
    { trader: "0x4444444444444444444444444444444444444444", trade_type: "sell", quote_amount: "0.05", token_amount: "163934.426229508196721311", timestamp: now },
  ];
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/detail?")) return { ok: true, json: async () => ({ data: fixture }) };
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [fixture] }) };
    if (url.includes("v1/pump/trades")) return { ok: true, json: async () => ({ data: trades }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    if (url.includes("buy-quote")) return { ok: true, json: async () => ({ data: { token_address: token, curve_address: curve, quote_token: "BNB", quote_token_address: "0x0000000000000000000000000000000000000000", chain_id: "0x38", quote_id: "q-real", expires_at: Math.floor(Date.now() / 1000) + 20, tokens_out: "1000000000000000000", min_out: "980000000000000000", slippage_bps: 200, fee_quote: "0.01", fee_rate_percent: "1.000000%" } }) };
    throw new Error(`unmocked ${url}`);
  };
  const app = await boot(response, { pathname: "/launchpad/bitbt-launch-ui-app.html", parentPathname: `/pump/${token}` });
  assert.equal(app.window.document.querySelector("[data-active-image]")?.getAttribute("src"), logo);
  assert.match(app.window.document.querySelector("[data-active-price]")?.textContent || "", /0\.000000000000000305 BNB/);
  assert.equal(app.window.document.querySelector("[data-active-trade-count]")?.textContent, "2");
  assert.equal(app.window.document.querySelector("[data-active-volume]")?.textContent, "0.15 BNB");
  assert.ok(app.chartData.flat().length > 0, "decimal trade amounts did not produce K-line candles");
  assert.ok(app.chartData.flat().every((point) => Object.values(point as Record<string, unknown>).every((value) => typeof value !== "number" || Number.isFinite(value))));
  for (const fake of ["$483K", "$35.2K", "6,062", "15.1%", "未发现高风险项"]) assert.equal((app.window.document.body.textContent || "").includes(fake), false, `prototype detail value leaked: ${fake}`);
  app.window.document.querySelector("[data-share-token]")?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(app.clipboardWrites.at(-1), `https://bitbt.fun/pump/${token}`);
  const beforeIntervals = app.chartData.length;
  app.window.document.querySelector('[data-chart-interval="60"]')?.dispatchEvent(new app.window.Event("click", { bubbles: true }));
  assert.ok(app.chartData.length > beforeIntervals, "K-line interval button did not redraw the chart");
  const amount = app.window.document.querySelector("#trade-amount") as HTMLInputElement;
  amount.value = "1";
  amount.dispatchEvent(new app.window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(app.window.document.querySelector("[data-quote-output]")?.textContent, "1 PEPE");
  assert.match(app.window.document.querySelector("[data-quote-fee]")?.textContent || "", /1\.000000% · 0\.01 BNB/);
});

test("a token without trades shows an explicit empty K-line instead of a permanent loading state", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const fixture = { token_name: "Empty", symbol: "EMPTY", contract_address: token, quote_token: "BNB", curve_address: "0x2222222222222222222222222222222222222222", status: "deployed", progress_percent: 0 };
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/pump/detail?")) return { ok: true, json: async () => ({ data: fixture }) };
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [fixture] }) };
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
      if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [{ symbol: "REAL", contract_address: token, quote_token: "BNB", status: "deployed" }] }) };
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
  const quoteAddresses = { BNB: "0x0000000000000000000000000000000000000000", USDT: "0x55d398326f99059fF775485246999027B3197955", USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", GW: "0x68985a6E02f80DE4d71732ca66E4e5d4e303965F" } as const;
  type PreparedFixture = { launch: { id: string; token_name: string; symbol: string; creator_address: string; quote_token: string; launch_settings?: Record<string, unknown> }; fee_wei: string; factory_address: string; fee_recipient: string; chain_id: string; salt: string; predicted_token_address: string; curve_address: string; migration_threshold_wei: string; quote_token_address: string; method: string };
  const prepared: PreparedFixture = { launch: { id: "launch-1", token_name: "Real Token", symbol: "REAL", creator_address: account, quote_token: "BNB" }, fee_wei: fee.fee_wei, factory_address: factory, fee_recipient: recipient, chain_id: "bsc", salt: `0x${"ab".repeat(32)}`, predicted_token_address: predicted, curve_address: curve, migration_threshold_wei: "6140000000000000000", quote_token_address: quoteAddresses.BNB, method: "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)" };
  const run = async (quote: keyof typeof quoteAddresses, mutate?: (value: typeof prepared) => typeof prepared, changeAfterLoad = false, receiptStatus = "0x1", sendRejects = 0, sendErrorCode?: number, nullHash = false, retryAfterReject = false, nativeBalance = 10n ** 19n, taxMode = false, backgroundRetry = false, customCurve = false, estimateRejects = 0, confirmFailures = 0, logoUploadFailures = 0, confirmFailureMode: "500" | "timeout" = "500") => {
    const curveMode = customCurve ? "custom" : "standard";
    const taxSettings = { antisniper: true, enable_tax: true, request_platform_lp: false, curve_mode: curveMode, buy_tax_rate: "3", sell_tax_rate: "5", funds_recipient_pct: "40", burn_pct: "20", holders_pct: "20", liquidity_pct: "20", min_dividend_balance: "100000", recipient_wallet: recipient };
    const quotePrepared = { ...prepared, launch: { ...prepared.launch, quote_token: quote, launch_settings: taxMode ? taxSettings : { antisniper: true, enable_tax: false, request_platform_lp: false, curve_mode: curveMode } }, quote_token_address: quoteAddresses[quote], method: taxMode ? "launchTaxTokenWithQuotePaid(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address))" : prepared.method };
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
      if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [] }) };
      if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { domain: "bitbt.fun", nonce: "n1" } }) };
      if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account } }) };
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
      for (const [id, value] of [["buy-tax-rate", "3"], ["sell-tax-rate", "5"], ["funds-recipient-pct", "40"], ["burn-pct", "20"], ["holders-pct", "20"], ["liquidity-pct", "20"], ["min-dividend-balance", "100000"], ["tax-recipient-wallet", recipient]]) (window.document.querySelector(`#${id}`) as HTMLInputElement).value = value;
    }
    window.document.querySelector(`[data-launch-quote="${quote}"]`)?.dispatchEvent(new window.Event("click", { bubbles: true }));
    window.document.querySelector("[data-open='create-review']")?.dispatchEvent(new window.Event("click", { bubbles: true }));
    const load = window.document.querySelector("[data-launch-load]") as HTMLButtonElement;
    const submit = window.document.querySelector("[data-launch-publish]") as HTMLButtonElement;
    assert.equal(load.disabled, false);
    assert.equal(submit.disabled, true);
    load.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const snapshotText = window.document.querySelector("[data-panel='create-review']")?.textContent || "";
    if (!mutate) { assert.match(snapshotText, /Real Token/); assert.match(snapshotText, /REAL/); assert.match(snapshotText, /Fresh launch story/); assert.match(snapshotText, new RegExp(quote)); assert.match(snapshotText, /0\.005 BNB/); }
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
  assert.deepEqual(taxed.prepareBody?.launch_settings, { antisniper: true, enable_tax: true, request_platform_lp: false, curve_mode: "standard", buy_tax_rate: "3", sell_tax_rate: "5", funds_recipient_pct: "40", burn_pct: "20", holders_pct: "20", liquidity_pct: "20", min_dividend_balance: "100000", recipient_wallet: recipient });
  assert.equal(String(taxed.providerTransactions[0]?.data).slice(0, 10), "0x4bec1297");
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
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [] }) };
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
  const response = async (input: string) => {
    const url = String(input);
    if (url.includes("v1/auth/siwe/session")) return { ok: true, json: async () => ({ data: { address: account, expires_in: 300 } }) };
    if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [] }) };
    if (url.includes("v1/app/config")) return { ok: true, json: async () => ({ data: { pump: {} } }) };
    throw new Error(`unmocked ${url}`);
  };
  const { window, providerEvents } = await boot(response, { account, session: { token: "session", address: account } });
  assert.equal(window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
  providerEvents.accountsChanged?.([account]);
  assert.equal(window.document.querySelector(".connect-global")?.textContent, "0x1111…1111");
});

test("production wallet bridge applies the fixed 0.05 Gwei policy and reports every tx state", () => {
  for (const marker of ["PRIORITY_FEE_WEI = 50_000_000n", "maxPriorityFeePerGas", "maxFeePerGas", "eth_getBlockByNumber", 'status: "pending"', 'status: "failed"']) assert.match(bridge, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  assert.match(bridge, /status: ok \? "success" : "failed"/);
  assert.match(bridge, /const send = async \(tx\)/);
  assert.doesNotMatch(bridge, /launchTokenSingleFlight[\\s\\S]*eth_sendTransaction/);
});

test("live tokens use API logo URLs and launch Logo upload is deferred until a successful receipt", () => {
  assert.match(bridge, /logo_url \|\| token\?\.image_url \|\| token\?\.logo/);
  for (const marker of ["token-logo-file", "/api/pump/v1/upload/image", "dataset.launchLogoSelection", "bitbtUploadSelectedLaunchLogo", "发币成功后上传", "bitbt:launch-reset"]) assert.match(logoUpload, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(bridge, /receipt\.status[\s\S]*rememberLaunchConfirmation/);
  assert.match(bridge, /const confirmSuccessfulLaunch[\s\S]*bitbtUploadSelectedLaunchLogo[\s\S]*logo_url: pending\.confirmedLogoUrl/);
  assert.doesNotMatch(bridge, /prepare-launch[\s\S]{0,700}logo_url/);
  assert.match(html, /img-src 'self' https:\/\/\*\.amazonaws\.com https:\/\/\*\.cloudfront\.net data:/);
});

test("logo file chooser is enabled inside the production wallet iframe", () => {
  assert.match(walletShell, /sandbox="allow-scripts allow-same-origin allow-forms"/);
  assert.match(html, /id="token-logo-file" type="file"/);
  assert.match(html, /data-launch-file/);
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
  assert.match(nextConfig, /\/:locale\/pump\/:address/);
  assert.match(shell, /src="\/launchpad\/bitbt-launch-ui-app\.html"/);
  assert.match(html, /<base href="\/launchpad\/">/);
  for (const script of ["launch-logo-upload.js", "launchpad-live.js"]) {
    assert.match(html, new RegExp(`<script src="\\./${script.replaceAll(".", "\\.")}">`));
    assert.match(nextConfig, new RegExp(`/:locale/${script.replaceAll(".", "\\.")}`));
  }
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
});

test("all launch entry points are wallet-gated until SIWE connection succeeds", () => {
  for (const marker of ["setLaunchAvailability", "data-open=\"create-mode\"", "data-nav=\"create-mode\"", "data-launch-mode", "wallet-gated", "请先连接并验证钱包"]) assert.match(bridge + html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /BitBT Pump/);
  assert.doesNotMatch(html, /BitBT LAUNCH/);
  assert.equal((html.match(/class="connect-global"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="connect"/);
});

test("web launch exposes quote, metadata, and on-chain DEX transfer-tax configuration", () => {
  for (const quote of ["BNB", "USDT", "USDC", "GW"]) assert.match(html, new RegExp(`data-launch-quote="${quote}"`));
  for (const id of ["token-classification", "token-twitter", "token-telegram", "token-website", "token-discord"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const field of ["classification", "twitter", "telegram", "website", "discord", "launch_settings", "antisniper", "enable_tax", "request_platform_lp"]) assert.match(bridge, new RegExp(field));
  for (const mode of ["fair", "custom", "community"]) assert.match(html, new RegExp(`data-launch-mode="${mode}"`));
  for (const marker of ["migration-threshold-quote", "data-custom-curve-fields", "data-curve-mode=\"custom\"", "标准目标的 50%–200%", "社区收益代币", "链上执行"]) assert.match(html, new RegExp(marker));
  for (const id of ["buy-tax-rate", "sell-tax-rate", "funds-recipient-pct", "burn-pct", "holders-pct", "liquidity-pct", "min-dividend-balance", "tax-recipient-wallet"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const marker of ["launchTaxTokenWithQuotePaid", "0x4bec1297", "launchTaxConfig", "data-tax-mode", "data-tax-fields", "买入和卖出税率必须在 1%–10%", "税费分配比例合计必须为 100%", "发币准备方法与税费模式不匹配"]) assert.match(bridge + html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const marker of ["launchCurveTarget", "migration_threshold_quote", "curve_mode", "setCurveMode", "setTaxMode", "链上 Factory 状态已变化，参数已自动更新"]) assert.match(bridge, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /迁移 PancakeSwap 后对 Pair 买卖持续执行所选税率/);
  assert.match(html, /当前链上交易不包含初始买入/);
  assert.doesNotMatch(html, /预计获得 16\.84M MOON/);
});

test("Pump startup renders from the token list and loads detail only for the selected token", () => {
  assert.doesNotMatch(bridge, /loadAllDetails/);
  assert.doesNotMatch(bridge, /api\("v1\/pump\/details"\)/);
  assert.match(bridge, /state\.details\[address\]/);
  assert.match(bridge, /v1\/pump\/detail\?address/);
  assert.match(bridge, /v1\/pump\/trades\?token_address/);
  assert.match(proxy, /v1\/pump\/details/);
});

test("Pump polling refreshes selected trades every cycle but batches full market refreshes", () => {
  assert.match(bridge, /refreshSelectedTrades/);
  assert.match(bridge, /refreshCycle % 2 === 0 \? refreshLive\(\) : refreshSelectedTrades\(\)/);
  assert.match(bridge, /loadDetail\(state\.selected, \{ refreshBalance: false \}\)/);
  assert.match(bridge, /if \(!state\.trades\.length\).*charts\.delete\(selector\)/);
});

test("Pump proxy hides wallet RPC credentials and protects every write endpoint", () => {
  assert.match(proxy, /delete payload\.data\.rpc/);
  assert.match(proxy, /delete payload\.data\.rpcFallback/);
  assert.match(proxy, /SIWE_WRITE_ENDPOINTS/);
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
