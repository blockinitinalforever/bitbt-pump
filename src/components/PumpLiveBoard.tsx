"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pumpApi, type PumpDetail, type PumpQuote, type PumpToken, type PumpTrade } from "@/lib/pump-api";
import { PUMP_SELECTORS, EvmWallet, approveData, assertPumpQuoteBinding, formatUnits, getAllowance, getDynamicFeePolicy, getErc20Balance, getNativeBalance, getPumpCurveBinding, getPumpQuickAmounts, getQuoteTokenAddress, isAddress, isSupportedQuoteToken, parseUnits, receiptSucceeded, resolvePumpCurveAddress, sendTransaction, switchToBsc, waitForReceipt, word } from "@/lib/pump-chain";
import { buildPumpKlineFromTrades } from "@/lib/pump-kline";
import PumpWalletConnect from "@/components/PumpWalletConnect";
import { KLineChart } from "@/components/pump/KLineChart";

type Side = "buy" | "sell";
type ListTab = "all" | "trending" | "creating" | "newly_created" | "almost_bonded" | "migrated";
type ChartPeriod = "1h" | "4h" | "1d" | "all";
type Balances = { quote: bigint; token: bigint; gas: bigint };
type QuoteBinding = { tokenAddress: string; side: Side; amount: string; curveAddress: string; quoteToken: string; createdAt: number };

