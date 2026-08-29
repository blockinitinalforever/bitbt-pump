import test from "node:test";
import assert from "node:assert/strict";
import { getDynamicFeePolicy, parseUnits, receiptSucceeded, sendTransaction, switchToBsc, waitForReceipt, type EvmWallet } from "../src/lib/pump-chain.ts";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("mock EIP-1193 wallet signs, broadcasts and confirms a 0.05 BNB buy budget", async () => {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  const wallet: EvmWallet = {
    request: async (args) => {
      calls.push(args);
      if (args.method === "wallet_switchEthereumChain" || args.method === "eth_chainId") return args.method === "eth_chainId" ? "0x38" : null;
      if (args.method === "eth_sendTransaction") return HASH;
      if (args.method === "eth_getTransactionReceipt") return { status: "0x1", transactionHash: HASH };
      throw new Error(`Unexpected wallet method: ${args.method}`);
    },
  };
  const timerGlobal = globalThis as typeof globalThis & { window: { setTimeout: typeof setTimeout } };
  timerGlobal.window = { setTimeout } as unknown as Window & typeof globalThis & { setTimeout: typeof setTimeout };
  await switchToBsc(wallet);
  const hash = await sendTransaction(wallet, { from: ADDRESS, to: ADDRESS, value: parseUnits("0.05"), gas: 300000n, maxPriorityFeePerGas: 50_000_000n, maxFeePerGas: 2_050_000_000n });
  const receipt = await waitForReceipt(wallet, hash);
  assert.equal(hash, HASH);
  assert.equal(receiptSucceeded(receipt), true);
  const transaction = calls.find((call) => call.method === "eth_sendTransaction")?.params?.[0] as Record<string, string>;
  assert.equal(transaction.value, "0xb1a2bc2ec50000");
  assert.equal(transaction.maxPriorityFeePerGas, "0x2faf080");
  assert.equal(transaction.maxFeePerGas, "0x7a308480");
});

test("mock wallet exposes a failed receipt as a failed trade", () => {
  assert.equal(receiptSucceeded({ status: "0x0" }), false);
});

test("fixed priority fee policy uses the requested 0.05 gwei and latest base fee", async () => {
  const wallet: EvmWallet = { request: async ({ method }) => {
    if (method === "eth_maxPriorityFeePerGas") return "0x77359400";
    if (method === "eth_getBlockByNumber") return { baseFeePerGas: "0xb2d05e00" };
    throw new Error("unexpected RPC");
  } };
  const fee = await getDynamicFeePolicy(wallet, 50_000_000n);
  assert.equal(fee.maxPriorityFeePerGas, 50_000_000n);
  assert.equal(fee.maxFeePerGas, 6_050_000_000n);
});
