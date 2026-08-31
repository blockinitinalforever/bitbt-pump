import test from "node:test";
import assert from "node:assert/strict";
import { assertBscRuntimeChain, assertPreparedLaunchBinding, encodeLaunchTokenData } from "../src/lib/pump-launch.ts";
import { getQuoteTokenAddress } from "../src/lib/pump-chain.ts";

const factory = "0x1234567890123456789012345678901234567890";
const recipient = "0x2234567890123456789012345678901234567890";
const quote = "0x3234567890123456789012345678901234567890";
const token = "0x4234567890123456789012345678901234567890";
const curve = "0x5234567890123456789012345678901234567890";
const creator = "0x6234567890123456789012345678901234567890";
const prepared = { launch: { id: "launch-1", token_name: "My Token", symbol: "MTK", creator_address: creator, quote_token: "BNB", status: "pending" }, amount_bnb: 0.01, fee_wei: "10000000000000000", factory_address: factory, fee_recipient: recipient, chain_id: "bsc", salt: `0x${"ab".repeat(32)}`, predicted_token_address: token, curve_address: curve, migration_threshold_wei: "100000000000000000000", quote_token_address: "0x0000000000000000000000000000000000000000", method: "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)" } as const;
const fee = { amount_bnb: 0.01, fee_wei: "10000000000000000", receive_address: recipient, factory_address: factory, chain_id: "bsc", gas_reserve_bnb: 0.002 } as const;

test("launch calldata encodes selector, dynamic offsets and bound arguments", () => {
  const data = encodeLaunchTokenData(prepared);
  assert.equal(data.slice(0, 10), "0x187fdf81");
  assert.equal(data.slice(10, 74), (160n).toString(16).padStart(64, "0"));
  assert.equal(data.slice(74, 138), (224n).toString(16).padStart(64, "0"));
  assert.equal(data.slice(138, 202), BigInt(prepared.migration_threshold_wei).toString(16).padStart(64, "0"));
  assert.equal(data.slice(202, 266), "ab".repeat(32));
  assert.equal(data.slice(266, 330), prepared.quote_token_address.slice(2).padStart(64, "0"));
});

test("launch preparation fails closed when factory or fee recipient changes", () => {
  assert.doesNotThrow(() => assertPreparedLaunchBinding(prepared, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null));
  assert.throws(() => assertPreparedLaunchBinding({ ...prepared, factory_address: recipient }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null), /factory/);
  assert.throws(() => assertPreparedLaunchBinding({ ...prepared, fee_recipient: factory }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null), /recipient/);
  assert.throws(() => assertPreparedLaunchBinding({ ...prepared, fee_wei: "10000000000000001" }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null), /amounts/);
  assert.throws(() => assertPreparedLaunchBinding({ ...prepared, quote_token_address: quote }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "USDT" }, "0x6234567890123456789012345678901234567890"), /quote token/);
});

test("all supported quote tokens are bound to their configured contract", () => {
  for (const symbol of ["BNB", "USDT", "USDC", "USD1", "GW"]) {
    const expected = getQuoteTokenAddress(symbol);
    const valid = { ...prepared, launch: { ...prepared.launch, quote_token: symbol }, quote_token_address: expected || "0x0000000000000000000000000000000000000000" };
    assert.doesNotThrow(() => assertPreparedLaunchBinding(valid, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: symbol }, expected));
    const wrong = symbol === "BNB" ? quote : "0x0000000000000000000000000000000000000000";
    assert.throws(() => assertPreparedLaunchBinding({ ...valid, quote_token_address: wrong }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: symbol }, expected), /quote token/);
  }
});

test("launch runtime chain binding fails closed before broadcast", () => {
  assert.doesNotThrow(() => assertBscRuntimeChain("0x38"));
  assert.doesNotThrow(() => assertBscRuntimeChain("0X38"));
  assert.throws(() => assertBscRuntimeChain("0x1"), /BNB Chain/);
  assert.throws(() => assertBscRuntimeChain(undefined), /BNB Chain/);
});

test("launch preparation rejects zero creator, factory, recipient, predicted token, and curve addresses", () => {
  const zero = "0x0000000000000000000000000000000000000000";
  const invalid = [
    () => assertPreparedLaunchBinding(prepared, fee, zero, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null),
    () => assertPreparedLaunchBinding({ ...prepared, factory_address: zero }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null),
    () => assertPreparedLaunchBinding(prepared, { ...fee, receive_address: zero }, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null),
    () => assertPreparedLaunchBinding({ ...prepared, fee_recipient: zero }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null),
    () => assertPreparedLaunchBinding({ ...prepared, predicted_token_address: zero }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null),
    () => assertPreparedLaunchBinding({ ...prepared, curve_address: zero }, fee, creator, { token_name: "My Token", symbol: "MTK", quote_token: "BNB" }, null),
  ];
  invalid.forEach((run) => assert.throws(run, /invalid|binding/i));
});
