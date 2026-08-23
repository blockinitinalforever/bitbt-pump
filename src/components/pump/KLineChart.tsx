import type { PumpCandle } from "@/lib/pump-kline";

export function KLineChart({ candles }: { candles: PumpCandle[] }) {
  if (!candles.length) return <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">—</div>;
  const w = 720; const h = 224; const padY = 12;
  const hi = Math.max(...candles.map((c) => c.high)); const lo = Math.min(...candles.map((c) => c.low));
  const span = hi - lo || 1; const step = w / candles.length; const bw = Math.max(2, step * 0.56);
  const y = (v: number) => padY + (1 - (v - lo) / span) * (h - padY * 2);
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-52 w-full sm:h-64" role="img" aria-label="OHLC chart">
    {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={w} y1={padY + g * (h - padY * 2)} y2={padY + g * (h - padY * 2)} className="stroke-background/20" strokeWidth={1} />)}
    {candles.map((c, i) => { const x = i * step + step / 2; const up = c.close >= c.open; const cls = up ? "fill-accent stroke-accent" : "stroke-muted-foreground fill-muted-foreground"; const top = y(Math.max(c.open, c.close)); const bot = y(Math.min(c.open, c.close)); return <g key={c.open_time} className={cls}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} /><rect x={x - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} /></g>; })}
  </svg>;
}
