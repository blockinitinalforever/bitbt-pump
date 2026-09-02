import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { validateClaim } from "./claim-validation.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const apiBase = required("BITBT_PUMP_API_URL").replace(/\/$/, "");
const apiKey = required("BITBT_PUMP_API_KEY");
const rpcUrl = required("RPC_BSC");
const privateKey = required("PUMP_VAULT_KEEPER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("PUMP_VAULT_KEEPER_PRIVATE_KEY is invalid");

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: bsc, transport: http(rpcUrl) });
const intervalMs = Math.max(15_000, Number(process.env.PUMP_VAULT_KEEPER_INTERVAL_MS || 60_000));
let running = false;

async function loadQueue() {
  const response = await fetch(`${apiBase}/api/v1/pump/vaults/keeper/queue`, {
    headers: { accept: "application/json", "x-api-key": apiKey },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `Keeper queue HTTP ${response.status}`);
  if (String(payload.data?.chain_id || "").toLowerCase() !== "0x38") throw new Error("Keeper queue returned an unexpected chain");
  return {
    entries: Array.isArray(payload.data?.entries) ? payload.data.entries : [],
    threshold: BigInt(payload.data?.threshold_wei || "0"),
    chainId: "0x38",
  };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const queue = await loadQueue();
    for (const entry of queue.entries) {
      const validated = validateClaim(entry, queue.threshold, queue.chainId);
      if (!validated) {
        console.error(JSON.stringify({ event: "vault_distribution_rejected", vault: entry?.vault_address, reason: "queue transaction binding mismatch" }));
        continue;
      }
      const { transaction, vault, recipient } = validated;
      try {
        const hash = await walletClient.sendTransaction({
          account,
          to: transaction.to,
          data: transaction.data,
          value: BigInt(transaction.value || "0x0"),
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
        console.log(JSON.stringify({ event: "vault_distribution", vault, recipient, hash, status: receipt.status }));
      } catch (error) {
        console.error(JSON.stringify({ event: "vault_distribution_failed", vault, recipient, error: String(error?.shortMessage || error?.message || error) }));
      }
    }
  } finally {
    running = false;
  }
}

console.log(JSON.stringify({ event: "keeper_started", address: account.address, interval_ms: intervalMs }));
await tick();
setInterval(() => tick().catch((error) => console.error(error)), intervalMs);
