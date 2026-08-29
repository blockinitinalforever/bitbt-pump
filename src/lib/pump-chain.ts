export type EvmWallet = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type TxReceipt = { status?: string; transactionHash?: string };

export const BSC_CHAIN_ID = "0x38";
export const PUMP_SELECTORS = {
  buy: "0xd96a094a",
  sell: "0xd79875eb",
  buyWithQuote: "0x6818735c",
  sellForQuote: "0x5969261f",
} as const;

const CURVE_TOKEN = "0xfc0c546a";
const CURVE_QUOTE_TOKEN = "0x217a4b70";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function getPumpQuickAmounts(side: "buy" | "sell", quoteToken?: string): string[] {
  if (side === "sell" || !quoteToken) return [];
  return quoteToken.trim().toUpperCase() === "BNB" ? ["0.01", "0.05", "0.1", "0.5"] : ["10", "50", "100", "500"];
}

export function resolvePumpCurveAddress(detailCurve?: string, quoteCurve?: string): string {
  const detail = detailCurve?.trim() || "";
  const quote = quoteCurve?.trim() || "";
  if (detail && quote && detail.toLowerCase() !== quote.toLowerCase()) throw new Error("Quote does not match the selected Pump curve");
  const resolved = detail || quote;
  if (!isAddress(resolved)) throw new Error("Pump curve address is unavailable or invalid");
  return resolved;
}

export function readAddress(result: unknown): string {
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result)) throw new Error("Invalid RPC address response");
  return `0x${result.slice(-40)}`;
}

export function assertPumpQuoteBinding(args: {
  selectedTokenAddress: string;
  detailTokenAddress?: string;
  detailCurveAddress?: string;
  quoteCurveAddress: string;
  quoteToken: string;
  detailQuoteToken: string;
  quoteTokenAddress?: string;
  onChainTokenAddress: string;
  onChainQuoteTokenAddress: string;
}): void {
  const selected = checksumAddress(args.selectedTokenAddress).toLowerCase();
  const detailToken = args.detailTokenAddress?.trim();
  if (detailToken && checksumAddress(detailToken).toLowerCase() !== selected) throw new Error("Pump detail does not match the selected token");
  const curve = resolvePumpCurveAddress(args.detailCurveAddress, args.quoteCurveAddress).toLowerCase();
  if (curve !== checksumAddress(args.quoteCurveAddress).toLowerCase()) throw new Error("Quote curve binding is invalid");
  if (args.quoteToken.trim().toUpperCase() !== args.detailQuoteToken.trim().toUpperCase()) throw new Error("Quote token does not match the selected Pump token");
  const expectedQuote = getQuoteTokenAddress(args.detailQuoteToken) || ZERO_ADDRESS;
  if (args.quoteTokenAddress && checksumAddress(args.quoteTokenAddress).toLowerCase() !== expectedQuote.toLowerCase()) throw new Error("Quote token contract does not match the selected Pump token");
  if (checksumAddress(args.onChainTokenAddress).toLowerCase() !== selected) throw new Error("Pump curve is bound to a different token");
  if (checksumAddress(args.onChainQuoteTokenAddress).toLowerCase() !== expectedQuote.toLowerCase()) throw new Error("Pump curve quote token does not match the selected Pump token");
}

export const QUOTE_TOKEN_ADDRESSES: Record<string, string | null> = {
  BNB: null,
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  GW: "0x68985a6E02f80DE4d71732ca66E4e5d4e303965F",
};

export function isSupportedQuoteToken(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(QUOTE_TOKEN_ADDRESSES, symbol.trim().toUpperCase());
}

export function getQuoteTokenAddress(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase();
  if (!isSupportedQuoteToken(normalized)) throw new Error(`Unsupported Pump quote token: ${symbol}`);
  return QUOTE_TOKEN_ADDRESSES[normalized];
}

const ERC20_ALLOWANCE = "0xdd62ed3e";
const ERC20_APPROVE = "0x095ea7b3";
const ERC20_BALANCE_OF = "0x70a08231";

function cleanHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function checksumAddress(value: string): string {
  if (!isAddress(value)) throw new Error("Invalid EVM address");
  return value;
}

export function word(value: bigint): string {
  if (value < 0n || value > (1n << 256n) - 1n) throw new Error("Value is outside uint256 range");
  return value.toString(16).padStart(64, "0");
}

export function addressWord(value: string): string {
  return cleanHex(checksumAddress(value)).toLowerCase().padStart(64, "0");
}

export function parseUnits(value: string, decimals = 18): bigint {
  const clean = value.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("Enter a valid positive amount");
  const [whole, fraction = ""] = clean.split(".");
  if (fraction.length > decimals || (whole === "0" && /^0+$/.test(fraction))) throw new Error("Amount must be greater than zero and use supported precision");
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (result <= 0n) throw new Error("Amount must be greater than zero and use supported precision");
  return result;
}

