import test from "node:test";
import assert from "node:assert/strict";
import { buildPumpKlineFromTrades } from "../src/lib/pump-kline.ts";

const trade = (timestamp: number, quote_amount: string, token_amount: string) => ({ tx_hash: `0x${timestamp}`, trader: "0x1234567890123456789012345678901234567890", trade_type: "buy", bnb_amount: quote_amount, token_amount, timestamp });

test("Pump trades aggregate into ordered OHLC candles", () => {
  const candles = buildPumpKlineFromTrades([
    trade(1_700_000_000, "1", "10"),
    trade(1_700_000_000, "2", "10"),
    trade(1_700_000_060, "1", "20"),
  ], "1h");
  assert.equal(candles.length, 3);
  assert.deepEqual({ open: candles[1].open, high: candles[1].high, low: candles[1].low, close: candles[1].close }, { open: 0.1, high: 0.2, low: 0.1, close: 0.2 });
  assert.ok(candles.every((candle, index) => index === 0 || candle.open_time > candles[index - 1].open_time));
});

test("dense Pump history is bucketed by the selected interval", () => {
  const trades = Array.from({ length: 51 }, (_, index) => trade(1_700_000_000 + (index < 30 ? index * 60 : 3600 + (index - 30) * 60), "1", "10"));
  const candles = buildPumpKlineFromTrades(trades, "1h");
  assert.equal(candles.length, 2);
  assert.equal(candles[0].volume, 30);
});
