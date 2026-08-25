import type { PumpCandle } from "@/lib/pump-kline";

type LovableCandle = { t: number; o: number; h: number; l: number; c: number };

/** The original Lovable KLineChart renderer; only the live OHLC adapter is local. */
export function KLineChart({ candles }: { candles: PumpCandle[] }) {
  const liveCandles: LovableCandle[] = candles.map((candle) => ({ t: candle.open_time, o: candle.open, h: candle.high, l: candle.low, c: candle.close }));
  if (!liveCandles.length) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">—</div>
    );
  }

  const w = 720;
  const h = 224;
  const padY = 12;
  const hi = Math.max(...liveCandles.map((c) => c.h));
  const lo = Math.min(...liveCandles.map((c) => c.l));
  const span = hi - lo || 1;
  const step = w / liveCandles.length;
  const bw = Math.max(2, step * 0.56);
  const y = (v: number) => padY + (1 - (v - lo) / span) * (h - padY * 2);

  return (
    <svg
      viewBox={"0 0 " + w + " " + h}
      preserveAspectRatio="none"
      className="h-52 w-full sm:h-64"
      role="img"
      aria-label="OHLC chart"
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={0}
          x2={w}
          y1={padY + g * (h - padY * 2)}
          y2={padY + g * (h - padY * 2)}
          className="stroke-border"
          strokeWidth={1}
        />
      ))}
      {liveCandles.map((c, i) => {
        const x = i * step + step / 2;
        const up = c.c >= c.o;
        const cls = up ? "fill-accent stroke-accent" : "stroke-muted-foreground fill-muted-foreground";
        const top = y(Math.max(c.o, c.c));
        const bot = y(Math.min(c.o, c.c));
        return (
          <g key={c.t} className={cls}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} strokeWidth={1} />
            <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} />
          </g>
        );
      })}
    </svg>
  );
}
