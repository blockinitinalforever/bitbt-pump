import test from "node:test";
import assert from "node:assert/strict";
import { approveData, assertPumpQuoteBinding, formatUnits, getPumpQuickAmounts, getQuoteTokenAddress, isSupportedQuoteToken, parseUnits, PUMP_SELECTORS, receiptSucceeded, resolvePumpCurveAddress, word } from "../src/lib/pump-chain.ts";

const CURVE = "0x1234567890123456789012345678901234567890";

test("parseUnits and formatUnits preserve exact 18-decimal amounts", () => {
  const value = parseUnits("1.230000000000000001");
  assert.equal(value, 1230000000000000001n);
  assert.equal(formatUnits(value, 18, 18), "1.230000000000000001");
});

test("parseUnits rejects invalid, zero and over-precision values", () => {
  assert.throws(() => parseUnits("0"));
  assert.throws(() => parseUnits("1.0000000000000000001"));
  assert.throws(() => parseUnits("1e-3"));
});

test("unsupported quote tokens fail closed", () => {
  assert.equal(isSupportedQuoteToken("BNB"), true);
  assert.equal(isSupportedQuoteToken("usdt"), true);
  assert.equal(isSupportedQuoteToken("UNKNOWN"), false);
  assert.equal(getQuoteTokenAddress("BNB"), null);
  assert.throws(() => getQuoteTokenAddress("UNKNOWN"));
});

test("approve calldata binds spender to the curve address", () => {
  const data = approveData(CURVE, 5n);
  assert.equal(data.slice(0, 10), "0x095ea7b3");
  assert.equal(data.slice(10, 74), CURVE.slice(2).padStart(64, "0"));
  assert.equal(data.slice(74), word(5n));
});

test("Pump selectors and receipt status are explicit", () => {
  assert.equal(PUMP_SELECTORS.buy.length, 10);
  assert.equal(PUMP_SELECTORS.sellForQuote.length, 10);
  assert.equal(receiptSucceeded({ status: "0x1" }), true);
  assert.equal(receiptSucceeded({ status: "0x0" }), false);
});

test("quick amounts are quote-token presets for buy only", () => {
  assert.deepEqual(getPumpQuickAmounts("buy", "BNB"), ["0.01", "0.05", "0.1", "0.5"]);
  assert.deepEqual(getPumpQuickAmounts("buy", "USDT"), ["10", "50", "100", "500"]);
  assert.deepEqual(getPumpQuickAmounts("sell", "BNB"), []);
  assert.deepEqual(getPumpQuickAmounts("sell", "USDT"), []);
});

test("Pump curve resolution accepts quote fallback but rejects mismatches", () => {
  assert.equal(resolvePumpCurveAddress("", CURVE), CURVE);
  assert.equal(resolvePumpCurveAddress(undefined, CURVE), CURVE);
  assert.equal(resolvePumpCurveAddress(CURVE, CURVE.toUpperCase()), CURVE);
  assert.throws(() => resolvePumpCurveAddress(CURVE, "0x2234567890123456789012345678901234567890"));
  assert.throws(() => resolvePumpCurveAddress("", ""));
});

test("buy and sell bindings fail before any transaction broadcast", () => {
  const sendCalls: string[] = [];
  const valid = { selectedTokenAddress: CURVE, detailTokenAddress: "", detailCurveAddress: "", quoteCurveAddress: CURVE, quoteToken: "BNB", detailQuoteToken: "BNB", onChainTokenAddress: CURVE, onChainQuoteTokenAddress: "0x0000000000000000000000000000000000000000" };
  for (const side of ["buy", "sell"]) {
    assert.throws(() => {
      assertPumpQuoteBinding({ ...valid, onChainTokenAddress: "0x2234567890123456789012345678901234567890" });
      sendCalls.push(side);
    }, /different token/);
  }
  assert.deepEqual(sendCalls, []);
});
