import type { PumpTrade } from "@/lib/pump-api";

export type PumpCandle = { open_time: number; open: number; high: number; low: number; close: number; volume: number };

const INTERVAL_SECONDS: Record<string, number> = { "1h": 3600, "4h": 14400, "1d": 86400 };

function timestamp(value: number): number {
  return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
}

function price(trade: PumpTrade): number | null {
  const quote = Number(trade.quote_amount || trade.bnb_amount || "0");
  const rawTokens = Number(trade.token_amount || "0");
  const tokens = rawTokens >= 1e12 ? rawTokens / 1e18 : rawTokens;
  return Number.isFinite(quote) && Number.isFinite(tokens) && quote > 0 && tokens > 0 ? quote / tokens : null;
}

/** Build the same trade-derived OHLC candles used by the App Pump screen. */
export function buildPumpKlineFromTrades(trades: PumpTrade[], interval: string, limit = 80): PumpCandle[] {
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length <= 50) {
    let previousClose: number | undefined;
    let previousOpenTime = -1;
    return sorted.flatMap((trade, index) => {
      const close = price(trade);
      if (close === null) return [];
      const open = previousClose ?? close;
      previousClose = close;
      const candidateTime = timestamp(trade.timestamp) || index;
      const openTime = Math.max(candidateTime, previousOpenTime + 1);
      previousOpenTime = openTime;
      return [{ open_time: openTime, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: Number(trade.quote_amount || trade.bnb_amount || "0") || 0 }];
    }).slice(-limit);
  }
  const bucketSize = INTERVAL_SECONDS[interval] || 3600;
  const buckets = new Map<number, PumpCandle>();
  for (const trade of sorted) {
    const close = price(trade);
    if (close === null) continue;
    const openTime = Math.floor(timestamp(trade.timestamp) / bucketSize) * bucketSize;
    const volume = Number(trade.quote_amount || trade.bnb_amount || "0") || 0;
    const candle = buckets.get(openTime);
    if (!candle) buckets.set(openTime, { open_time: openTime, open: close, high: close, low: close, close, volume });
    else { candle.high = Math.max(candle.high, close); candle.low = Math.min(candle.low, close); candle.close = close; candle.volume += volume; }
  }
  return [...buckets.values()].sort((a, b) => a.open_time - b.open_time).slice(-limit);
}
