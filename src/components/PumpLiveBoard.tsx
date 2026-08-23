"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pumpApi, type PumpDetail, type PumpQuote, type PumpToken, type PumpTrade } from "@/lib/pump-api";
import { PUMP_SELECTORS, EvmWallet, approveData, assertPumpQuoteBinding, formatUnits, getAllowance, getDynamicFeePolicy, getErc20Balance, getNativeBalance, getPumpCurveBinding, getQuoteTokenAddress, isAddress, isSupportedQuoteToken, parseUnits, receiptSucceeded, resolvePumpCurveAddress, sendTransaction, switchToBsc, waitForReceipt, word } from "@/lib/pump-chain";
import { buildPumpKlineFromTrades } from "@/lib/pump-kline";
import { PumpTerminal, type PumpCopy, type TerminalToken, type TerminalTrade } from "@/components/pump/PumpTerminal";

type Side = "buy" | "sell";
type ListTab = "all" | "trending" | "creating" | "newly_created" | "almost_bonded" | "migrated";
type Balances = { quote: bigint; token: bigint; gas: bigint };
type QuoteBinding = { tokenAddress: string; side: Side; amount: string; curveAddress: string; quoteToken: string; createdAt: number };

function amountFromApi(value?: string): bigint { if (!value) return 0n; return /^\d+$/.test(value) ? BigInt(value) : parseUnits(value); }
function shortened(value: string): string { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function errorMessage(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
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
  const slippageBps = 100;
  const priorityGwei = 1;
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balances, setBalances] = useState<Balances>({ quote: 0n, token: 0n, gas: 0n });
  const [phase, setPhase] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string>();

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
  const candles = useMemo(() => buildPumpKlineFromTrades(trades, "1h", 80), [trades]);
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

  const [now] = useState(() => Date.now());
  const age = (value?: string) => {
    if (!value) return "—";
    const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
    return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
  };
  const statusLabel = (token: PumpToken) => token.status.replaceAll("_", " ");



  const copy: PumpCopy = {
    demo: zh ? "实时数据 — 已连接 Pump API" : "LIVE DATA — CONNECTED TO THE PUMP API",
    disconnected: zh ? "未连接" : "Not connected",
    product: zh ? "链上项目交易终端" : "On-chain project terminal",
    tagline: zh ? "BNB Chain · bitbt.fun · 非托管实时交易" : "BNB Chain · bitbt.fun · non-custodial live trading",
    connect: zh ? "连接钱包" : "Connect wallet",
    launch: zh ? "发射代币" : "Launch Token",
    search: zh ? "搜索名称、符号或地址" : "Search name, symbol or address",
    quote: zh ? "报价币" : "Quote token",
    token: zh ? "项目" : "Token",
    progress: zh ? "进度" : "Progress",
    price: zh ? "价格" : "Price",
    raised: zh ? "募资" : "Raised",
    sold: zh ? "已售" : "Sold",
    buy: zh ? "买入" : "Buy",
    sell: zh ? "卖出" : "Sell",
    amount: zh ? "数量" : "AMOUNT",
    youReceive: zh ? "预计到账" : "You receive",
    slippage: zh ? "滑点" : "Slippage",
    priority: zh ? "优先费" : "Priority fee",
    balance: zh ? "余额" : "Balance",
    trades: zh ? "最近交易" : "Recent trades",
    txState: zh ? "交易状态" : "Trade state",
    idle: zh ? "等待操作" : "Idle",
    selectToken: zh ? "选择项目" : "SELECT A PROJECT",
    empty: zh ? "暂无项目数据。" : "No projects available.",
  };
  const terminalTabs = [
    { id: "all", en: "All", zh: "全部" },
    { id: "trending", en: "Trending", zh: "推荐" },
    { id: "creating", en: "Creating", zh: "创建中" },
    { id: "newly_created", en: "New", zh: "新项目" },
    { id: "almost_bonded", en: "Almost bonded", zh: "接近毕业" },
    { id: "migrated", en: "Migrated", zh: "已迁移" },
  ];
  const terminalRows: TerminalToken[] = visibleTokens.map((token) => ({
    id: token.contract_address || token.id,
    name: token.token_name,
    symbol: token.symbol,
    quote: token.quote_token,
    status: statusLabel(token),
    createdAgo: age(token.submitted_at),
    mark: (token.symbol || token.token_name || "B").slice(0, 1).toUpperCase(),
    progress: token.progress_percent == null ? null : Math.max(0, Math.min(1, token.progress_percent / 100)),
    price: Number.isFinite(Number(token.current_price_quote || token.current_price_bnb)) ? Number(token.current_price_quote || token.current_price_bnb) : null,
    raised: Number.isFinite(Number(token.total_raised_quote || token.total_raised_bnb)) ? Number(token.total_raised_quote || token.total_raised_bnb) : null,
    sold: null,
  }));
  const terminalSelected: TerminalToken | undefined = selected && detail ? {
    id: selected.contract_address || selected.id,
    name: detail.token_name,
    symbol: detail.symbol,
    quote: detail.quote_token,
    status: statusLabel(selected),
    createdAgo: age(selected.submitted_at),
    mark: (detail.symbol || detail.token_name || "B").slice(0, 1).toUpperCase(),
    progress: detail.progress_percent == null ? null : Math.max(0, Math.min(1, detail.progress_percent / 100)),
    price: Number.isFinite(Number(detail.current_price_quote || detail.current_price_bnb)) ? Number(detail.current_price_quote || detail.current_price_bnb) : null,
    raised: Number.isFinite(Number(detail.total_raised_quote || detail.total_raised_bnb)) ? Number(detail.total_raised_quote || detail.total_raised_bnb) : null,
    sold: Number.isFinite(Number(detail.tokens_sold)) ? Number(detail.tokens_sold) : null,
  } : undefined;
  const terminalTrades: TerminalTrade[] = trades.slice(0, 20).map((trade, index) => ({
    id: trade.tx_hash + ":" + trade.timestamp + ":" + index,
    side: trade.trade_type === "buy" ? "buy" : "sell",
    account: shortened(trade.trader),
    amount: Number(trade.quote_amount || trade.bnb_amount || trade.token_amount || "0") || 0,
    ago: age(new Date(trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000).toISOString()),
  }));
  const onTerminalTrade = () => {
    if (!address) {
      document.querySelector<HTMLButtonElement>(".pump-wallet-connect button")?.click();
      return;
    }
    void execute().catch((cause) => setError(errorMessage(cause)));
  };
  const onTerminalSelect = (id: string) => {
    const token = tokens.find((item) => (item.contract_address || item.id) === id);
    if (token) void selectToken(token);
  };
  const executeLabel = busy ? phase : address ? (side === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")) : copy.connect;

  return <PumpTerminal
    lang={zh ? "zh" : "en"}
    copy={copy}
    rows={terminalRows}
    selected={detailLoading ? undefined : terminalSelected}
    candles={candles}
    trades={terminalTrades}
    tabs={terminalTabs}
    tab={activeTab}
    setTab={(value) => { setActiveTab(value as ListTab); setPage(1); }}
    query={searchText}
    setQuery={(value) => { setSearchText(value); setPage(1); }}
    quote={quoteFilter === "all" ? "ALL" : quoteFilter}
    setQuote={(value) => { setQuoteFilter(value === "ALL" ? "all" : value); setPage(1); }}
    selectedId={selected?.contract_address || selected?.id || ""}
    setSelectedId={onTerminalSelect}
    side={side}
    setSide={setSide}
    amount={amount}
    setAmount={setAmount}
    onConnected={setAddress}
    onTrade={onTerminalTrade}
    tradeDisabled={busy || (!!address && !quote)}
    actionLabel={executeLabel}
    txState={error ? error + (txHash ? " " + shortened(txHash) : "") : phase || (quoteLoading ? (zh ? "获取报价中…" : "Fetching quote…") : copy.idle)}
    receiveValue={quote ? formatUnits(output) + " " + (side === "buy" ? selected?.symbol || "" : detail?.quote_token || "") : "—"}
    slippageValue={(slippageBps / 100).toFixed(1) + "%"}
    priorityValue={priorityGwei + " gwei"}
    quoteBalance={formatUnits(balances.quote) + " " + (detail?.quote_token || selected?.quote_token || "")}
    tokenBalance={formatUnits(balances.token) + " " + (selected?.symbol || "")}
  />;
}
