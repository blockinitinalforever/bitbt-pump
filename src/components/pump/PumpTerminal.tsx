"use client";

import { KLineChart } from "./KLineChart";
import PumpWalletConnect from "@/components/PumpWalletConnect";

export type TerminalToken = { id: string; name: string; symbol: string; quote: string; status: string; createdAgo: string; mark: string; progress: number | null; price: number | null; raised: number | null; sold: number | null };
export type TerminalTrade = { id: string; side: "buy" | "sell"; account: string; amount: number; ago: string };
export type PumpCopy = { demo: string; disconnected: string; product: string; tagline: string; connect: string; launch: string; search: string; quote: string; token: string; progress: string; price: string; raised: string; sold: string; buy: string; sell: string; amount: string; youReceive: string; slippage: string; priority: string; balance: string; trades: string; txState: string; idle: string; selectToken: string; empty: string };

type Props = { lang: "en" | "zh"; copy: PumpCopy; rows: TerminalToken[]; selected?: TerminalToken; candles: import("@/lib/pump-kline").PumpCandle[]; trades: TerminalTrade[]; tabs: Array<{ id: string; en: string; zh: string }>; tab: string; setTab: (value: string) => void; query: string; setQuery: (value: string) => void; quote: string; setQuote: (value: string) => void; selectedId: string; setSelectedId: (value: string) => void; side: "buy" | "sell"; setSide: (value: "buy" | "sell") => void; amount: string; setAmount: (value: string) => void; onConnected: (address: string) => void; onTrade: () => void; tradeDisabled: boolean; actionLabel: string; txState: string; receiveValue: string; slippageValue: string; priorityValue: string; quoteBalance: string; tokenBalance: string };

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
        <rect width="24" height="24" rx="6" className="fill-foreground" />
        <path d="M7 17V7h5.2a3 3 0 0 1 0 6H9.4" className="stroke-accent" strokeWidth="2.2" fill="none" />
      </svg>
      <span className="text-sm font-semibold tracking-[0.18em] text-foreground">BITBT</span>
      <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold tracking-[0.14em] text-accent-foreground">
        PUMP
      </span>
    </span>
  );
}

function Progress({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="tabular-nums text-xs text-foreground">{Math.round(value * 100)}%</span>
    </span>
  );
}