export function formatUnits(value: bigint, decimals = 18, maxFraction = 6): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function readUint256(result: unknown): bigint {
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) throw new Error("Invalid RPC uint256 response");
  return BigInt(result);
}

export async function switchToBsc(wallet: EvmWallet): Promise<string> {
  await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
  const chainId = await wallet.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() !== BSC_CHAIN_ID) throw new Error("Wallet is not connected to BNB Chain");
  return BSC_CHAIN_ID;
}

export async function getDynamicFeePolicy(wallet: EvmWallet, requestedPriority: bigint): Promise<{ maxPriorityFeePerGas: bigint; maxFeePerGas: bigint }> {
  const fallbackBase = 2_000_000_000n;
  try {
    const latestBlock = await wallet.request({ method: "eth_getBlockByNumber", params: ["latest", false] });
    const block = latestBlock && typeof latestBlock === "object" ? latestBlock as { baseFeePerGas?: unknown } : {};
    const baseFee = block.baseFeePerGas === undefined ? 0n : readUint256(block.baseFeePerGas);
    const priority = requestedPriority;
    return { maxPriorityFeePerGas: priority, maxFeePerGas: baseFee > 0n ? baseFee * 2n + priority : priority + fallbackBase };
  } catch {
    return { maxPriorityFeePerGas: requestedPriority, maxFeePerGas: requestedPriority + fallbackBase };
  }
}

export async function rpcCall(wallet: EvmWallet, to: string, data: string): Promise<bigint> {
  const result = await wallet.request({ method: "eth_call", params: [{ to: checksumAddress(to), data }, "latest"] });
  return readUint256(result);
}

export async function getNativeBalance(wallet: EvmWallet, address: string): Promise<bigint> {
  const result = await wallet.request({ method: "eth_getBalance", params: [checksumAddress(address), "latest"] });
  return readUint256(result);
}

export function balanceOfData(owner: string): string { return `${ERC20_BALANCE_OF}${addressWord(owner)}`; }
export function allowanceData(owner: string, spender: string): string { return `${ERC20_ALLOWANCE}${addressWord(owner)}${addressWord(spender)}`; }
export function approveData(spender: string, amount: bigint): string { return `${ERC20_APPROVE}${addressWord(spender)}${word(amount)}`; }

export async function getErc20Balance(wallet: EvmWallet, token: string, owner: string): Promise<bigint> {
  return rpcCall(wallet, token, balanceOfData(owner));
}

export async function getAllowance(wallet: EvmWallet, token: string, owner: string, spender: string): Promise<bigint> {
  return rpcCall(wallet, token, allowanceData(owner, spender));
}

export async function getPumpCurveBinding(wallet: EvmWallet, curve: string): Promise<{ tokenAddress: string; quoteTokenAddress: string }> {
  const [token, quoteToken] = await Promise.all([rpcCall(wallet, curve, CURVE_TOKEN), rpcCall(wallet, curve, CURVE_QUOTE_TOKEN)]);
  return { tokenAddress: `0x${token.toString(16).padStart(40, "0")}`, quoteTokenAddress: `0x${quoteToken.toString(16).padStart(40, "0")}` };
}

export async function sendTransaction(wallet: EvmWallet, tx: { from: string; to: string; data?: string; value?: bigint; gas: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }): Promise<string> {
  const hash = await wallet.request({ method: "eth_sendTransaction", params: [{ from: checksumAddress(tx.from), to: checksumAddress(tx.to), ...(tx.data ? { data: tx.data } : {}), ...(tx.value !== undefined ? { value: `0x${tx.value.toString(16)}` } : {}), gas: `0x${tx.gas.toString(16)}`, ...(tx.maxFeePerGas !== undefined ? { maxFeePerGas: `0x${tx.maxFeePerGas.toString(16)}` } : {}), ...(tx.maxPriorityFeePerGas !== undefined ? { maxPriorityFeePerGas: `0x${tx.maxPriorityFeePerGas.toString(16)}` } : {}) }] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet did not return a transaction hash");
  return hash;
}

export async function waitForReceipt(wallet: EvmWallet, hash: string, onPoll?: () => void): Promise<TxReceipt> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await wallet.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt && typeof receipt === "object") {
      const typed = receipt as TxReceipt;
      if (typed.status !== undefined) return typed;
    }
    onPoll?.();
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("Transaction receipt timed out; check the transaction on BscScan");
}

export function receiptSucceeded(receipt: TxReceipt): boolean {
  return receipt.status === "0x1" || receipt.status === "0x01";
}
