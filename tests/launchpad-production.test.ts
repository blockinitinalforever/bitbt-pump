import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

const root = path.resolve(process.cwd());
const html = fs.readFileSync(path.join(root, "public/launchpad/bitbt-launch-ui-app.html"), "utf8");
const bridge = fs.readFileSync(path.join(root, "public/launchpad/launchpad-live.js"), "utf8");

const boot = async (fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>) => {
  const { window } = parseHTML(html);
  const storage = new Map<string, string>();
  const providerCalls: string[] = [];
  const ethereum = { request: async ({ method }: { method: string }) => { providerCalls.push(method); if (method === "eth_accounts") return []; if (method === "eth_chainId") return "0x38"; throw new Error(`unexpected provider call: ${method}`); }, on: () => undefined };
  const context = { window, document: window.document, fetch: fetchImpl, ethereum, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, CSS: { escape: (value: string) => value }, history: { replaceState: () => undefined }, TextEncoder, console, setTimeout, clearTimeout, setInterval: () => 0 } as Record<string, unknown>;
  Object.assign(window, context, { LightweightCharts: { createChart: () => ({ addCandlestickSeries: () => ({ setData: () => undefined }), timeScale: () => ({ fitContent: () => undefined }) }) } });
  vm.runInNewContext(bridge, context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { window, providerCalls };
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

test("bridge contains provider-state and quote binding guards", () => {
  for (const marker of ["accountsChanged", "chainChanged", "assertProviderState", "quoteTokenAddress", "quoteId", "expiresAt", "minOut", "renderUnavailable"]) assert.match(bridge, new RegExp(marker));
  assert.equal(bridge.includes("state.quote = response"), false);
  assert.equal(bridge.includes("Math.sin"), false);
});
