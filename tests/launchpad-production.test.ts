import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

const root = path.resolve(process.cwd());
const html = fs.readFileSync(path.join(root, "public/launchpad/bitbt-launch-ui-app.html"), "utf8");
const bridge = fs.readFileSync(path.join(root, "public/launchpad/launchpad-live.js"), "utf8");

type BootOptions = { account?: string; chainId?: string | number };

const boot = async (fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>, options: BootOptions = {}) => {
  const { window } = parseHTML(html);
  const storage = new Map<string, string>();
  const providerCalls: string[] = [];
  const providerTransactions: Array<Record<string, unknown>> = [];
  const providerEvents: Record<string, (value: unknown) => void> = {};
  const chartData: unknown[][] = [];
  const account = options.account || "";
  const ethereum = { request: async ({ method, params }: { method: string; params?: Array<Record<string, unknown>> }) => { providerCalls.push(method); if (method === "eth_accounts" || method === "eth_requestAccounts") return account ? [account] : []; if (method === "eth_chainId") return options.chainId ?? "0x38"; if (method === "wallet_switchEthereumChain" || method === "personal_sign") return method === "personal_sign" ? "0xsigned" : null; if (method === "eth_sendTransaction") { if (params?.[0]) providerTransactions.push(params[0]); return "0xlaunch"; } if (method === "eth_getTransactionReceipt") return { status: "0x1" }; throw new Error(`unexpected provider call: ${method}`); }, on: (event: string, callback: (value: unknown) => void) => { providerEvents[event] = callback; } };
  const context = { window, document: window.document, fetch: fetchImpl, ethereum, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, CSS: { escape: (value: string) => value }, history: { replaceState: () => undefined }, TextEncoder, console, setTimeout, clearTimeout, setInterval: () => 0 } as Record<string, unknown>;
  Object.assign(window, context, { LightweightCharts: { createChart: () => ({ addCandlestickSeries: () => ({ setData: (data: unknown[]) => chartData.push(data), }), timeScale: () => ({ fitContent: () => undefined }) }) } });
  vm.runInNewContext(bridge, context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { window, providerCalls, providerEvents, chartData, providerTransactions };
};

test("production HTML boots with API failure without exposing prototype financial data", async () => {
  const { window } = await boot(async () => { throw new Error("API unavailable"); });
  const body = window.document.body.textContent || "";
  for (const sample of ["842.63", "1,284", "18.6M", "64,812,904", "AGENT404", "2.84M LIVE TOKEN", "12,842", "$0.000721", "0.005 BNB"]) assert.equal(body.includes(sample), false, `sample financial data leaked after API failure: ${sample}`);
  assert.match(body, /实时 Pump 数据暂不可用/);
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
  const quoteAddresses = { BNB: "0x0000000000000000000000000000000000000000", USDT: "0x55d398326f99059fF775485246999027B3197955" } as const;
  type PreparedFixture = { launch: { id: string; token_name: string; symbol: string; creator_address: string; quote_token: string }; fee_wei: string; factory_address: string; fee_recipient: string; chain_id: string; salt: string; predicted_token_address: string; curve_address: string; migration_threshold_wei: string; quote_token_address: string; method: string };
  const prepared: PreparedFixture = { launch: { id: "launch-1", token_name: "Real Token", symbol: "REAL", creator_address: account, quote_token: "BNB" }, fee_wei: fee.fee_wei, factory_address: factory, fee_recipient: recipient, chain_id: "bsc", salt: `0x${"ab".repeat(32)}`, predicted_token_address: predicted, curve_address: curve, migration_threshold_wei: "6140000000000000000", quote_token_address: quoteAddresses.BNB, method: "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)" };
  const run = async (quote: keyof typeof quoteAddresses, mutate?: (value: typeof prepared) => typeof prepared) => {
    const quotePrepared = { ...prepared, launch: { ...prepared.launch, quote_token: quote }, quote_token_address: quoteAddresses[quote] };
    let sendCount = 0;
    let prepareBody: Record<string, unknown> | undefined;
    const fetchUrls: string[] = [];
    const response = async (input: string, init?: RequestInit) => {
      const url = String(input);
      fetchUrls.push(url);
      if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [] }) };
      if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { domain: "bitbt.fun", nonce: "n1" } }) };
      if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account } }) };
      if (url.includes("v1/token/launch-fee")) return { ok: true, json: async () => ({ data: fee }) };
      if (url.includes("v1/token/prepare-launch")) { prepareBody = JSON.parse(String(init?.body || "{}")); return { ok: true, json: async () => ({ data: mutate ? mutate(quotePrepared) : quotePrepared }) }; }
      if (url.includes("v1/token/launch")) return { ok: true, json: async () => ({ data: { status: "deployed", contract_address: predicted } }) };
      throw new Error(`unmocked ${url}`);
    };
    const { window, providerCalls, providerTransactions } = await boot(response, { account });
    const name = window.document.querySelector("#token-name") as HTMLInputElement;
    const symbol = window.document.querySelector("#token-symbol") as HTMLInputElement;
    name.value = "Real Token";
    symbol.value = "REAL";
    window.document.querySelector(`[data-launch-quote="${quote}"]`)?.dispatchEvent(new window.Event("click", { bubbles: true }));
    window.document.querySelector("[data-open='create-review']")?.dispatchEvent(new window.Event("click", { bubbles: true }));
    const submit = window.document.querySelector("[data-panel='create-review'] .primary") as HTMLButtonElement;
    submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const snapshotText = window.document.querySelector("[data-panel='create-review']")?.textContent || "";
    if (!mutate) { assert.match(snapshotText, /Real Token/); assert.match(snapshotText, /REAL/); assert.match(snapshotText, new RegExp(quote)); assert.match(snapshotText, /5000000000000000/); }
    assert.equal(providerCalls.includes("eth_sendTransaction"), false);
    submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    sendCount = providerCalls.filter((method) => method === "eth_sendTransaction").length;
    return { sendCount, providerCalls, providerTransactions, prepareBody, body: window.document.body.textContent, fetchUrls };
  };
  for (const quote of Object.keys(quoteAddresses) as Array<keyof typeof quoteAddresses>) {
    const result = await run(quote);
    assert.equal(result.sendCount, 1, `launch quote ${quote} did not send; request=${JSON.stringify(result.prepareBody)} calls=${result.providerCalls.join(",")} fetch=${result.fetchUrls.join(",")} body=${result.body?.slice(-200)}`);
    assert.equal(result.prepareBody?.quote_token, quote);
    assert.equal(result.prepareBody?.chain_id, "bsc");
    assert.equal(result.providerTransactions[0]?.value, "0x11c37937e08000");
    assert.equal(result.providerTransactions[0]?.data?.toString().includes(quoteAddresses[quote].slice(2).toLowerCase()), true);
  }
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

test("bridge contains provider-state and quote binding guards", () => {
  for (const marker of ["accountsChanged", "chainChanged", "assertProviderState", "normalizeChainId", "quoteTokenAddress", "quoteId", "expiresAt", "minOut", "state.busy", "launchBusy", "assertLaunchBinding", "disabled", "renderUnavailable"]) assert.match(bridge, new RegExp(marker));
  assert.equal(bridge.includes("state.quote = response"), false);
  assert.equal(bridge.includes("Math.sin"), false);
});
