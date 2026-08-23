"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pumpApi, type PumpDetail, type PumpQuote, type PumpToken, type PumpTrade } from "@/lib/pump-api";
import { PUMP_SELECTORS, EvmWallet, approveData, assertPumpQuoteBinding, formatUnits, getAllowance, getDynamicFeePolicy, getErc20Balance, getNativeBalance, getPumpCurveBinding, getPumpQuickAmounts, getQuoteTokenAddress, isAddress, isSupportedQuoteToken, parseUnits, receiptSucceeded, resolvePumpCurveAddress, sendTransaction, switchToBsc, waitForReceipt, word } from "@/lib/pump-chain";
import { buildPumpKlineFromTrades } from "@/lib/pump-kline";
import PumpWalletConnect from "@/components/PumpWalletConnect";

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
  const candleChart = useMemo(() => {
    if (candles.length === 0) return [];
    const min = Math.min(...candles.map((candle) => candle.low));
    const max = Math.max(...candles.map((candle) => candle.high));
    const range = max - min || 1;
    const y = (value: number) => 92 - ((value - min) / range) * 80;
    return candles.map((candle, index) => ({ x: 8 + (index / Math.max(1, candles.length - 1)) * 304, high: y(candle.high), low: y(candle.low), open: y(candle.open), close: y(candle.close), rising: candle.close >= candle.open }));
  }, [candles]);
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

  return <section className="pump-terminal-board">
    <div className="hidden"><PumpWalletConnect compact onConnected={setAddress} /></div>
    <div className="pump-terminal-board__controls">
      <div className="pump-terminal-board__tabs">{tabs.map(([tab, label]) => <button type="button" key={tab} onClick={() => { setActiveTab(tab); setPage(1); }} className={activeTab === tab ? "active" : ""}>{label}</button>)}</div>
      <div className="pump-terminal-board__search"><input value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1); }} placeholder={zh ? "搜索名称、符号或地址" : "Search name, symbol or address"} /><select value={quoteFilter} onChange={(event) => { setQuoteFilter(event.target.value); setPage(1); }} aria-label={zh ? "报价币" : "Quote token"}><option value="all">{zh ? "全部报价币" : "All quote tokens"}</option><option value="BNB">BNB</option><option value="USDT">USDT</option><option value="USDC">USDC</option><option value="GW">GW</option><option value="other">{zh ? "其他" : "Other"}</option></select><button type="button" onClick={() => void loadTokens()}>{zh ? "刷新" : "Refresh"}</button></div>
    </div>
    {error && <div role="alert" className="pump-terminal-board__error">{error}</div>}
    <div className="pump-terminal-board__grid">
      <div className="pump-terminal-board__list-wrap">
        <div className="pump-terminal-board__columns"><span>{zh ? "项目" : "Token"}</span><span>{zh ? "进度" : "Progress"}</span><span>{zh ? "价格" : "Price"}</span><span>{zh ? "募资" : "Raised"}</span></div>
        <div className="pump-terminal-board__list">{loading && <div className="pump-terminal-board__empty">{zh ? "正在获取 Pump 项目…" : "Loading Pump projects…"}</div>}{!loading && visibleTokens.map((token) => <button type="button" key={`${token.chain_id}:${token.contract_address}`} onClick={() => void selectToken(token)} className={`pump-token-row ${selected?.contract_address === token.contract_address ? "selected" : ""}`}><span className="pump-token-row__identity"><span className="pump-token-row__avatar">B</span><span><strong>{token.token_name}</strong><small>{token.status} · {token.quote_token} · {age(token.submitted_at)}</small><em>{token.symbol}</em></span></span><span className="pump-token-row__progress"><i><b style={{ width: `${Math.max(0, Math.min(100, token.progress_percent ?? 0))}%` }} /></i><span>{token.progress_percent ?? 0}%</span></span><span className="pump-token-row__metric">{priceOf(token)}</span><span className="pump-token-row__metric">{raisedOf(token)} {token.quote_token}</span></button>)}{!loading && visibleTokens.length === 0 && <div className="pump-terminal-board__empty">{tokens.length === 0 ? (zh ? "当前没有可展示的 Pump 项目。" : "No Pump projects are available right now.") : (zh ? "没有匹配的项目。" : "No matching projects.")}</div>}</div>
        <div className="pump-terminal-board__pagination"><span>{filteredTokens.length} {zh ? "个项目" : "projects"}</span><span><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>{safePage}/{pageCount}<button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>›</button></span></div>
      </div>
      <div className="pump-terminal-detail">
        {!detail && !detailLoading && <div className="pump-terminal-detail__empty">{zh ? "选择一个项目" : "Select a project"}</div>}
        {detailLoading && <div className="pump-terminal-detail__empty">{zh ? "加载详情与交易记录…" : "Loading detail and trades…"}</div>}
        {detail && !detailLoading && <><div className="pump-terminal-detail__chart"><div className="pump-terminal-detail__heading"><div><span>{detail.symbol} / {detail.quote_token}</span><h2>{detail.token_name}</h2><small>Curve {shortened(detail.curve_address)} · {detail.progress_percent}% bonded</small></div><strong>{detail.current_price_quote || detail.current_price_bnb} {detail.quote_token}</strong></div><div className="pump-chart-periods">{(["1h", "4h", "1d", "all"] as ChartPeriod[]).map((period) => <button type="button" key={period} onClick={() => setChartPeriod(period)} className={chartPeriod === period ? "active" : ""}>{period}</button>)}</div>{candleChart.length > 0 ? <svg viewBox="0 0 320 100" role="img" aria-label="Pump OHLC candlestick chart">{candleChart.map((candle) => <g key={`${candle.x}:${candle.open}`}><line x1={candle.x} x2={candle.x} y1={candle.high} y2={candle.low} stroke={candle.rising ? "#d9ff46" : "#fca5a5"} /><rect x={candle.x - 2} y={Math.min(candle.open, candle.close)} width="4" height={Math.max(1, Math.abs(candle.close - candle.open))} fill={candle.rising ? "#d9ff46" : "#fca5a5"} /></g>)}</svg> : <p className="pump-terminal-detail__nochart">{zh ? "暂无足够成交数据绘图。" : "Not enough trades for a chart yet."}</p>}<dl><div><dt>{zh ? "募资" : "Raised"}</dt><dd>{detail.total_raised_quote || detail.total_raised_bnb} {detail.quote_token}</dd></div><div><dt>{zh ? "已售" : "Sold"}</dt><dd>{formatUnits(amountFromApi(detail.tokens_sold))} {detail.symbol}</dd></div><div><dt>{zh ? "进度" : "Progress"}</dt><dd>{detail.progress_percent}%</dd></div></dl></div><div className="pump-terminal-trade"><div className="pump-terminal-trade__switch"><button type="button" onClick={() => setSide("buy")} className={side === "buy" ? "active" : ""}>{zh ? "买入" : "Buy"}</button><button type="button" onClick={() => setSide("sell")} className={side === "sell" ? "active" : ""}>{zh ? "卖出" : "Sell"}</button></div><label>{side === "buy" ? `${zh ? "支付" : "Pay"} ${detail.quote_token}` : `${zh ? "卖出" : "Sell"} ${detail.symbol}`}<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" disabled={busy} /><span>{side === "buy" ? detail.quote_token : detail.symbol}</span></label><div className="pump-terminal-trade__quick">{quickAmounts.map((value) => <button type="button" key={value} onClick={() => setAmount(value)}>{value}</button>)}<button type="button" onClick={setMaxAmount}>Max</button></div><div className="pump-terminal-trade__settings"><label>Slippage<select value={slippageBps} onChange={(event) => saveSlippage(Number(event.target.value))}><option value="50">0.5%</option><option value="100">1%</option><option value="200">2%</option><option value="500">5%</option></select></label><label>Priority<select value={priorityGwei} onChange={(event) => savePriority(Number(event.target.value))}><option value="1">1 gwei</option><option value="2">2 gwei</option><option value="3">3 gwei</option></select></label></div><p className="pump-terminal-trade__quote">{quoteLoading ? (zh ? "获取报价中…" : "Fetching quote…") : quote ? `${zh ? "预计到账" : "Estimated receive"}: ${formatUnits(output)} ${outputSymbol}${feeDisplay ? ` · Fee ${feeDisplay} ${detail.quote_token}` : ""}` : (zh ? "输入数量获取实时报价" : "Enter an amount for a live quote")}</p><div className="pump-terminal-trade__balances"><span>{side === "sell" ? `Balance: ${formatUnits(balances.token)} ${detail.symbol}` : `Balance: ${formatUnits(balances.quote)} ${detail.quote_token}`}</span><span>Gas: {formatUnits(balances.gas)} BNB</span></div><button type="button" onClick={() => void execute().catch((cause) => setError(errorMessage(cause)))} disabled={busy || !quote || !address}>{busy ? phase : `${side === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")} ${detail.symbol}`}</button>{phase && <p>{phase} {txHash && <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">{shortened(txHash)}</a>}</p>}</div><div className="pump-terminal-trades"><h3>{zh ? "最近交易" : "Recent trades"}<button type="button" onClick={() => selected && void selectToken(selected)}>{zh ? "刷新" : "Refresh"}</button></h3>{trades.length === 0 ? <p>{zh ? "暂无交易记录。" : "No trades recorded yet."}</p> : trades.slice(0, 20).map((trade) => <div key={`${trade.tx_hash}:${trade.timestamp}`}><span className={trade.trade_type === "buy" ? "buy" : "sell"}>{trade.trade_type}</span><span>{trade.token_amount} {detail.symbol}</span><small>{trade.quote_amount || trade.bnb_amount} {trade.quote_token || detail.quote_token} · {shortened(trade.trader)}</small></div>)}</div></>}
      </div>
    </div>
  </section>;
}
