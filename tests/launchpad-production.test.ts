import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

const root = path.resolve(process.cwd());
const html = fs.readFileSync(path.join(root, "public/launchpad/bitbt-launch-ui-app.html"), "utf8");
const walletShell = fs.readFileSync(path.join(root, "public/launchpad/bitbt-wallet-ui.html"), "utf8");
const bridge = fs.readFileSync(path.join(root, "public/launchpad/launchpad-live.js"), "utf8");
const logoUpload = fs.readFileSync(path.join(root, "public/launchpad/launch-logo-upload.js"), "utf8");
const proxy = fs.readFileSync(path.join(root, "src/app/api/pump/[...path]/route.ts"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

type BootOptions = { account?: string; chainId?: string | number; receiptStatus?: string; sendRejects?: number; sendErrorCode?: number; nullHash?: boolean; nativeBalance?: bigint; estimatedGas?: bigint; session?: { token: string; address: string; expiresIn?: number } };

const boot = async (fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>, options: BootOptions = {}) => {
  const { window } = parseHTML(html);
  const storage = new Map<string, string>();
  if (options.session) {
    storage.set("bitbt_pump_session", options.session.token);
    storage.set("bitbt_pump_session_address", options.session.address.toLowerCase());
  }
  const providerCalls: string[] = [];
  const providerTransactions: Array<Record<string, unknown>> = [];
  const providerEvents: Record<string, (value: unknown) => void> = {};
  const chartData: unknown[][] = [];
  const account = options.account || "";
  let sendRejectsRemaining = options.sendRejects ?? 0;
  const ethereum = { request: async ({ method, params }: { method: string; params?: Array<Record<string, unknown>> }) => { providerCalls.push(method); if (method === "eth_accounts" || method === "eth_requestAccounts") return account ? [account] : []; if (method === "eth_chainId") return options.chainId ?? "0x38"; if (method === "wallet_switchEthereumChain" || method === "personal_sign") return method === "personal_sign" ? "0xsigned" : null; if (method === "eth_getBalance") return `0x${(options.nativeBalance ?? 10n ** 19n).toString(16)}`; if (method === "eth_getBlockByNumber") return { baseFeePerGas: "0x3b9aca00" }; if (method === "eth_estimateGas") return `0x${(options.estimatedGas ?? 2_000_000n).toString(16)}`; if (method === "eth_sendTransaction") { if (sendRejectsRemaining > 0) { sendRejectsRemaining -= 1; const error = new Error("Provider rejected the request") as Error & { code?: number }; error.code = options.sendErrorCode; throw error; } if (options.nullHash) return null; if (params?.[0]) providerTransactions.push(params[0]); return "0xlaunch"; } if (method === "eth_getTransactionReceipt") return { status: options.receiptStatus ?? "0x1" }; throw new Error(`unexpected provider call: ${method}`); }, on: (event: string, callback: (value: unknown) => void) => { providerEvents[event] = callback; } };
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
  type PreparedFixture = { launch: { id: string; token_name: string; symbol: string; creator_address: string; quote_token: string }; fee_wei: string; factory_address: string; fee_recipient: string; chain_id: string; salt: string; predicted_token_address: string; curve_address: string; migration_threshold_wei: string; quote_token_address: string; method: string };
  const prepared: PreparedFixture = { launch: { id: "launch-1", token_name: "Real Token", symbol: "REAL", creator_address: account, quote_token: "BNB" }, fee_wei: fee.fee_wei, factory_address: factory, fee_recipient: recipient, chain_id: "bsc", salt: `0x${"ab".repeat(32)}`, predicted_token_address: predicted, curve_address: curve, migration_threshold_wei: "6140000000000000000", quote_token_address: quoteAddresses.BNB, method: "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)" };
  const run = async (quote: keyof typeof quoteAddresses, mutate?: (value: typeof prepared) => typeof prepared, changeAfterLoad = false, receiptStatus = "0x1", sendRejects = 0, sendErrorCode?: number, nullHash = false, retryAfterReject = false, nativeBalance = 10n ** 19n) => {
    const quotePrepared = { ...prepared, launch: { ...prepared.launch, quote_token: quote }, quote_token_address: quoteAddresses[quote] };
    let sendCount = 0;
    let prepareCount = 0;
    let prepareBody: Record<string, unknown> | undefined;
    const fetchUrls: string[] = [];
    const response = async (input: string, init?: RequestInit) => {
      const url = String(input);
      fetchUrls.push(url);
      if (url.includes("v1/pump/tokens")) return { ok: true, json: async () => ({ data: [] }) };
      if (url.includes("v1/auth/siwe/nonce")) return { ok: true, json: async () => ({ data: { domain: "bitbt.fun", nonce: "n1" } }) };
      if (url.includes("v1/auth/siwe/verify")) return { ok: true, json: async () => ({ data: { token: "session", address: account } }) };
      if (url.includes("v1/token/launch-fee")) return { ok: true, json: async () => ({ data: fee }) };
      if (url.includes("v1/token/prepare-launch")) { prepareCount += 1; prepareBody = JSON.parse(String(init?.body || "{}")); return { ok: true, json: async () => ({ data: mutate ? mutate(quotePrepared) : quotePrepared }) }; }
      if (url.includes("v1/token/launch")) return { ok: true, json: async () => ({ data: { status: "deployed", contract_address: predicted } }) };
      throw new Error(`unmocked ${url}`);
    };
    const { window, providerCalls, providerTransactions } = await boot(response, { account, receiptStatus, sendRejects, sendErrorCode, nullHash, nativeBalance });
    const name = window.document.querySelector("#token-name") as HTMLInputElement;
    const symbol = window.document.querySelector("#token-symbol") as HTMLInputElement;
    name.value = "Real Token";
    symbol.value = "REAL";
    (window.document.querySelector("#token-story") as HTMLTextAreaElement).value = "Fresh launch story";
    window.document.querySelector(`[data-launch-quote="${quote}"]`)?.dispatchEvent(new window.Event("click", { bubbles: true }));
    window.document.querySelector("[data-open='create-review']")?.dispatchEvent(new window.Event("click", { bubbles: true }));
    const load = window.document.querySelector("[data-launch-load]") as HTMLButtonElement;
    const submit = window.document.querySelector("[data-launch-publish]") as HTMLButtonElement;
    assert.equal(load.disabled, false);
    assert.equal(submit.disabled, true);
    load.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const snapshotText = window.document.querySelector("[data-panel='create-review']")?.textContent || "";
    if (!mutate) { assert.match(snapshotText, /Real Token/); assert.match(snapshotText, /REAL/); assert.match(snapshotText, /Fresh launch story/); assert.match(snapshotText, new RegExp(quote)); assert.match(snapshotText, /5000000000000000/); }
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
      return { sendCount: providerCalls.filter((method) => method === "eth_sendTransaction").length, prepareCount, providerCalls, providerTransactions, prepareBody, body: window.document.body.textContent, fetchUrls };
    }
    submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    if (!sendRejects) submit.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    sendCount = providerCalls.filter((method) => method === "eth_sendTransaction").length;
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
    return { sendCount, prepareCount, providerCalls, providerTransactions, prepareBody, body: window.document.body.textContent, fetchUrls };
  };
  for (const quote of Object.keys(quoteAddresses) as Array<keyof typeof quoteAddresses>) {
    const result = await run(quote);
    assert.equal(result.sendCount, 1, `launch quote ${quote} did not send; request=${JSON.stringify(result.prepareBody)} calls=${result.providerCalls.join(",")} fetch=${result.fetchUrls.join(",")} body=${result.body?.slice(-200)}`);
    assert.equal(result.prepareCount, 1, `launch quote ${quote} was prepared more than once`);
    assert.equal(result.prepareBody?.quote_token, quote);
    assert.equal(result.prepareBody?.chain_id, "bsc");
    assert.deepEqual(result.prepareBody?.launch_settings, { antisniper: true, enable_tax: false, request_platform_lp: false });
    assert.equal(result.providerTransactions[0]?.value, "0x11c37937e08000");
    assert.equal(result.providerTransactions[0]?.gas, "0x249f00");
    assert.equal(result.providerTransactions[0]?.data?.toString().includes(quoteAddresses[quote].slice(2).toLowerCase()), true);
  }
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

test("live tokens use API logo URLs and the launch form uploads Logo to S3 before prepare", () => {
  assert.match(bridge, /logo_url \|\| token\?\.image_url \|\| token\?\.logo/);
  for (const marker of ["token-logo-file", "/api/pump/v1/upload/image", "dataset.launchLogoUrl", "logo_url", "已上传到 S3", "bitbt:launch-reset"]) assert.match(logoUpload, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(bridge, /dataset\.launchLogoUrl/);
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

const exerciseLogoUpload = async (file: { name: string; size: number; type: string }, fetchImpl: (input: string, init?: RequestInit) => Promise<unknown>, session = "session") => {
  const { window } = parseHTML(html);
  const input = window.document.querySelector("#token-logo-file") as HTMLInputElement;
  const toasts: string[] = [];
  let reads = 0;
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
  return { toasts, reads };
};

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
  const result = await exerciseLogoUpload({ name: "logo.jpg", size: 1024, type: "image/jpeg" }, async () => ({ ok: false, status: 413, text: async () => "<html>Request Entity Too Large</html>" }));
  assert.deepEqual(result.toasts, ["图片不能超过 5MB，请压缩后重新选择"]);
});

test("logo upload converts a network interruption into a retry prompt", async () => {
  const result = await exerciseLogoUpload({ name: "logo.webp", size: 1024, type: "image/webp" }, async () => { throw new Error("Failed to fetch"); });
  assert.deepEqual(result.toasts, ["网络连接中断，请检查网络后重试"]);
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
  for (const script of ["launch-logo-upload.js", "launchpad-live.js"]) {
    assert.match(html, new RegExp(`<script src="\\./${script.replaceAll(".", "\\.")}">`));
    assert.match(nextConfig, new RegExp(`/:locale/${script.replaceAll(".", "\\.")}`));
  }
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

test("web launch exposes the App quote and metadata fields but disables unsupported on-chain promises", () => {
  for (const quote of ["BNB", "USDT", "USDC", "GW"]) assert.match(html, new RegExp(`data-launch-quote="${quote}"`));
  for (const id of ["token-classification", "token-twitter", "token-telegram", "token-website", "token-discord"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const field of ["classification", "twitter", "telegram", "website", "discord", "launch_settings", "antisniper", "enable_tax", "request_platform_lp"]) assert.match(bridge, new RegExp(field));
  assert.match(html, /自定义联合曲线[\s\S]{0,300}开发中/);
  assert.match(html, /税费代币 · 开发中/);
  assert.match(html, /当前链上交易不包含初始买入/);
  assert.doesNotMatch(html, /预计获得 16\.84M MOON/);
});

test("Pump startup uses the batch details endpoint instead of an N+1 detail request", () => {
  assert.match(bridge, /v1\/pump\/details/);
  assert.match(bridge, /loadAllDetails/);
  assert.match(bridge, /state\.details\[address\]/);
  assert.match(bridge, /v1\/pump\/trades\?token_address/);
  assert.match(proxy, /v1\/pump\/details/);
});

test("Pump polling refreshes selected trades every cycle but batches full market refreshes", () => {
  assert.match(bridge, /refreshSelectedTrades/);
  assert.match(bridge, /refreshCycle % 2 === 0 \? refreshLive\(\) : refreshSelectedTrades\(\)/);
  assert.match(bridge, /loadDetail\(state\.selected, \{ refreshBalance: false \}\)/);
  assert.match(bridge, /if \(!state\.trades\.length\).*charts\.delete\(selector\)/);
});

test("Pump proxy hides wallet RPC credentials and protects uploads", () => {
  assert.match(proxy, /delete payload\.data\.rpc/);
  assert.match(proxy, /delete payload\.data\.rpcFallback/);
  assert.match(proxy, /SIWE session required for image upload/);
  assert.match(proxy, /request\.headers\.get\("authorization"\)\?\.startsWith\("Bearer "\)/);
  assert.match(proxy, /export async function HEAD/);
});

test("prototype UI stays hidden until real-data cleanup has run", () => {
  assert.match(html, /<body class="runtime-pending">/);
  assert.match(html, /body\.runtime-pending #bitbt-launch\{visibility:hidden\}/);
  assert.match(bridge, /clearPrototype\(\); document\.body\.classList\.remove\("runtime-pending"\)/);
});