function amountFromApi(value?: string): bigint { if (!value) return 0n; return /^\d+$/.test(value) ? BigInt(value) : parseUnits(value); }
function shortened(value: string): string { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function errorMessage(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
function displayMetric(value?: string): string {
  if (!value) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  if (number === 0) return "0";
  if (Math.abs(number) < 0.000001) return number.toExponential(4);
  return number.toLocaleString("en-US", { maximumFractionDigits: 8 });
}
function tabForToken(token: PumpToken): Exclude<ListTab, "all"> {
  const status = token.status.toLowerCase();
  if (status === "migrated" || (token.progress_percent ?? 0) >= 100) return "migrated";
  if (status === "bonding" || (token.progress_percent ?? 0) >= 50) return "almost_bonded";
  if (["pending_review", "deploying", "deploy_failed", "pending", "approved"].includes(status)) return "creating";
  return "newly_created";
}

function recommendationScore(token: PumpToken): number {
  const progress = Math.max(0, Math.min(100, token.progress_percent ?? 0));
  const raised = Number(token.total_raised_quote || token.total_raised_bnb || 0);
  return progress * 2 + Math.log10(Math.max(1, raised)) * 10;
}

export default function PumpLiveBoard({ zh }: { zh: boolean }) {
  const searchParams = useSearchParams();
  const wallet = typeof window !== "undefined" ? window.ethereum as EvmWallet | undefined : undefined;
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [selected, setSelected] = useState<PumpToken>();
  const [detail, setDetail] = useState<PumpDetail>();
  const [trades, setTrades] = useState<PumpTrade[]>([]);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<PumpQuote>();
  const [quoteBinding, setQuoteBinding] = useState<QuoteBinding>();
  const [side, setSide] = useState<Side>("buy");
  const [activeTab, setActiveTab] = useState<ListTab>("all");
  const [searchText, setSearchText] = useState("");
  const [quoteFilter, setQuoteFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("all");
  const [slippageBps, setSlippageBps] = useState(() => {
    if (typeof window === "undefined") return 100;
    const saved = Number(window.localStorage.getItem("bitbt_pump_slippage_bps"));
    return [50, 100, 200, 500].includes(saved) ? saved : 100;
  });
  const [priorityGwei, setPriorityGwei] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(window.localStorage.getItem("bitbt_pump_priority_gwei"));
    return [1, 2, 3].includes(saved) ? saved : 1;
  });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balances, setBalances] = useState<Balances>({ quote: 0n, token: 0n, gas: 0n });
  const [phase, setPhase] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string>();

  const saveSlippage = (value: number) => { setSlippageBps(value); window.localStorage.setItem("bitbt_pump_slippage_bps", String(value)); };
  const savePriority = (value: number) => { setPriorityGwei(value); window.localStorage.setItem("bitbt_pump_priority_gwei", String(value)); };

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try { setTokens(await pumpApi.tokens()); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void loadTokens(); }); }, [loadTokens]);

  const loadTokenData = useCallback(async (tokenAddress: string) => {
    const [nextDetail, nextTrades] = await Promise.all([pumpApi.detail(tokenAddress), pumpApi.trades(tokenAddress)]);
    return { nextDetail, nextTrades };
  }, []);

  const selectToken = useCallback(async (token: PumpToken) => {
    if (!token.contract_address || !isAddress(token.contract_address)) { setError("This token has no valid contract address"); return; }
    setSelected(token); setDetail(undefined); setTrades([]); setQuote(undefined); setQuoteBinding(undefined); setAmount(""); setError(undefined); setDetailLoading(true);
    try {
      const { nextDetail, nextTrades } = await loadTokenData(token.contract_address);
      setDetail(nextDetail); setTrades(nextTrades);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setDetailLoading(false); }
  }, [loadTokenData]);

  // The API trade history is populated by the Pump curve WSS indexer. Polling
  // here keeps the browser view and its OHLC candles current without relying
  // on a client-side transaction report or a manual refresh click.
  useEffect(() => {
    const tokenAddress = selected?.contract_address;
    if (!tokenAddress || !isAddress(tokenAddress)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const { nextDetail, nextTrades } = await loadTokenData(tokenAddress);
        if (!cancelled) { setDetail(nextDetail); setTrades(nextTrades); }
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    };
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [loadTokenData, selected?.contract_address]);

  const deepLinkToken = searchParams.get("token")?.trim().toLowerCase() || "";
  useEffect(() => {
    if (!deepLinkToken || selected?.contract_address?.toLowerCase() === deepLinkToken) return;
    const match = tokens.find((token) => token.contract_address?.toLowerCase() === deepLinkToken);
    if (match) {
      queueMicrotask(() => { void selectToken(match); });
      return;
    }
    let cancelled = false;
    queueMicrotask(async () => {
      try {
        const linkedDetail = await pumpApi.detail(deepLinkToken);
        if (cancelled) return;
        await selectToken({ id: linkedDetail.id, token_name: linkedDetail.token_name, symbol: linkedDetail.symbol, creator_address: "", contract_address: deepLinkToken, chain_id: "bsc", quote_token: linkedDetail.quote_token, status: linkedDetail.migrated ? "migrated" : "deployed", progress_percent: linkedDetail.progress_percent });
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    });
    return () => { cancelled = true; };
  }, [deepLinkToken, selected, selectToken, tokens]);

  const refreshBalances = useCallback(async () => {
    if (!wallet || !address || !detail?.contract_address || !isAddress(detail.contract_address)) return;
    if (!isSupportedQuoteToken(detail.quote_token)) { setBalances({ quote: 0n, token: 0n, gas: 0n }); return; }
    const quoteAddress = getQuoteTokenAddress(detail.quote_token);
    const [gas, tokenBalance] = await Promise.all([getNativeBalance(wallet, address), getErc20Balance(wallet, detail.contract_address, address)]);
    const quoteBalance = quoteAddress ? await getErc20Balance(wallet, quoteAddress, address) : gas;
    setBalances({ quote: quoteBalance, token: tokenBalance, gas });
  }, [address, detail, wallet]);
  useEffect(() => { queueMicrotask(() => { void refreshBalances().catch((cause) => setError(errorMessage(cause))); }); }, [refreshBalances]);

  useEffect(() => {
    queueMicrotask(() => { setQuote(undefined); setQuoteBinding(undefined); });
    if (!selected?.contract_address || !amount.trim() || !detail) return;
    const contractAddress = selected.contract_address;
    try { if (parseUnits(amount) <= 0n) return; } catch { return; }
    queueMicrotask(() => setQuoteLoading(true));
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextQuote = side === "buy" ? await pumpApi.buyQuote(contractAddress, amount) : await pumpApi.sellQuote(contractAddress, amount);
        if (cancelled) return;
        if (nextQuote.token_address && nextQuote.token_address.toLowerCase() !== contractAddress.toLowerCase()) throw new Error("Quote does not match the selected Pump token");
        if (detail.contract_address && detail.contract_address.toLowerCase() !== contractAddress.toLowerCase()) throw new Error("Pump detail does not match the selected token");
        const curveAddress = resolvePumpCurveAddress(detail.curve_address, nextQuote.curve_address);
        if (nextQuote.quote_token.toUpperCase() !== detail.quote_token.toUpperCase()) throw new Error("Quote does not match the selected Pump token");
        setQuote(nextQuote); setQuoteBinding({ tokenAddress: contractAddress.toLowerCase(), side, amount, curveAddress: curveAddress.toLowerCase(), quoteToken: nextQuote.quote_token.toUpperCase(), createdAt: Date.now() });
      } catch (cause) { if (!cancelled) setError(errorMessage(cause)); }
      finally { if (!cancelled) setQuoteLoading(false); }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [amount, detail, selected, side]);

  const output = useMemo(() => side === "buy" ? amountFromApi(quote?.tokens_out) : amountFromApi(quote?.quote_out || quote?.bnb_out), [quote, side]);
  const outputSymbol = side === "buy" ? selected?.symbol : detail?.quote_token;
  const filteredTokens = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = tokens.filter((token) => {
      const matchesTab = activeTab === "all" || (activeTab === "trending" ? true : tabForToken(token) === activeTab);
      const quoteSymbol = token.quote_token.toUpperCase();
      const matchesQuote = quoteFilter === "all" || (quoteFilter === "other" ? !isSupportedQuoteToken(quoteSymbol) : quoteSymbol === quoteFilter);
      const matchesSearch = !query || [token.token_name, token.symbol, token.creator_address, token.contract_address || ""].some((field) => field.toLowerCase().includes(query));
      return matchesTab && matchesQuote && matchesSearch;
    });
    return activeTab === "trending" ? [...filtered].sort((a, b) => recommendationScore(b) - recommendationScore(a)) : filtered;
  }, [activeTab, quoteFilter, searchText, tokens]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleTokens = filteredTokens.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    if (selected || deepLinkToken || loading || visibleTokens.length === 0) return;
    queueMicrotask(() => { void selectToken(visibleTokens[0]); });
  }, [deepLinkToken, loading, selected, selectToken, visibleTokens]);
  const quickAmounts = useMemo(() => getPumpQuickAmounts(side, detail?.quote_token), [detail?.quote_token, side]);
  const setMaxAmount = () => {
    if (!detail) return;
    if (side === "sell") { setAmount(formatUnits(balances.token, 18, 18)); return; }
    const quoteAddress = isSupportedQuoteToken(detail.quote_token) ? getQuoteTokenAddress(detail.quote_token) : null;
    const gasReserve = parseUnits("0.005");
    const max = quoteAddress ? balances.quote : balances.gas > gasReserve ? balances.gas - gasReserve : 0n;
    setAmount(formatUnits(max, 18, 18));
  };
  const candles = useMemo(() => buildPumpKlineFromTrades(trades, chartPeriod === "all" ? "1h" : chartPeriod, 80), [chartPeriod, trades]);
  const feeDisplay = quote?.fee_quote || quote?.fee_bnb;
  const report = async (data: Parameters<typeof pumpApi.reportTransaction>[0]) => { try { await pumpApi.reportTransaction(data); } catch (cause) { console.warn("[Pump] transaction report failed", errorMessage(cause)); } };

  const execute = async () => {
    if (!wallet || !address || !selected?.contract_address || !detail || !quote) throw new Error("Connect your wallet and wait for a current quote");
    if (!isAddress(selected.contract_address)) throw new Error("Pump contract address is invalid");
    const amountWei = parseUnits(amount);
    if (amountWei <= 0n || output <= 0n) throw new Error("Amount or quote is invalid");
    const curveAddress = resolvePumpCurveAddress(detail.curve_address, quote.curve_address);
    const quoteAddress = getQuoteTokenAddress(detail.quote_token);
    if (!quoteBinding || quoteBinding.tokenAddress !== selected.contract_address.toLowerCase() || quoteBinding.side !== side || quoteBinding.amount !== amount || quoteBinding.curveAddress !== curveAddress.toLowerCase() || quoteBinding.quoteToken !== detail.quote_token.toUpperCase() || Date.now() - quoteBinding.createdAt > 30000) throw new Error("Quote expired or no longer matches this Pump token; request a new quote");
    if (detail.quote_token.toUpperCase() !== quote.quote_token.toUpperCase()) throw new Error("Quote expired; request a new quote");
    if (side === "buy" && amountWei > balances.quote) throw new Error(`Insufficient ${detail.quote_token} balance`);
    if (side === "sell" && amountWei > balances.token) throw new Error(`Insufficient ${selected.symbol} balance`);
    const gasReserve = parseUnits("0.005");
    if (balances.gas < gasReserve) throw new Error("Insufficient BNB for gas");
    if (side === "buy" && !quoteAddress && amountWei > balances.gas - gasReserve) throw new Error("Keep 0.005 BNB reserved for gas");
    await switchToBsc(wallet);
    const curveBinding = await getPumpCurveBinding(wallet, curveAddress);
    assertPumpQuoteBinding({ selectedTokenAddress: selected.contract_address, detailTokenAddress: detail.contract_address || undefined, detailCurveAddress: detail.curve_address, quoteCurveAddress: quote.curve_address, quoteToken: quote.quote_token, detailQuoteToken: detail.quote_token, quoteTokenAddress: quote.quote_token_address, onChainTokenAddress: curveBinding.tokenAddress, onChainQuoteTokenAddress: curveBinding.quoteTokenAddress });
    const accounts = await wallet.request({ method: "eth_accounts" });
    const currentAddress = Array.isArray(accounts) ? String(accounts[0] || "") : "";
    if (currentAddress.toLowerCase() !== address.toLowerCase()) throw new Error("Connected wallet account changed; reconnect");
    const minOut = output * BigInt(10_000 - slippageBps) / 10_000n;
    const priorityWei = BigInt(priorityGwei) * 1_000_000_000n;
    const feePolicy = await getDynamicFeePolicy(wallet, priorityWei);
    let mainHash = "";
    setBusy(true); setError(undefined); setTxHash("");
    try {
      const authorize = async (asset: string, assetSymbol: string) => {
        const allowance = await getAllowance(wallet, asset, address, curveAddress);
        if (allowance >= amountWei) return;
        setPhase(`Sign ${assetSymbol} authorization…`);
        const approvalHash = await sendTransaction(wallet, { from: address, to: asset, data: approveData(curveAddress, amountWei), gas: 100000n, maxPriorityFeePerGas: feePolicy.maxPriorityFeePerGas, maxFeePerGas: feePolicy.maxFeePerGas });
        setTxHash(approvalHash);
        const approvalMeta = { token_address: asset, spender: curveAddress };
        await report({ user_address: address, tx_hash: approvalHash, chain_id: "bsc", tx_type: "approve", from_token: assetSymbol, to_token: selected.symbol, from_amount: amount, status: "pending", metadata: approvalMeta });
        try {
          const receipt = await waitForReceipt(wallet, approvalHash);
          if (!receiptSucceeded(receipt)) throw new Error(`${assetSymbol} authorization failed`);
          await report({ user_address: address, tx_hash: approvalHash, chain_id: "bsc", tx_type: "approve", from_token: assetSymbol, to_token: selected.symbol, from_amount: amount, status: "success", metadata: approvalMeta });
        } catch (cause) {
          await report({ user_address: address, tx_hash: approvalHash, chain_id: "bsc", tx_type: "approve", from_token: assetSymbol, to_token: selected.symbol, from_amount: amount, status: "failed", metadata: { ...approvalMeta, error: errorMessage(cause) } });
          throw cause;
        }
      };
      if (side === "buy" && quoteAddress) await authorize(quoteAddress, detail.quote_token);
      if (side === "sell") await authorize(selected.contract_address, selected.symbol);
      setPhase(`Sign Pump ${side} transaction…`);
      const data = side === "buy" ? `${quoteAddress ? PUMP_SELECTORS.buyWithQuote + word(amountWei) : PUMP_SELECTORS.buy}${word(minOut)}` : `${quoteAddress ? PUMP_SELECTORS.sellForQuote : PUMP_SELECTORS.sell}${word(amountWei)}${word(minOut)}`;
      mainHash = await sendTransaction(wallet, { from: address, to: curveAddress, data, value: side === "buy" && !quoteAddress ? amountWei : 0n, gas: quoteAddress ? 350000n : 300000n, maxPriorityFeePerGas: feePolicy.maxPriorityFeePerGas, maxFeePerGas: feePolicy.maxFeePerGas });
      setTxHash(mainHash); setPhase("Broadcasted; waiting for receipt…");
      const txMeta = { token_address: selected.contract_address, curve_address: curveAddress };
      const txType = side === "buy" ? "pump_buy" : "pump_sell";
      await report({ user_address: address, tx_hash: mainHash, chain_id: "bsc", tx_type: txType, from_token: side === "buy" ? detail.quote_token : selected.symbol, to_token: side === "buy" ? selected.symbol : detail.quote_token, from_amount: amount, to_amount: formatUnits(output), status: "pending", metadata: txMeta });
      const receipt = await waitForReceipt(wallet, mainHash);
      if (!receiptSucceeded(receipt)) throw new Error(`Pump ${side} receipt failed`);
      await report({ user_address: address, tx_hash: mainHash, chain_id: "bsc", tx_type: txType, from_token: side === "buy" ? detail.quote_token : selected.symbol, to_token: side === "buy" ? selected.symbol : detail.quote_token, from_amount: amount, to_amount: formatUnits(output), status: "success", metadata: txMeta });
      setPhase(`Trade confirmed: ${shortened(mainHash)}`); setAmount(""); setQuote(undefined); setQuoteBinding(undefined); await selectToken(selected); await refreshBalances();
    } catch (cause) {
      const message = errorMessage(cause); setError(message); setPhase(mainHash ? "Transaction failed; failure recorded" : "Transaction not broadcast");
      if (mainHash) await report({ user_address: address, tx_hash: mainHash, chain_id: "bsc", tx_type: side === "buy" ? "pump_buy" : "pump_sell", status: "failed", metadata: { token_address: selected.contract_address, curve_address: curveAddress, error: message } });
    } finally { setBusy(false); }
  };

  const tabs: Array<[ListTab, string]> = [["all", zh ? "全部" : "All"], ["trending", zh ? "推荐" : "Trending"], ["creating", zh ? "创建中" : "Creating"], ["newly_created", zh ? "新项目" : "New"], ["almost_bonded", zh ? "接近毕业" : "Almost bonded"], ["migrated", zh ? "已迁移" : "Migrated"]];
  const [now] = useState(() => Date.now());
  const age = (value?: string) => {
    if (!value) return "—";
    const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
    return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
  };
  const priceOf = (token: PumpToken) => displayMetric(token.current_price_quote || token.current_price_bnb);
  const raisedOf = (token: PumpToken) => displayMetric(token.total_raised_quote || token.total_raised_bnb);


  const statusLabel = (token: PumpToken) => token.status.replaceAll("_", " ");
  const mark = (token: PumpToken) => (token.symbol || token.token_name || "B").slice(0, 1).toUpperCase();
  const selectedPrice = detail ? displayMetric(detail.current_price_quote || detail.current_price_bnb) : "—";
  const selectedRaised = detail ? displayMetric(detail.total_raised_quote || detail.total_raised_bnb) : "—";
  const selectedSold = detail ? formatUnits(amountFromApi(detail.tokens_sold), 18, 2) : "—";
  const copy = { product: zh ? "链上项目交易终端" : "On-chain project terminal", tagline: zh ? "BNB Chain · bitbt.fun · 非托管实时交易" : "BNB Chain · bitbt.fun · non-custodial live trading", meta: zh ? "真实钱包 · 实时报价 · 链上回执" : "REAL WALLET · LIVE QUOTES · ON-CHAIN RECEIPTS", connect: zh ? "连接钱包" : "Connect wallet", search: zh ? "搜索名称、符号或地址" : "Search name, symbol or address", quote: zh ? "报价币" : "Quote token", receive: zh ? "预计到账" : "You receive", amount: zh ? "数量" : "AMOUNT", balance: zh ? "余额" : "Balance", trades: zh ? "最近交易" : "Recent trades", demo: zh ? "实时数据 — 已连接 Pump API" : "LIVE DATA — CONNECTED TO THE PUMP API", empty: zh ? "暂无项目数据。" : "No projects available." };
  const currentWalletLabel = address ? address.slice(0, 6) + "…" + address.slice(-4) : copy.connect;
  const formatTradeTime = (value: number) => { const minutes = Math.max(0, Math.floor((now - (value > 1e12 ? value : value * 1000)) / 60000)); return minutes < 60 ? minutes + "m" : minutes < 1440 ? Math.floor(minutes / 60) + "h" : Math.floor(minutes / 1440) + "d"; };
  const selectedStatus = selected ? statusLabel(selected) : "";
  const selectedQuote = detail?.quote_token || selected?.quote_token || "BNB";
  const executeLabel = busy ? phase : side === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-accent px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-accent-foreground">{copy.demo}</div>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur"><div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2"><svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true"><rect width="24" height="24" rx="6" className="fill-foreground" /><path d="M7 17V7h5.2a3 3 0 0 1 0 6H9.4" className="stroke-accent" strokeWidth="2.2" fill="none" /></svg><span className="text-sm font-semibold tracking-[0.18em] text-foreground">BITBT</span><span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold tracking-[0.14em] text-accent-foreground">PUMP</span></span>
        <div className="flex shrink-0 items-center gap-2"><a href={zh ? "/en/pump" : "/zh/pump"} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">{zh ? "EN" : "中文"}</a><PumpWalletConnect compact onConnected={setAddress} /></div>
      </div></header>
      <section className="border-b border-border"><div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 py-6 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">BitBT {copy.product}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.tagline}</p></div><span className="hidden text-right text-xs text-muted-foreground sm:block">{copy.meta}</span></div></section>
      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-xl border border-border bg-card">
          <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 [scrollbar-width:none]">{tabs.map(([tab, label]) => <button key={tab} type="button" onClick={() => { setActiveTab(tab); setPage(1); }} className={activeTab === tab ? "shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background" : "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"}>{label}</button>)}</div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border p-3"><input value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(1); }} placeholder={copy.search} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground" /><select value={quoteFilter === "all" ? "ALL" : quoteFilter} onChange={(e) => { setQuoteFilter(e.target.value === "ALL" ? "all" : e.target.value); setPage(1); }} className="shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-foreground" aria-label={copy.quote}><option value="ALL">{zh ? "全部报价币" : "All quote tokens"}</option><option value="BNB">BNB</option><option value="USDT">USDT</option><option value="USDC">USDC</option><option value="GW">GW</option></select></div>
          <div className="hidden grid-cols-[minmax(0,1fr)_88px_96px_84px] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid"><span>{zh ? "项目" : "Token"}</span><span>{zh ? "进度" : "Progress"}</span><span className="text-right">{zh ? "价格" : "Price"}</span><span className="text-right">{zh ? "募资" : "Raised"}</span></div>
          <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible">
            {loading && <li className="px-3 py-10 text-center text-sm text-muted-foreground">{zh ? "正在获取 Pump 项目…" : "Loading Pump projects…"}</li>}
            {!loading && visibleTokens.map((token) => <li key={token.contract_address}><button type="button" onClick={() => void selectToken(token)} className={"grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary sm:grid-cols-[minmax(0,1fr)_88px_96px_84px]" + (selected?.contract_address === token.contract_address ? " bg-secondary" : "")}><span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-[11px] font-bold text-background">{mark(token)}</span><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium">{token.token_name}</span><span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">{token.symbol}</span></span><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground"><span>{statusLabel(token)}</span><span>·</span><span>{token.quote_token}</span><span>·</span><span>{age(token.submitted_at)}</span></span><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-muted-foreground sm:hidden"><span>{priceOf(token)}</span><span>·</span><span>{raisedOf(token)} {token.quote_token}</span></span></span><span className="justify-self-end sm:justify-self-start"><span className="flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-accent" style={{ width: Math.round(Math.max(0, Math.min(100, token.progress_percent ?? 0))) + "%" }} /></span><span className="tabular-nums text-xs text-foreground">{token.progress_percent == null ? "—" : Math.round(token.progress_percent) + "%"}</span></span></span><span className="hidden text-right text-xs tabular-nums sm:block">{priceOf(token)}</span><span className="hidden text-right text-xs tabular-nums sm:block">{raisedOf(token)} {token.quote_token}</span></span></button></li>)}
            {!loading && visibleTokens.length === 0 && <li className="px-3 py-10 text-center text-sm text-muted-foreground">{tokens.length === 0 ? copy.empty : (zh ? "没有匹配的项目。" : "No matching projects.")}</li>}
          </ul>
          {error && <div role="alert" className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        </section>
        <section className="min-w-0 space-y-4">
          {!detail ? <div className="rounded-xl border border-border bg-foreground p-10 text-center text-sm text-background/70">{detailLoading ? (zh ? "加载详情与交易记录…" : "Loading detail and trades…") : (zh ? "选择项目" : "SELECT A PROJECT")}</div> : <>
            <div className="rounded-xl border border-border bg-foreground p-4 text-background"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-semibold">{detail.token_name}</h2><p className="text-xs opacity-70">{detail.symbol} / {selectedQuote} · {selectedStatus}</p><p className="mt-1 text-[10px] opacity-50">Curve {shortened(detail.curve_address)} · {detail.progress_percent}% bonded</p></div><p className="shrink-0 text-right text-lg font-semibold tabular-nums text-accent">{selectedPrice}</p></div><div className="mt-3 -mx-1"><div className="mb-2 flex justify-end gap-1">{(["1h", "4h", "1d", "all"] as ChartPeriod[]).map((period) => <button type="button" key={period} onClick={() => setChartPeriod(period)} className={chartPeriod === period ? "rounded bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground" : "rounded bg-background/10 px-2 py-1 text-[10px] text-background/70"}>{period}</button>)}</div><KLineChart candles={candles} /></div><dl className="mt-3 grid grid-cols-3 gap-2 border-t border-background/15 pt-3 text-xs"><div><dt className="opacity-60">{zh ? "募资" : "Raised"}</dt><dd className="tabular-nums">{selectedRaised} {selectedQuote}</dd></div><div><dt className="opacity-60">{zh ? "已售" : "Sold"}</dt><dd className="tabular-nums">{selectedSold} {detail.symbol}</dd></div><div><dt className="opacity-60">{zh ? "进度" : "Progress"}</dt><dd className="tabular-nums">{detail.progress_percent}%</dd></div></dl></div>
            <div className="rounded-xl border border-border bg-card p-4"><div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">{(["buy", "sell"] as const).map((s) => <button key={s} type="button" onClick={() => setSide(s)} className={side === s ? "rounded-md bg-accent py-2 text-sm font-semibold text-accent-foreground" : "rounded-md py-2 text-sm font-semibold text-muted-foreground"}>{s === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")}</button>)}</div><label className="mt-3 block text-[11px] uppercase tracking-wide text-muted-foreground">{copy.amount}<span className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" disabled={busy} className="min-w-0 flex-1 bg-transparent text-base tabular-nums text-foreground outline-none" /><span className="shrink-0 text-xs font-medium text-muted-foreground">{side === "buy" ? selectedQuote : detail.symbol}</span></span></label><div className="mt-2 flex flex-wrap gap-1">{quickAmounts.map((value) => <button type="button" key={value} onClick={() => setAmount(value)} className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">{value}</button>)}<button type="button" onClick={setMaxAmount} className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">Max</button></div><dl className="mt-3 space-y-2 text-xs"><div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{copy.receive}</dt><dd className="shrink-0 tabular-nums">{quoteLoading ? (zh ? "获取中…" : "Loading…") : quote ? formatUnits(output) + " " + (outputSymbol || "") : "—"}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{zh ? "滑点" : "Slippage"}</dt><dd><select value={slippageBps} onChange={(e) => saveSlippage(Number(e.target.value))} className="rounded border border-border bg-background px-1 py-0.5 text-xs"><option value="50">0.5%</option><option value="100">1.0%</option><option value="200">2.0%</option><option value="500">5.0%</option></select></dd></div><div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{zh ? "优先费" : "Priority fee"}</dt><dd><select value={priorityGwei} onChange={(e) => savePriority(Number(e.target.value))} className="rounded border border-border bg-background px-1 py-0.5 text-xs"><option value="1">1 gwei</option><option value="2">2 gwei</option><option value="3">3 gwei</option></select></dd></div><div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{copy.balance} · {selectedQuote}</dt><dd className="tabular-nums">{formatUnits(balances.quote)}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{copy.balance} · {detail.symbol}</dt><dd className="tabular-nums">{formatUnits(balances.token)}</dd></div></dl><button type="button" onClick={() => void (address ? execute().catch((cause) => setError(errorMessage(cause))) : document.querySelector(".pump-wallet-connect button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })))} disabled={busy || (!!address && !quote)} className="mt-4 w-full rounded-lg bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{address ? executeLabel : currentWalletLabel}</button>{feeDisplay && <p className="mt-2 text-center text-[11px] text-muted-foreground">Fee {feeDisplay} {selectedQuote}</p>}{phase && <p className="mt-2 text-center text-[11px] text-muted-foreground">{phase} {txHash && <a className="underline" href={"https://bscscan.com/tx/" + txHash} target="_blank" rel="noreferrer">{shortened(txHash)}</a>}</p>}</div>
            <div className="rounded-xl border border-border bg-card"><h3 className="border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">{copy.trades}</h3><ul className="divide-y divide-border">{trades.slice(0, 20).map((tr) => <li key={tr.tx_hash + ":" + tr.timestamp} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-xs"><span className={tr.trade_type === "buy" ? "rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground" : "rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"}>{tr.trade_type === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")}</span><span className="min-w-0 truncate text-muted-foreground">{shortened(tr.trader)}</span><span className="shrink-0 tabular-nums">{tr.token_amount} · {formatTradeTime(tr.timestamp)}</span></li>)}{trades.length === 0 && <li className="px-4 py-5 text-center text-xs text-muted-foreground">{zh ? "暂无交易记录。" : "No trades recorded yet."}</li>}</ul></div>
          </>}
        </section>
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-[11px] text-muted-foreground">bitbt.fun · BitBT PUMP · {copy.demo}</footer>
    </div>
  );
}
