type LaunchFeeInfo = { receive_address: string; factory_address: string; chain_id: string; fee_wei: string };
type PreparedLaunch = { launch: { id: string; token_name: string; symbol: string; creator_address: string; quote_token: string }; fee_wei: string; factory_address: string; fee_recipient: string; chain_id: string; salt: string; predicted_token_address: string; curve_address: string; migration_threshold_wei: string; quote_token_address: string; method: string };

function isAddress(value: string): boolean { return /^0x[0-9a-fA-F]{40}$/.test(value); }
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function isNonZeroAddress(value: string): boolean { return isAddress(value) && value.toLowerCase() !== ZERO_ADDRESS; }

export const LAUNCH_METHOD = "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)";
export const LAUNCH_SELECTOR = "187fdf81";
export const BSC_CHAIN_ID = "0x38";

export function assertBscRuntimeChain(chainId: unknown): void {
  if (String(chainId).toLowerCase() !== BSC_CHAIN_ID) throw new Error("Wallet is not connected to BNB Chain");
}

export function launchWord(value: bigint): string {
  if (value < 0n || value > (1n << 256n) - 1n) throw new Error("Launch value is outside uint256 range");
  return value.toString(16).padStart(64, "0");
}

function addressWord(value: string): string {
  if (!isAddress(value)) throw new Error("Invalid launch address");
  return value.slice(2).toLowerCase().padStart(64, "0");
}

function abiString(value: string): string {
  const bytes = Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${launchWord(BigInt(bytes.length / 2))}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")}`;
}

export function assertPreparedLaunchBinding(prepared: PreparedLaunch, fee: LaunchFeeInfo, creator: string, input: { token_name: string; symbol: string; quote_token: string }, expectedQuoteTokenAddress: string | null): void {
  if (prepared.method !== LAUNCH_METHOD || prepared.chain_id !== "bsc" || fee.chain_id !== "bsc") throw new Error("Launch preparation method or chain is invalid");
  if (!isNonZeroAddress(creator) || !isNonZeroAddress(prepared.factory_address) || !isNonZeroAddress(fee.factory_address) || prepared.factory_address.toLowerCase() !== fee.factory_address.toLowerCase()) throw new Error("Launch factory binding is invalid");
  if (!isNonZeroAddress(fee.receive_address) || !isNonZeroAddress(prepared.fee_recipient) || prepared.fee_recipient.toLowerCase() !== fee.receive_address.toLowerCase()) throw new Error("Launch fee recipient binding is invalid");
  if (!/^0x[0-9a-fA-F]{64}$/.test(prepared.salt) || !isAddress(prepared.quote_token_address) || !isNonZeroAddress(prepared.predicted_token_address) || !isNonZeroAddress(prepared.curve_address)) throw new Error("Launch preparation addresses are invalid");
  if (!fee.fee_wei || !/^\d+$/.test(fee.fee_wei) || !/^\d+$/.test(prepared.fee_wei) || fee.fee_wei !== prepared.fee_wei || BigInt(prepared.fee_wei) <= 0n || BigInt(prepared.migration_threshold_wei) <= 0n) throw new Error("Launch preparation amounts are invalid");
  const expectedQuote = expectedQuoteTokenAddress || ZERO_ADDRESS;
  if (!isAddress(expectedQuote) || prepared.quote_token_address.toLowerCase() !== expectedQuote.toLowerCase()) throw new Error("Launch quote token binding is invalid");
  if (prepared.launch.creator_address.toLowerCase() !== creator.toLowerCase() || prepared.launch.token_name !== input.token_name || prepared.launch.symbol !== input.symbol || prepared.launch.quote_token.toUpperCase() !== input.quote_token.toUpperCase()) throw new Error("Launch preparation does not match this wallet or token");
}

export function encodeLaunchTokenData(prepared: PreparedLaunch): string {
  if (prepared.method !== LAUNCH_METHOD || !/^0x[0-9a-fA-F]{64}$/.test(prepared.salt) || !isNonZeroAddress(prepared.factory_address) || !isAddress(prepared.quote_token_address)) throw new Error("Launch preparation binding is invalid");
  const name = abiString(prepared.launch.token_name);
  const symbol = abiString(prepared.launch.symbol);
  const nameOffset = 160n;
  const symbolOffset = nameOffset + BigInt(name.length / 2);
  return `0x${LAUNCH_SELECTOR}${launchWord(nameOffset)}${launchWord(symbolOffset)}${launchWord(BigInt(prepared.migration_threshold_wei))}${prepared.salt.slice(2).toLowerCase()}${addressWord(prepared.quote_token_address)}${name}${symbol}`;
}