export function PumpTerminal({ lang, copy, rows, selected, candles, trades, tabs, tab, setTab, query, setQuery, quote, setQuote, selectedId, setSelectedId, side, setSide, amount, setAmount, onConnected, onTrade, tradeDisabled, actionLabel, txState, receiveValue, slippageValue, priorityValue, quoteBalance, tokenBalance }: Props) {
  const t = copy;
  const fmt = (value: number | null, digits: number) => value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-accent px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-accent-foreground">
        {t.demo}
      </div>

      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex shrink-0 items-center gap-2">
            <nav className="flex overflow-hidden rounded-full border border-border text-[11px] font-medium">
              {(["en", "zh"] as const).map((l) => (
                <a key={l} href={l === "en" ? "/en/pump" : "/zh/pump"} className={"px-2.5 py-1 transition-colors " + (l === lang ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{l === "en" ? "EN" : "中文"}</a>
              ))}
            </nav>
            <PumpWalletConnect compact onConnected={onConnected} />
          </div>
        </div>
      </header>

      {/* product header */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 py-6 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">BitBT {t.product}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.tagline} · bitbt.fun</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground hover:text-background"
            >
              {t.connect}
            </button>
            <button
              type="button"
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              {t.launch}
            </button>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* market board */}
        <section className="min-w-0 rounded-xl border border-border bg-card">
          <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 [scrollbar-width:none]">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === tb.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                  {tb[lang]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
            <select
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-foreground"
              aria-label={t.quote}
            >
              {["ALL", "BNB", "USDT", "USDC", "GW"].map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_88px_96px_84px] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid">
            <span>{t.token}</span>
            <span>{t.progress}</span>
            <span className="text-right">{t.price}</span>
            <span className="text-right">{t.raised}</span>
          </div>

          <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible">
            {rows.map((tk) => (
              <li key={tk.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(tk.id)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary sm:grid-cols-[minmax(0,1fr)_88px_96px_84px] ${
                    tk.id === selectedId ? "bg-secondary" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-[11px] font-bold text-background">
                      {tk.mark}
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{tk.name}</span>
                        <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
                          {tk.symbol}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span>{tk.status}</span>
                        <span>·</span>
                        <span>{tk.quote}</span>
                        <span>·</span>
                        <span>{tk.createdAgo}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-muted-foreground sm:hidden">
                        <span>{tk.price === null ? "—" : tk.price.toFixed(8)}</span>
                        <span>·</span>
                        <span>{tk.raised === null ? "—" : `${fmt(tk.raised, 2)} ${tk.quote}`}</span>
                      </span>
                    </span>
                  </span>
                  <span className="justify-self-end sm:justify-self-start">
                    <Progress value={tk.progress} />
                  </span>
                  <span className="hidden text-right text-xs tabular-nums sm:block">
                    {tk.price === null ? "—" : tk.price.toFixed(8)}
                  </span>
                  <span className="hidden text-right text-xs tabular-nums sm:block">
                    {tk.raised === null ? "—" : `${fmt(tk.raised, 2)} ${tk.quote}`}
                  </span>
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-muted-foreground">{t.empty}</li>
            )}
          </ul>

        </section>

        {/* detail panel */}
        <section className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">
              {t.selectToken}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-foreground p-4 text-background">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{selected.name}</h2>
                    <p className="text-xs opacity-70">
                      {selected.symbol} / {selected.quote} · {selected.status}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-lg font-semibold tabular-nums text-accent">
                    {selected.price === null ? "—" : selected.price.toFixed(8)}
                  </p>
                </div>
                <div className="mt-3 -mx-1">
                  <KLineChart candles={candles} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-background/15 pt-3 text-xs">
                  <div>
                    <dt className="opacity-60">{t.raised}</dt>
                    <dd className="tabular-nums">{fmt(selected.raised, 2)}</dd>
                  </div>
                  <div>
                    <dt className="opacity-60">{t.sold}</dt>
                    <dd className="tabular-nums">{fmt(selected.sold, 0)}</dd>
                  </div>
                  <div>
                    <dt className="opacity-60">{t.progress}</dt>
                    <dd className="tabular-nums">
                      {selected.progress === null ? "—" : `${Math.round(selected.progress * 100)}%`}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* trade controls */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
                  {(["buy", "sell"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={`rounded-md py-2 text-sm font-semibold transition-colors ${
                        side === s ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s === "buy" ? t.buy : t.sell}
                    </button>
                  ))}
                </div>

                <label className="mt-3 block text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.amount}
                  <span className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="min-w-0 flex-1 bg-transparent text-base tabular-nums text-foreground outline-none"
                    />
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {side === "buy" ? selected.quote : selected.symbol}
                    </span>
                  </span>
                </label>

                <dl className="mt-3 space-y-2 text-xs">
                  {[[t.youReceive, receiveValue], [t.slippage, slippageValue], [t.priority, priorityValue], [t.balance + " · " + selected.quote, quoteBalance], [t.balance + " · " + selected.symbol, tokenBalance]].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <dt className="min-w-0 truncate text-muted-foreground">{k}</dt>
                      <dd className="shrink-0 tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>

                <button type="button" onClick={onTrade} disabled={tradeDisabled} className="mt-4 w-full rounded-lg bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{actionLabel}</button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">{t.txState}: {txState}</p>
              </div>

              {/* recent trades */}
              <div className="rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.trades}
                </h3>
                <ul className="divide-y divide-border">
                  {trades.map((tr) => (
                    <li
                      key={tr.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-xs"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          tr.side === "buy" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {tr.side === "buy" ? t.buy : t.sell}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">{tr.account}</span>
                      <span className="shrink-0 tabular-nums">
                        {fmt(tr.amount, 2)} · {tr.ago}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-[11px] text-muted-foreground sm:px-6">
        bitbt.fun · BitBT PUMP · {t.demo}
      </footer>
    </div>
  );
}
