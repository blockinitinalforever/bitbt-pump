/* Live data adapter for the delivered Launchpad UI. The HTML/CSS stays the source of truth. */
(() => {
  const root = document.getElementById("bitbt-launch");
  if (!root) return;
  const state = { tokens: [], tokenFilter: "trending", tokenSearch: "", liveFilter: "all", rankFilter: "progress", myLaunchFilter: "all", historyFilter: "all", details: {}, holders: {}, marketActivity: [], marketSummary: {}, config: null, selected: null, detail: null, trades: [], myLaunches: [], history: [], creatorRewards: [], favorites: [], side: "buy", quote: null, quoteKey: "", account: "", chainId: "", sessionExpiresAt: 0, provider: null, balances: { quote: null, token: null, gas: null }, chartInterval: 300, busy: false, launchBusy: false, launchQuote: "BNB", launchMode: "fair", curveMode: "standard", taxEnabled: false, launchLogoUrl: "", launchSnapshot: null, launchConfirmation: null, launchTerminal: false, refreshPromise: null };
  const SESSION_KEY = "bitbt_pump_session";
  const SESSION_ADDRESS_KEY = "bitbt_pump_session_address";
  const LOCALE_KEY = "bitbt_pump_locale";
  const PENDING_LAUNCH_CONFIRMATION_KEY = "bitbt_pump_pending_launch_confirmation";
  const charts = new Map();
  const announcedProviders = [];
  const boundProviders = new Set();
  let providerSelectionPromise = null;
  let walletConnectionPromise = null;
  const isEvmProvider = (provider) => { try { return Boolean(provider && typeof provider.request === "function"); } catch { return false; } };
  const safeProviderInfo = (info) => { try { return { name: typeof info?.name === "string" ? info.name.slice(0, 80) : "EVM Wallet", rdns: typeof info?.rdns === "string" ? info.rdns.slice(0, 120) : "" }; } catch { return { name: "EVM Wallet", rdns: "" }; } };
  const providerIdentity = (provider, info = {}) => `${info.rdns || ""} ${info.name || ""} ${provider?.isOkxWallet ? "okx" : ""} ${provider?.isOKExWallet ? "okx" : ""} ${provider?.isBinance ? "binance" : ""} ${provider?.isBinanceWallet ? "binance" : ""} ${provider?.isTokenPocket ? "tokenpocket" : ""} ${provider?.isMetaMask ? "metamask" : ""}`.toLowerCase();
  const providerScore = (entry) => { const identity = providerIdentity(entry.provider, entry.info); if (/okx|okex/.test(identity)) return 500; if (/binance/.test(identity)) return 400; if (/tokenpocket|token pocket/.test(identity)) return 300; if (/metamask/.test(identity)) return 200; return 100; };
  const walletWindows = () => {
    const windows = [window];
    try {
      let candidate = window.parent;
      while (candidate && !windows.includes(candidate) && candidate.location?.origin === window.location.origin) {
        windows.push(candidate);
        if (!candidate.parent || candidate.parent === candidate) break;
        candidate = candidate.parent;
      }
    } catch {}
    return windows;
  };
  const rememberProvider = (provider, info = {}, trustedDirect = false) => {
    if (!isEvmProvider(provider)) return;
    const safeInfo = safeProviderInfo(info);
    const existing = announcedProviders.find((entry) => entry.provider === provider);
    if (existing) { existing.info = { ...existing.info, ...safeInfo }; existing.trustedDirect ||= trustedDirect; }
    else announcedProviders.push({ provider, info: safeInfo, trustedDirect, userApproved: false });
  };
  const collectProviders = () => {
    walletWindows().forEach((walletWindow) => {
      rememberProvider(walletWindow.okxwallet?.ethereum || walletWindow.okxwallet, { name: "OKX Wallet", rdns: "com.okex.wallet" }, true);
      rememberProvider(walletWindow.BinanceChain, { name: "Binance Wallet", rdns: "com.binance.wallet" }, true);
      rememberProvider(walletWindow.binancew3w?.ethereum || walletWindow.binancew3w, { name: "Binance Web3 Wallet", rdns: "com.binance.wallet" }, true);
      rememberProvider(walletWindow.tokenpocket?.ethereum, { name: "TokenPocket", rdns: "pro.tokenpocket" }, true);
      const injected = walletWindow.ethereum;
      if (Array.isArray(injected?.providers)) injected.providers.forEach((provider) => rememberProvider(provider, {}, true));
      rememberProvider(injected, {}, true);
    });
    return announcedProviders.filter((entry) => (entry.trustedDirect || entry.userApproved) && isEvmProvider(entry.provider)).sort((a, b) => providerScore(b) - providerScore(a));
  };
  const selectedProvider = () => {
    const preferred = collectProviders()[0]?.provider || null;
    if (!state.account && !isEvmProvider(state.provider) && preferred) state.provider = preferred;
    if (isEvmProvider(state.provider)) return state.provider;
    state.provider = preferred;
    return state.provider;
  };
  const requestProviderAnnouncements = () => walletWindows().forEach((walletWindow) => { try { walletWindow.dispatchEvent(new walletWindow.Event("eip6963:requestProvider")); } catch {} });
  const chooseAnnouncedProvider = () => {
    if (providerSelectionPromise) return providerSelectionPromise;
    const choices = announcedProviders.filter((entry) => !entry.trustedDirect && !entry.userApproved && isEvmProvider(entry.provider));
    if (!choices.length) return Promise.reject(new Error("未检测到 EVM 钱包"));
    providerSelectionPromise = new Promise((resolve, reject) => {
      const overlay = document.createElement("div"); overlay.className = "wallet-provider-overlay"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "选择 EVM 钱包");
      const panel = document.createElement("div"); panel.className = "wallet-provider-dialog";
      const title = document.createElement("h2"); title.textContent = "选择钱包";
      const note = document.createElement("p"); note.textContent = "请选择你当前正在使用的钱包。只有确认后，页面才会请求连接和签名。";
      const list = document.createElement("div"); list.className = "wallet-provider-list";
      const cleanup = () => { overlay.remove(); providerSelectionPromise = null; };
      choices.forEach((entry, index) => {
        const button = document.createElement("button"); button.type = "button"; button.dataset.eip6963Provider = String(index);
        const name = document.createElement("strong"); name.textContent = entry.info.name || "EVM Wallet";
        const rdns = document.createElement("small"); rdns.textContent = entry.info.rdns || "EIP-6963 Provider";
        button.append(name, rdns);
        button.addEventListener("click", () => { entry.userApproved = true; state.provider = entry.provider; cleanup(); resolve(entry.provider); });
        list.appendChild(button);
      });
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "wallet-provider-cancel"; cancel.textContent = "取消"; cancel.addEventListener("click", () => { cleanup(); reject(new Error("已取消钱包连接")); });
      panel.append(title, note, list, cancel); overlay.appendChild(panel); root.appendChild(overlay); list.querySelector("button")?.focus();
    });
    return providerSelectionPromise;
  };
  const waitForProvider = async (timeout = 1500) => {
    const immediate = selectedProvider();
    if (immediate) return immediate;
    requestProviderAnnouncements();
    const started = Date.now();
    while (Date.now() - started < timeout) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const provider = selectedProvider();
      if (provider) return provider;
      if (Date.now() - started >= 250 && announcedProviders.some((entry) => !entry.trustedDirect && !entry.userApproved)) return chooseAnnouncedProvider();
    }
    if (announcedProviders.some((entry) => !entry.trustedDirect && !entry.userApproved)) return chooseAnnouncedProvider();
    throw new Error("未检测到 EVM 钱包，请在 OKX、TokenPocket、Binance Wallet 或其他 EVM 钱包内打开");
  };
  const rememberAnnouncedProvider = (event) => {
    rememberProvider(event?.detail?.provider, event?.detail?.info || {}, false);
    if (!state.account && !isEvmProvider(state.provider)) state.provider = collectProviders()[0]?.provider || null;
  };
  walletWindows().forEach((walletWindow) => walletWindow.addEventListener?.("eip6963:announceProvider", rememberAnnouncedProvider));
  requestProviderAnnouncements();
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const text = (selector, value) => $$(selector).forEach((node) => { node.textContent = value == null || value === "" ? "—" : String(value); });
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const validTxHash = (value) => /^0x[0-9a-fA-F]{64}$/.test(String(value || "")) ? String(value) : "";
  const assetImage = (token) => { const remote = token?.logo_url || token?.image_url || token?.logo; return typeof remote === "string" && /^https:\/\//i.test(remote) ? remote : "./assets/tokens/generic.svg"; };
  const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";
  const number = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
  const pretty = (value, digits = 6) => { const parsed = number(value); return parsed ? parsed.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—"; };
  const decimal = (value, digits = 18) => { const raw = String(value ?? "").trim(); if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return "—"; const parsed = Number(raw); if (!Number.isFinite(parsed) || parsed === 0) return raw === "0" ? "0" : "—"; if (Math.abs(parsed) < 0.000001) return raw.replace(/(\.\d*?[1-9])0+$/, "$1"); return parsed.toLocaleString("en-US", { maximumFractionDigits: digits }); };
  const baseUnits = (value, digits = 6) => { try { const raw = String(value || ""); return /^\d+$/.test(raw) ? formatUnits(BigInt(raw), 18, digits) : "—"; } catch { return "—"; } };
  const formatDate = (value) => { const date = new Date(value || 0); return Number.isFinite(date.getTime()) ? date.toLocaleString() : "—"; };
  const age = (value) => { if (!value) return "—"; const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000)); return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`; };
  const friendlyError = (error, fallback = "操作失败，请稍后重试") => {
    const message = String(error?.message || error || "").trim();
    const status = Number(error?.status || 0);
    const code = Number(error?.code ?? error?.data?.originalError?.code);
    if (error?.code === "SESSION_EXPIRED" || status === 401 || /登录已过期|SIWE session|unauthorized/i.test(message)) return "登录已过期，请重新连接钱包";
    if (code === 4001 || /user rejected|user denied|provider rejected/i.test(message)) return "已取消钱包操作";
    if (code === -32002 || /already pending|request.*pending/i.test(message)) return "钱包中已有待处理请求，请先在钱包中处理";
    if (/insufficient funds|exceeds balance|余额不足/i.test(message)) return /[\u3400-\u9fff]/.test(message) ? message : "BNB 余额不足，请补充发射费和 Gas 后重试";
    if (/Address must end with 8888|CREATE2 failed|Factory token bytecode mismatch|发币参数与链上工厂不一致/i.test(message)) return "发币参数与链上 Factory 不一致，请重新加载发币参数";
    if (/Below min threshold/i.test(message)) return "迁移阈值低于链上最低要求，请重新加载发币参数";
    if (/migration_threshold_quote/i.test(message)) return "自定义迁移目标超出当前 Factory 允许范围，请按提示调整后重试";
    if (status === 413 || /payload too large|request entity too large/i.test(message)) return "文件过大，请压缩后重试";
    if (status === 429 || /rate limit|too many requests/i.test(message)) return "操作过于频繁，请稍后重试";
    if (error?.name === "AbortError" || /timeout|timed out/i.test(message)) return "请求超时，请检查网络后重试";
    if (/failed to fetch|networkerror|network error|load failed|connection (?:reset|closed|lost)|stream disconnected/i.test(message)) return "网络连接中断，请检查网络后重试";
    if (status >= 500 || /bad gateway|service unavailable|temporarily unavailable/i.test(message)) return "服务暂时不可用，请稍后重试";
    if (/invalid (?:api )?response|unexpected token.*html|json/i.test(message)) return "服务返回异常，请稍后重试";
    return /[\u3400-\u9fff]/.test(message) ? message : fallback;
  };
  const api = async (path, init) => {
    const requestToken = sessionStorage.getItem(SESSION_KEY);
    const response = await fetch(`/api/pump/${path}`, { ...init, cache: "no-store", headers: { accept: "application/json", ...(requestToken ? { authorization: `Bearer ${requestToken}` } : {}), ...(init?.headers || {}) } });
    let payload;
    if (typeof response.text === "function") {
      const raw = await response.text();
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: response.ok ? "Invalid API response" : `Pump API request failed (${response.status})` }; }
    } else {
      try { payload = await response.json(); } catch { payload = { error: "Invalid API response" }; }
    }
    if (response.status === 401) { const rejectedCurrentSession = Boolean(requestToken && requestToken === sessionStorage.getItem(SESSION_KEY)); if (rejectedCurrentSession) resetProviderState("登录已过期，请重新连接钱包"); const error = new Error(rejectedCurrentSession ? "登录已过期，请重新连接钱包" : "请先连接并验证钱包"); error.code = rejectedCurrentSession ? "SESSION_EXPIRED" : "AUTH_REQUIRED"; throw error; }
    if (!response.ok || payload.data === undefined) { const error = new Error(payload.error || payload.message || `Pump API request failed (${response.status})`); error.status = response.status; throw error; }
    return payload.data;
  };
  const toast = (message, duration = 2200) => { const node = $(".toast"); if (!node) return; node.textContent = message; node.classList.add("show"); window.clearTimeout(node._hideTimer); node._hideTimer = window.setTimeout(() => node.classList.remove("show"), duration); };
  const toastError = (error, fallback) => toast(friendlyError(error, fallback), 6000);
  window.addEventListener("bitbt:toast", (event) => toast(event.detail));
  const setLaunchAvailability = (enabled) => $$('[data-open="create-mode"], [data-nav="create-mode"], [data-launch-mode], .launch-now').forEach((node) => { node.classList.add("wallet-gated"); node.disabled = !enabled; node.setAttribute("aria-disabled", String(!enabled)); node.title = enabled ? "开始发币" : "请先连接并验证钱包"; });
  const tokenAddress = (token) => token?.contract_address || "";
  const routeWindow = (() => { try { const parentPath = String(window.parent?.location?.pathname || ""); return window.parent && window.parent !== window && window.parent.location?.origin === window.location.origin && /^\/pump(?:\/|$)/.test(parentPath) ? window.parent : window; } catch { return window; } })();
  const routeLocation = () => routeWindow.location || location;
  const routeHistory = () => routeWindow.history || history;
  const pumpLocale = () => { try { const saved = window.localStorage?.getItem(LOCALE_KEY); if (saved === "en" || saved === "zh") return saved; } catch {} return /^zh(?:-|$)/i.test(String(navigator?.language || "")) ? "zh" : "en"; };
  const pumpBasePath = () => "/pump";
  const routeTokenAddress = () => {
    const match = routeLocation()?.pathname?.match(/^\/pump\/(0x[0-9a-fA-F]{40})\/?$/);
    return match?.[1]?.toLowerCase() || "";
  };
  const setTokenPath = (address, mode = "push") => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    const path = `${pumpBasePath()}/${address.toLowerCase()}`;
    if (mode === "replace") routeHistory().replaceState(null, "", path);
    else routeHistory().pushState(null, "", path);
  };
  const copyText = async (value) => {
    if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const input = document.createElement("textarea"); input.value = value; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select(); const copied = document.execCommand?.("copy"); input.remove(); if (!copied) throw new Error("浏览器禁止复制，请长按内容手动复制");
    }
  };
  const copyTokenAddress = async () => {
    const address = tokenAddress(state.selected);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("当前代币地址无效，暂时无法复制");
    await copyText(address);
    toast("完整代币地址已复制");
  };
  const shareToken = async () => { const address = tokenAddress(state.selected); if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("当前代币链接无效"); const url = `${routeLocation().origin || "https://bitbt.fun"}${pumpBasePath()}/${address.toLowerCase()}`; await copyText(url); toast("代币详情链接已复制"); };
  const status = (token) => String(token?.status || "").replaceAll("_", " ");
  const tokenTaxPercent = (token) => {
    const values = [token?.tax_percent, token?.buy_tax_percent, token?.sell_tax_percent, token?.tax_rate_percent, token?.transfer_tax_percent, token?.tax_bps == null ? null : Number(token.tax_bps) / 100];
    return Math.max(0, ...values.map((value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }));
  };
  const tokenIsMigrated = (token) => Boolean(token?.migrated) || ["migrated", "dex", "graduated"].includes(String(token?.status || "").toLowerCase());
  const tokenCreatedAt = (token) => { const timestamp = Date.parse(String(token?.submitted_at || token?.created_at || "")); return Number.isFinite(timestamp) ? timestamp : 0; };
  const filteredTokens = () => {
    const query = state.tokenSearch.trim().toLowerCase();
    const tokens = state.tokens.filter((token) => !query || [token.token_name, token.symbol, tokenAddress(token)].some((value) => String(value || "").toLowerCase().includes(query)));
    if (state.tokenFilter === "latest") return tokens.sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a));
    if (state.tokenFilter === "near-migration") return tokens.filter((token) => !tokenIsMigrated(token) && Number(token.progress_percent || 0) >= 70).sort((a, b) => Number(b.progress_percent || 0) - Number(a.progress_percent || 0));
    if (state.tokenFilter === "dex") return tokens.filter(tokenIsMigrated).sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a));
    if (state.tokenFilter === "high-tax") return tokens.filter((token) => tokenTaxPercent(token) >= 5).sort((a, b) => tokenTaxPercent(b) - tokenTaxPercent(a));
    return tokens.sort((a, b) => Number(b.progress_percent || 0) - Number(a.progress_percent || 0));
  };
  const tokenCard = (token) => {
    const progress = Math.max(0, Math.min(100, number(token.progress_percent)));
    const address = tokenAddress(token);
    const image = assetImage(token);
    return `<button class="token-card" data-live-token="${escapeHtml(address)}" data-open="detail"><div class="token-head"><img class="token-logo" src="${escapeHtml(image)}" alt="${escapeHtml(token.token_name || token.symbol || "Token")}"><div class="token-name"><strong>${escapeHtml(token.token_name || token.symbol || "—")}</strong><small>${escapeHtml(token.symbol || "—")} · ${escapeHtml(status(token))} · ${escapeHtml(age(token.submitted_at))}</small></div><span class="change up">${progress.toFixed(0)}%</span></div><div class="card-metrics"><div><span>价格</span><strong>${escapeHtml(pretty(token.current_price_quote || token.current_price_bnb))}</strong></div><div><span>募资</span><strong>${escapeHtml(pretty(token.total_raised_quote || token.total_raised_bnb))}</strong></div><div><span>进度</span><strong>${progress.toFixed(0)}%</strong></div></div><div class="curve"><i style="width:${progress}%"></i></div><div class="curve-label"><span>${escapeHtml(token.quote_token || "BNB")}</span><span>${escapeHtml(address ? short(address) : "地址待定")}</span></div></button>`;
  };
  const renderTokens = () => {
    const html = filteredTokens().filter((token) => tokenAddress(token)).map(tokenCard).join("");
    $$(".token-grid").forEach((node) => { node.innerHTML = html || `<p class="footer-note">暂无真实 Pump 项目数据。</p>`; });
    bindLiveTokenSelection();
    renderRank();
  };
  const renderTradeConfig = () => {
    const quote = String(state.detail?.quote_token || "BNB").toUpperCase();
    const configuredAmounts = state.config?.pump?.quickAmountsByQuote?.[quote] || state.config?.pump?.quickAmounts;
    const amounts = Array.isArray(configuredAmounts) ? configuredAmounts : [];
    const chips = [...amounts, "MAX"];
    $$('[data-panel="trade"] [data-amount]').forEach((node, index) => { const amount = chips[index]; node.hidden = amount === undefined; if (amount !== undefined) { node.dataset.amount = amount; node.textContent = amount === "MAX" ? "MAX" : amount; } });
  };
  const renderMarketSummary = () => {
    const summary = state.marketSummary || {};
    const total = Number.isFinite(Number(summary.total_tokens)) ? Number(summary.total_tokens) : state.tokens.length;
    const launches = Number.isFinite(Number(summary.launches_24h)) ? Number(summary.launches_24h) : 0;
    const trades = Number.isFinite(Number(summary.trades_24h)) ? Number(summary.trades_24h) : 0;
    text("[data-market-total]", total.toLocaleString("en-US"));
    text("[data-market-launches]", launches.toLocaleString("en-US"));
    text("[data-market-trades]", trades.toLocaleString("en-US"));
    text("[data-market-live-count]", `LIVE ${state.marketActivity.length}`);
    text("[data-market-stream-status]", `BNB Chain 数据流已连接 · 最近 ${state.marketActivity.length} 条真实动态`);
    const banner = $("[data-api-status]");
    if (banner) banner.textContent = `实时 Pump 数据已连接 · ${total} 个项目 · ${state.marketActivity.length} 条最新动态`;
  };
  const renderLiveRows = () => {
    const visible = state.marketActivity.filter((item) => state.liveFilter === "all" || String(item.activity_type).toLowerCase() === state.liveFilter);
    const rows = visible.slice(0, 100).map((item) => {
      const kind = String(item.activity_type || "").toLowerCase();
      const label = kind === "buy" ? "BUY" : kind === "sell" ? "SELL" : "NEW";
      const token = state.tokens.find((entry) => tokenAddress(entry).toLowerCase() === String(item.token_address || "").toLowerCase());
      const symbol = item.symbol || item.token_name || token?.symbol || "TOKEN";
      const amount = kind === "create" ? `创建 ${symbol}` : `${decimal(item.quote_amount)} ${item.quote_token || "BNB"} · ${decimal(item.token_amount)} ${symbol}`;
      const timestamp = Number(item.timestamp); const eventAge = age(new Date((timestamp > 1e12 ? timestamp : timestamp * 1000)).toISOString());
      return `<button class="live-row" data-live-token="${escapeHtml(item.token_address || "")}" type="button"><span class="trade-type ${kind === "buy" ? "buy" : kind === "sell" ? "sell" : ""}">${label}</span><div><p><b>${escapeHtml(short(item.trader))}</b> · ${escapeHtml(symbol)}</p><small>${escapeHtml(amount)} · ${escapeHtml(item.status || "—")}</small></div><small>${escapeHtml(eventAge)}</small></button>`;
    }).join("");
    const livePanel = $('[data-panel="live"]');
    if (livePanel) { [...livePanel.querySelectorAll(".live-row, .footer-note")].forEach((node) => node.remove()); livePanel.querySelector(".filter-row")?.insertAdjacentHTML("afterend", rows || `<p class="footer-note">暂无真实全市场链上动态。</p>`); }
    bindLiveTokenSelection();
  };
  const renderRank = () => {
    const panel = $('[data-panel="rank"]'); if (!panel) return;
    [...panel.querySelectorAll(".rank-row")].forEach((node) => node.remove());
    let ranked = [...state.tokens]; if (state.rankFilter === "latest") ranked.sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a)); else if (state.rankFilter === "migrated") ranked = ranked.filter(tokenIsMigrated).sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a)); else ranked.sort((a, b) => number(b.progress_percent) - number(a.progress_percent));
    const rows = ranked.slice(0, 10).map((token, index) => `<button class="rank-row" data-live-token="${escapeHtml(tokenAddress(token))}"><span class="num">${String(index + 1).padStart(2, "0")}</span><img src="${escapeHtml(assetImage(token))}" alt="${escapeHtml(token.symbol || "Token")}"><div><strong>${escapeHtml(token.symbol || token.token_name || "—")}</strong><small>${escapeHtml(status(token))} · ${escapeHtml(token.quote_token || "BNB")}</small></div><div class="rank-price"><strong>${escapeHtml(decimal(token.current_price_quote || token.current_price_bnb))}</strong><span class="up">${number(token.progress_percent).toFixed(0)}%</span></div></button>`).join("");
    panel.querySelector(".rank-tabs")?.insertAdjacentHTML("afterend", rows || `<p class="footer-note">暂无真实 Pump 排行数据。</p>`);
    bindLiveTokenSelection();
    text("[data-rank-total]", state.tokens.length);
    text("[data-rank-migrated]", state.tokens.filter(tokenIsMigrated).length);
    text("[data-rank-progress]", state.tokens.length ? `${Math.max(...state.tokens.map((token) => number(token.progress_percent))).toFixed(0)}%` : "—");
  };
  const renderHolders = (address, payload) => {
    if (tokenAddress(state.selected).toLowerCase() !== String(address || "").toLowerCase()) return;
    const rows = Array.isArray(payload?.top_holders) ? payload.top_holders : [];
    if (payload?.available === false) {
      text("[data-holder-count]", "等待链上索引");
      const list = $("[data-holder-list]");
      if (list) list.innerHTML = `<p class="footer-note">该代币已上线，但持有人数据源尚未完成索引。请稍后刷新；这里不会展示推测数据。</p>`;
      return;
    }
    text("[data-holder-count]", payload?.holders_count ? `${Number(payload.holders_count).toLocaleString("en-US")} 位持有人` : "暂无可用持有人数据");
    const list = $("[data-holder-list]");
    if (!list) return;
    list.innerHTML = rows.length ? `<div class="data-table">${rows.slice(0, 10).map((holder, index) => {
      const holderAddress = String(holder?.address || "");
      const percentage = Number(holder?.percentage);
      const safePercentage = Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
      return `<div class="holder-bar"><div class="holder-address"><span class="num">${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(short(holderAddress))}</strong>${holderAddress.toLowerCase() === String(state.detail?.creator || "").toLowerCase() ? '<span class="creator-badge">CREATOR</span>' : ""}</div><i style="--w:${safePercentage}%"></i><strong>${safePercentage ? `${safePercentage.toFixed(2)}%` : "—"}</strong></div>`;
    }).join("")}</div>` : `<p class="footer-note">当前数据源尚未返回该代币的持有人分布，不展示推测数据。</p>`;
  };
  const loadHolders = async () => {
    const address = tokenAddress(state.selected).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return;
    if (state.holders[address]) { renderHolders(address, state.holders[address]); return; }
    text("[data-holder-count]", "正在读取…");
    const list = $("[data-holder-list]"); if (list) list.innerHTML = `<p class="footer-note">正在读取真实持有人数据…</p>`;
    try {
      const payload = await api(`v1/pump/holders?token_address=${encodeURIComponent(address)}`);
      state.holders[address] = payload;
      renderHolders(address, payload);
    } catch (error) {
      if (tokenAddress(state.selected).toLowerCase() !== address) return;
      text("[data-holder-count]", "暂不可用");
      if (list) list.innerHTML = `<p class="footer-note">持有人数据源暂不可用，请稍后重试。</p>`;
      toastError(error, "持有人数据加载失败，请稍后重试");
    }
  };
  const deviceId = () => { try { let id = localStorage.getItem("bitbt_pump_device"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("bitbt_pump_device", id); } return id; } catch { return "pump-browser-device"; } };
  const renderMyPanels = () => {
    const launches = state.myLaunches;
    const visibleLaunches = launches.filter((launch) => state.myLaunchFilter === "all" || (state.myLaunchFilter === "migrated" ? tokenIsMigrated(launch) : !tokenIsMigrated(launch)));
    const activityType = (tx) => tx.activity_type || (tx.tx_type === "pump_buy" ? "buy" : tx.tx_type === "pump_sell" ? "sell" : /launch|create|deploy/i.test(String(tx.tx_type || "")) ? "create" : "");
    const selectedActivityType = state.historyFilter === "pump_buy" ? "buy" : state.historyFilter === "pump_sell" ? "sell" : state.historyFilter === "launch" ? "create" : state.historyFilter;
    const visibleHistory = state.history.filter((tx) => selectedActivityType === "all" || activityType(tx) === selectedActivityType);
    const launchPanel = $('[data-panel="my-launches"]');
    if (launchPanel) {
      launchPanel.querySelectorAll(".launch-card, .summary-hero").forEach((node) => node.remove());
      launchPanel.querySelector(".filter-row")?.insertAdjacentHTML("beforebegin", `<div class="summary-hero"><span class="eyebrow">CREATOR OVERVIEW</span><h1>${state.account ? "真实链上数据" : "—"}</h1><p>${state.account ? "当前钱包的真实发射记录" : "连接并验证钱包后显示真实数据"}</p><div class="summary-grid"><div><span>已发射</span><strong>${launches.length}</strong></div><div><span>已迁移</span><strong>${launches.filter((item) => item.status === "migrated").length}</strong></div><div><span>交易记录</span><strong>${state.history.length}</strong></div></div></div>`);
      const cards = visibleLaunches.map((launch) => `<button class="launch-card" data-live-token="${escapeHtml(launch.contract_address || "")}"><div class="launch-card-head"><img src="${escapeHtml(assetImage(launch))}" alt="${escapeHtml(launch.token_name || launch.symbol || "Token")}"><div><strong>${escapeHtml(launch.token_name || launch.symbol || "—")} · ${escapeHtml(launch.symbol || "—")}</strong><small>${escapeHtml(status(launch))} · ${escapeHtml(age(launch.submitted_at))}</small></div><span class="tag lime">${escapeHtml(String(launch.status || "").toUpperCase())}</span></div><div class="card-metrics"><div><span>计价</span><strong>${escapeHtml(launch.quote_token || "BNB")}</strong></div><div><span>地址</span><strong>${escapeHtml(short(launch.contract_address))}</strong></div><div><span>网络</span><strong>${escapeHtml(launch.chain_id || "bsc")}</strong></div></div></button>`).join("");
      launchPanel.querySelector(".filter-row")?.insertAdjacentHTML("afterend", cards || `<p class="footer-note">${state.account ? "当前筛选暂无真实发射记录。" : "连接并验证钱包后显示真实发射记录。"}</p>`);
      bindLiveTokenSelection();
    }
    const activity = $('[data-panel="activity"]');
    if (activity) {
      activity.querySelectorAll(".activity-card").forEach((node) => node.remove());
      const cards = visibleHistory.map((tx) => { const kind = activityType(tx); const label = kind === "buy" ? "买入" : kind === "sell" ? "卖出" : kind === "create" ? "创建代币" : "交易"; const amount = kind === "create" ? `${tx.symbol || tx.token_name || "—"} · ${short(tx.token_address)}` : `${decimal(tx.quote_amount)} ${tx.quote_token || "BNB"} · ${decimal(tx.token_amount)} ${tx.symbol || tx.token_name || "TOKEN"}`; const txHash = validTxHash(tx.tx_hash); const content = `<span class="activity-icon"><i class="ico" style="--icon:url('./assets/icons/lucide/${kind === "sell" ? "arrow-up-right" : kind === "buy" ? "arrow-down-left" : "waypoints"}.svg')"></i></span><div><strong>${escapeHtml(label)} · ${escapeHtml(tx.token_name || tx.symbol || "—")}</strong><small>${escapeHtml(amount)} · ${escapeHtml(tx.status || "—")}</small></div><div class="right"><strong>${escapeHtml(txHash ? short(txHash) : "—")}</strong><small>${escapeHtml(age(tx.created_at))}</small></div>`; return txHash ? `<a class="activity-card" href="https://bscscan.com/tx/${txHash}" target="_blank" rel="noopener noreferrer">${content}</a>` : `<div class="activity-card">${content}</div>`; }).join("");
      activity.querySelector(".filter-row")?.insertAdjacentHTML("afterend", cards || `<p class="footer-note">暂无真实交易记录。</p>`);
    }
    const profilePanel = $('[data-panel="profile"]');
    profilePanel?.querySelector("[data-profile-summary]")?.remove();
    profilePanel?.querySelector("[data-reward-summary]")?.remove();
    if (profilePanel) {
      profilePanel.querySelector(".section-title")?.insertAdjacentHTML("beforebegin", `<div class="profile-card" data-profile-summary><div class="profile-head"><span class="profile-avatar">${state.account ? state.account.slice(2, 4).toUpperCase() : "—"}</span><div><h2>${state.account ? short(state.account) : "请连接钱包"}</h2><p>${state.account ? "BNB CHAIN · 实时数据" : "连接钱包后显示账户数据"}</p></div><span class="tag lime">PUMP</span></div><div class="card-metrics"><div><span>已发射</span><strong>${launches.length}</strong></div><div><span>交易次数</span><strong>${state.history.length}</strong></div><div><span>收藏</span><strong>${state.favorites.length}</strong></div></div></div>`);
      const rewards = state.creatorRewards.map((reward) => `<div class="review-row"><span>${escapeHtml(reward.quote_symbol || "BNB")} · ${escapeHtml(reward.status === "accrued" ? "可签署凭证" : reward.status === "pending_contract_upgrade" ? "待曲线合约升级" : reward.status)}</span><strong>${escapeHtml(baseUnits(reward.amount_wei))} ${escapeHtml(reward.quote_symbol || "BNB")}</strong></div>`).join("");
      profilePanel.querySelector(".section-title")?.insertAdjacentHTML("afterend", `<div class="profile-card" data-reward-summary><div class="section-title"><h3>创作者奖励账本</h3><span class="tag lime">API</span></div>${rewards || `<p class="footer-note">${state.account ? "暂无已记录的创作者奖励。" : "连接钱包后显示奖励账本。"}</p>`}<p class="footer-note">这里只展示后端真实累计；未执行链上兑付的金额不会标记为已到账。</p></div>`);
    }
    const watchlist = $('[data-panel="watchlist"] .token-grid');
    if (watchlist) { const favoriteAddresses = new Set(state.favorites.map((item) => String(item.contract_address || "").toLowerCase())); const cards = state.tokens.filter((token) => favoriteAddresses.has(tokenAddress(token).toLowerCase())).map(tokenCard).join(""); watchlist.innerHTML = cards || `<p class="footer-note">暂无自选代币。请在代币详情中点击收藏。</p>`; bindLiveTokenSelection(); }
  };
  const loadFavorites = async () => {
    try { state.favorites = await api(`v1/market/favorites?device_id=${encodeURIComponent(deviceId())}`); } catch { state.favorites = []; }
    renderMyPanels();
  };
  const loadUserPanels = async () => {
    if (!state.account) { await loadFavorites(); return; }
    const [activity, favorites] = await Promise.allSettled([
      api(`v1/pump/wallet-activity?address=${encodeURIComponent(state.account)}&limit=500`),
      api(`v1/market/favorites?device_id=${encodeURIComponent(deviceId())}`),
    ]);
    if (activity.status === "fulfilled") {
      state.myLaunches = Array.isArray(activity.value?.launches) ? activity.value.launches : [];
      state.history = Array.isArray(activity.value?.activity) ? activity.value.activity : [];
      state.creatorRewards = Array.isArray(activity.value?.creator_rewards) ? activity.value.creator_rewards : [];
    } else {
      const [launches, history] = await Promise.allSettled([
        api(`v1/token/my-tokens?address=${encodeURIComponent(state.account)}`),
        api(`v1/wallet/tx/history?address=${encodeURIComponent(state.account)}&chain_id=bsc&limit=100`),
      ]);
      state.myLaunches = launches.status === "fulfilled" ? launches.value : [];
      state.history = history.status === "fulfilled" ? history.value : [];
      state.creatorRewards = [];
    }
    state.favorites = favorites.status === "fulfilled" ? favorites.value : [];
    renderMyPanels();
  };
  const toggleFavorite = async () => {
    if (!state.selected) throw new Error("请先选择代币");
    const token = state.selected;
    const address = tokenAddress(token).toLowerCase();
    const favorite = state.favorites.some((item) => String(item.contract_address || "").toLowerCase() === address);
    await api("v1/market/favorites", { method: favorite ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: deviceId(), symbol: token.symbol || token.token_name, chain_id: "bsc", contract_address: tokenAddress(token) }) });
    state.favorites = favorite ? state.favorites.filter((item) => String(item.contract_address || "").toLowerCase() !== address) : [...state.favorites, { symbol: token.symbol, chain_id: "bsc", contract_address: tokenAddress(token) }];
    renderMyPanels();
    renderSelected();
    toast(favorite ? "已取消收藏" : "已加入自选");
  };
  const clearPrototype = () => {
    charts.forEach(({ chart }) => chart.remove?.());
    charts.clear();
    $$(".token-grid").forEach((node) => { node.innerHTML = `<p class="footer-note">正在读取真实 Pump 项目…</p>`; });
    const livePanel = $('[data-panel="live"]'); if (livePanel) [...livePanel.querySelectorAll(".live-row")].forEach((node) => node.remove());
    const rankPanel = $('[data-panel="rank"]'); if (rankPanel) [...rankPanel.querySelectorAll(".rank-row")].forEach((node) => node.remove());
    ["[data-panel='live'] .live-row", "[data-panel='rank'] .rank-row", "[data-panel='activity'] .activity-card", "[data-panel='announcements'] .announcement-card", "[data-panel='announcements'] .announcement-detail", "[data-panel='detail'] [data-detail-panel='trades'] .live-row", "[data-panel='detail'] [data-detail-panel='holders'] .data-table", "[data-panel='success'] .launch-card", "[data-panel='success'] .review-block", "[data-panel='create-review'] .review-block", "[data-panel='my-launches'] .summary-hero", "[data-panel='my-launches'] .launch-card", "[data-panel='profile'] [data-profile-summary]", "[data-panel='watchlist'] .token-card"].forEach((selector) => $$(selector).forEach((node) => node.remove()));
    ["[data-active-symbol]", "[data-active-address]", "[data-active-price]", "[data-active-market]", "[data-active-rank]", "[data-active-change]", "[data-active-curve]", "[data-holding-amount]", "[data-holding-short]", "[data-holding-value]", "[data-holding-cost]", "[data-holding-pnl]", "[data-holding-return]", "[data-holding-share]", "[data-quote-output]", "[data-quote-min]", "[data-order-balance]"].forEach((selector) => text(selector, "—"));
    $$("[data-active-curve-bar], [data-holding-bar]").forEach((node) => { node.style.width = "0%"; });
    $$("[data-panel='detail'] .curve-panel .between span, [data-panel='detail'] .curve-panel .between strong, [data-panel='detail'] [data-detail-panel='trades'] .section-title a, [data-panel='trade'] .holding-metrics strong, [data-panel='trade'] .holding-share strong, [data-panel='trade'] .quote strong, [data-panel='trade'] .curve-side-card strong").forEach((node) => { node.textContent = "—"; });
    $$("[data-panel='trade'] #trade-amount").forEach((node) => { node.value = ""; });
    $$("[data-panel^='create-'] input").forEach((node) => { node.value = ""; });
    $$("#launch-kline, #trade-kline").forEach((node) => { node.replaceChildren(); });
  };
  const parseUnits = (value, decimals = 18) => { const clean = String(value || "").trim(); if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("请输入有效数量"); const [whole, fraction = ""] = clean.split("."); if (fraction.length > decimals) throw new Error("数量精度超出限制"); const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0"); if (result <= 0n) throw new Error("数量必须大于零"); return result; };
  const amountFromApi = (value) => { const clean = String(value || ""); return /^\d+$/.test(clean) ? BigInt(clean) : parseUnits(clean); };
  const word = (value) => value.toString(16).padStart(64, "0");
  const addressWord = (value) => String(value).replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const formatUnits = (value, decimals = 18, digits = 6) => { const scale = 10n ** BigInt(decimals); const whole = value / scale; const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, ""); return fraction ? `${whole}.${fraction}` : whole.toString(); };
  const quoteAddress = (symbol) => ({ BNB: null, USDT: "0x55d398326f99059fF775485246999027B3197955", USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", GW: "0x68985a6E02f80DE4d71732ca66E4e5d4e303965F" })[String(symbol || "").toUpperCase()];
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const USER_SLIPPAGE_BPS = 200;
  const PRIORITY_FEE_WEI = 50_000_000n;
  const getFeePolicy = async () => {
    const fallbackBaseFee = 2_000_000_000n;
    try {
      const latest = await selectedProvider().request({ method: "eth_getBlockByNumber", params: ["latest", false] });
      const baseFee = latest?.baseFeePerGas ? BigInt(latest.baseFeePerGas) : 0n;
      return { maxPriorityFeePerGas: PRIORITY_FEE_WEI, maxFeePerGas: (baseFee > 0n ? baseFee * 2n : fallbackBaseFee) + PRIORITY_FEE_WEI };
    } catch {
      return { maxPriorityFeePerGas: PRIORITY_FEE_WEI, maxFeePerGas: fallbackBaseFee + PRIORITY_FEE_WEI };
    }
  };
  const normalizeChainId = (value) => { const normalized = String(value ?? "").trim().toLowerCase(); if (normalized === "0x38" || normalized === "56" || normalized === "bsc" || normalized === "bnb") return "0x38"; return ""; };
  const ensureBscChain = async (provider) => {
    let chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
    if (chainId !== "0x38") {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
      chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
    }
    if (chainId !== "0x38") throw new Error("钱包未切换到 BSC，请在钱包中选择 BNB Smart Chain");
    state.chainId = chainId;
  };
  const rpc = (to, data) => selectedProvider().request({ method: "eth_call", params: [{ to, data }, "latest"] }).then((value) => BigInt(value));
  const walletNativeBalance = () => selectedProvider().request({ method: "eth_getBalance", params: [state.account, "latest"] }).then((value) => BigInt(value));
  const walletTokenBalance = (token) => rpc(token, `0x70a08231${addressWord(state.account)}`);
  const allowance = (token, owner, spender) => rpc(token, `0xdd62ed3e${addressWord(owner)}${addressWord(spender)}`);
  const send = async (tx) => { const fee = tx.fee || await getFeePolicy(); return selectedProvider().request({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to, ...(tx.data ? { data: tx.data } : {}), ...(tx.value ? { value: `0x${tx.value.toString(16)}` } : {}), gas: `0x${tx.gas.toString(16)}`, maxPriorityFeePerGas: `0x${fee.maxPriorityFeePerGas.toString(16)}`, maxFeePerGas: `0x${fee.maxFeePerGas.toString(16)}` }] }); };
  const receiptHasStatus = (receipt) => receipt != null && receipt.status !== undefined && receipt.status !== null;
  const receiptSucceeded = (receipt) => receiptHasStatus(receipt) && [true, 1, "1", "0x1", "0x01"].includes(receipt.status);
  const waitReceipt = async (hash) => { for (let i = 0; i < 60; i += 1) { try { const receipt = await selectedProvider().request({ method: "eth_getTransactionReceipt", params: [hash] }); if (receiptHasStatus(receipt)) return receipt; } catch {} await new Promise((resolve) => window.setTimeout(resolve, 2000)); } const error = new Error("交易已广播，但链上确认较慢，请稍后在交易记录或 BscScan 查看"); error.code = "TX_CONFIRMATION_PENDING"; throw error; };
  const report = (body) => api("v1/wallet/tx/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
  const invalidateQuote = () => { state.quote = null; state.quoteKey = ""; text("[data-quote-output], [data-quote-min], [data-quote-route]", "—"); text("[data-quote-fee], [data-protocol-fee]", "等待报价"); text("[data-price-impact]", "API 未提供"); };
  const clearLaunchReview = () => { text("[data-preview-name], [data-preview-ticker], [data-launch-review-chain], [data-launch-review-name], [data-launch-review-mode], [data-launch-review-quote], [data-launch-review-quote-address], [data-launch-review-curve], [data-launch-review-threshold], [data-launch-review-fee], [data-launch-review-recipient], [data-launch-review-factory], [data-launch-review-id], [data-launch-review-salt], [data-launch-review-predicted], [data-launch-review-description]", "—"); text("[data-preview-symbol]", "—"); const publishButton = $("[data-launch-publish]"); if (publishButton) { publishButton.disabled = true; publishButton.setAttribute("disabled", ""); publishButton.textContent = state.launchTerminal ? "发币流程已结束" : "正在自动准备发币参数…"; } };
  const invalidateLaunchSnapshot = (force = false) => { if (state.launchBusy && !force) return; state.launchSnapshot = null; clearLaunchReview(); text("[data-launch-review-tax]", "—"); };
  const setLaunchTerminal = (message) => { state.launchSnapshot = null; state.launchTerminal = true; clearLaunchReview(); const publishButton = $("[data-launch-publish]"); if (publishButton) publishButton.textContent = message; };
  const resetLaunchFlow = () => { if (state.launchConfirmation) { toast("已有链上成功的发币结果等待保存，请先完成确认"); return; } state.launchSnapshot = null; state.launchLogoUrl = ""; document.documentElement.dataset.launchLogoUrl = ""; state.launchTerminal = false; clearLaunchReview(); const art = $("#create-art"); if (art) { art.textContent = "MB"; art.style.backgroundImage = ""; } const fileName = $("[data-launch-file-name]"); if (fileName) fileName.textContent = "尚未选择文件"; const input = $("#token-logo-file"); if (input) input.value = ""; window.dispatchEvent(new CustomEvent("bitbt:launch-reset")); };
  const renderLaunchReview = (fee, prepared, description) => { text("[data-preview-name], [data-launch-review-name]", prepared.launch.token_name); text("[data-preview-ticker], [data-launch-review-quote]", prepared.launch.symbol); text("[data-preview-symbol]", prepared.launch.symbol.slice(0, 2).toUpperCase()); text("[data-launch-review-chain]", `BSC Chain · ${prepared.launch.quote_token}`); text("[data-launch-review-description]", description); text("[data-launch-review-mode]", `${state.launchMode === "community" ? "社区收益 · " : ""}${state.curveMode === "custom" ? "自定义线性曲线" : "标准线性曲线"}`); text("[data-launch-review-quote-address]", prepared.quote_token_address); text("[data-launch-review-curve]", prepared.curve_address); text("[data-launch-review-threshold]", `${formatUnits(BigInt(prepared.migration_threshold_wei))} ${prepared.launch.quote_token}`); text("[data-launch-review-fee]", `${formatUnits(BigInt(fee.fee_wei))} BNB`); text("[data-launch-review-recipient]", prepared.fee_recipient); text("[data-launch-review-factory]", prepared.factory_address); text("[data-launch-review-id]", prepared.launch.id); text("[data-launch-review-salt]", prepared.salt); text("[data-launch-review-predicted]", prepared.predicted_token_address); const publishButton = $("[data-launch-publish]"); if (publishButton) { publishButton.disabled = false; publishButton.removeAttribute("disabled"); publishButton.textContent = "确认以上快照并发布代币"; } };
  const renderLaunchTaxReview = (tax) => text("[data-launch-review-tax]", tax ? `买 ${tax.buy_tax_rate}% · 卖 ${tax.sell_tax_rate}% · 资金/销毁/分红/流动性 ${tax.funds_recipient_pct}/${tax.burn_pct}/${tax.holders_pct}/${tax.liquidity_pct}%` : "标准代币 · 无转账税");
  const resetProviderState = (message = "钱包状态已变化，请重新连接") => { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_ADDRESS_KEY); state.account = ""; state.chainId = ""; state.sessionExpiresAt = 0; state.balances = { quote: null, token: null, gas: null }; setLaunchAvailability(false); invalidateQuote(); invalidateLaunchSnapshot(); $$('[data-wallet-label], .connect-global, .connect').forEach((node) => { node.textContent = "连接钱包"; }); if (message) toast(message); };
  const renderWalletState = () => { $$('[data-wallet-label], .connect-global, .connect').forEach((node) => { node.textContent = state.account ? short(state.account) : "连接钱包"; }); const taxRecipient = $("#tax-recipient-wallet"); if (state.taxEnabled && state.account && taxRecipient && !taxRecipient.value) taxRecipient.value = state.account; if (state.detail) applySide(state.side === "sell"); };
  const restoreSession = async () => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return false;
    try {
      const session = await api("v1/auth/siwe/session");
      const sessionAddress = String(session.address || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(sessionAddress)) throw new Error("SIWE session address is invalid");
      const provider = selectedProvider();
      const accounts = provider ? await provider.request({ method: "eth_accounts" }) : [];
      const chainId = provider ? await provider.request({ method: "eth_chainId" }) : "";
      const providerAddress = String(accounts?.[0] || "").toLowerCase();
      const normalizedChain = normalizeChainId(chainId);
      if (providerAddress && providerAddress !== sessionAddress) { resetProviderState("钱包账户已变化，请重新连接"); return false; }
      if (providerAddress && normalizedChain !== "0x38") { resetProviderState("网络已变化，请重新连接 BSC 钱包"); return false; }
      state.account = providerAddress || sessionAddress;
      state.chainId = normalizedChain || "0x38";
      state.sessionExpiresAt = Date.now() + Number(session.expires_in || 0) * 1000;
      sessionStorage.setItem(SESSION_ADDRESS_KEY, sessionAddress);
      setLaunchAvailability(Boolean(providerAddress && normalizedChain === "0x38"));
      renderWalletState();
      await loadUserPanels().catch(() => undefined);
      if (state.selected && providerAddress) await refreshBalances().catch(() => undefined);
      return true;
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED" || error?.message?.includes("SIWE session")) resetProviderState("登录已过期，请重新连接钱包");
      return false;
    }
  };
  const assertProviderState = async () => { const provider = selectedProvider(); if (!provider || !state.account) throw new Error("请先连接并验证钱包"); const [accounts, chainId] = await Promise.all([provider.request({ method: "eth_accounts" }), provider.request({ method: "eth_chainId" })]); const account = String(accounts?.[0] || "").toLowerCase(); const normalizedChain = normalizeChainId(chainId); if (account !== state.account || normalizedChain !== "0x38") { resetProviderState(); throw new Error("钱包账户或网络已变化，请重新连接 BSC 钱包"); } state.chainId = normalizedChain; return { account, chainId: state.chainId }; };
  const revalidateSession = async () => {
    if (!state.account || !sessionStorage.getItem(SESSION_KEY)) return;
    if (state.sessionExpiresAt && Date.now() >= state.sessionExpiresAt) { resetProviderState("登录已过期，请重新连接钱包"); return; }
    try {
      const session = await api("v1/auth/siwe/session");
      const address = String(session.address || "").toLowerCase();
      if (address !== state.account) { resetProviderState("钱包账户已变化，请重新连接"); return; }
      state.sessionExpiresAt = Date.now() + Number(session.expires_in || 0) * 1000;
      await assertProviderState();
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED") return;
      if (error?.message?.includes("钱包账户或网络已变化")) return;
    }
  };
  const bindSelectedProviderEvents = (provider) => { if (!provider?.on || boundProviders.has(provider)) return; boundProviders.add(provider); provider.on("accountsChanged", (accounts) => { if (provider !== state.provider) return; const next = String(accounts?.[0] || "").toLowerCase(); if (!next) { window.setTimeout(() => { if (provider === state.provider) void restoreSession(); }, 350); return; } if (state.account && next === state.account) return; resetProviderState(); }); provider.on("chainChanged", (value) => { if (provider !== state.provider) return; const chainId = normalizeChainId(value); if (chainId === "0x38") { state.chainId = chainId; if (state.account && sessionStorage.getItem(SESSION_KEY)) { setLaunchAvailability(true); renderWalletState(); } return; } resetProviderState("网络已变化，请重新连接 BSC"); }); };
  const bindProviderEvents = () => { const provider = selectedProvider(); if (provider) bindSelectedProviderEvents(provider); window.addEventListener("focus", () => { void revalidateSession(); }); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void revalidateSession(); }); };
  const connectWalletOnce = async () => {
    const provider = await waitForProvider(); state.provider = provider; bindSelectedProviderEvents(provider);
    const accounts = await provider.request({ method: "eth_requestAccounts" }); const address = accounts?.[0]; if (!address) throw new Error("钱包未返回账户");
    await ensureBscChain(provider);
    const noncePayload = await api("v1/auth/siwe/nonce"); const domain = String(noncePayload.domain || "").toLowerCase(); if (domain !== "bitbt.fun") throw new Error("SIWE domain 不受信任");
    const message = `bitbt.fun wants you to sign in with your Ethereum account:\n${address}\n\nSign in to BitBT PUMP.\n\nURI: https://bitbt.fun\nVersion: 1\nChain ID: 56\nNonce: ${noncePayload.nonce}\nIssued At: ${new Date().toISOString()}`;
    const signature = await provider.request({ method: "personal_sign", params: [message, address] }); const verified = await api("v1/auth/siwe/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
    sessionStorage.setItem(SESSION_KEY, verified.token); state.account = String(verified.address || address).toLowerCase(); sessionStorage.setItem(SESSION_ADDRESS_KEY, state.account); state.chainId = "0x38"; state.sessionExpiresAt = Date.now() + Number(verified.expires_in || 3600) * 1000; setLaunchAvailability(true); invalidateQuote(); renderWalletState(); await assertProviderState(); await refreshBalances(); await loadUserPanels().catch(() => undefined); toast("钱包已连接"); return state.account;
  };
  const connectWallet = async () => {
    if (!walletConnectionPromise) walletConnectionPromise = connectWalletOnce();
    try { return await walletConnectionPromise; }
    finally { walletConnectionPromise = null; }
  };
  const refreshBalances = async () => {
    if (!state.account || !state.detail || !selectedProvider()) return;
    const quote = state.detail.quote_token_address || quoteAddress(state.detail.quote_token);
    const [gas, token, quoteBalance] = await Promise.all([walletNativeBalance(), walletTokenBalance(tokenAddress(state.selected)), quote ? walletTokenBalance(quote) : walletNativeBalance()]);
    state.balances = { gas, token, quote: quoteBalance };
    applySide(state.side === "sell");
    text("[data-holding-amount]", formatUnits(token));
    text("[data-holding-short]", formatUnits(token, 18, 4));
    text("[data-holding-value]", "—");
  };
  const loadDetail = async (token, { refreshBalance = true } = {}) => {
    if (!tokenAddress(token)) return;
    state.selected = token; const address = tokenAddress(token).toLowerCase(); const [detail, trades] = await Promise.all([state.details[address] ? Promise.resolve(state.details[address]) : api(`v1/pump/detail?address=${encodeURIComponent(tokenAddress(token))}`), api(`v1/pump/trades?token_address=${encodeURIComponent(tokenAddress(token))}`)]); state.detail = detail; state.details[address] = detail; state.trades = trades; if (refreshBalance) state.balances = { quote: null, token: null, gas: null }; renderSelected(); renderTradeConfig(); renderLiveRows(); drawCharts(); if (state.account && refreshBalance) await refreshBalances();
  };
  const activateDetail = () => { const detailPanel = $('[data-panel="detail"]'); if (!detailPanel) return; $$("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel === detailPanel)); detailPanel.classList.add("has-bottom-nav"); detailPanel.scrollTop = 0; };
  const openToken = async (token, { historyMode = "push", fallbackDetail = null } = {}) => {
    try { await loadDetail(token); }
    catch (error) {
      if (!fallbackDetail) throw error;
      const address = tokenAddress(token).toLowerCase(); state.selected = token; state.detail = fallbackDetail; state.details[address] = fallbackDetail; state.trades = []; renderSelected(); renderTradeConfig(); renderLiveRows(); drawCharts();
    }
    activateDetail();
    if (historyMode) setTokenPath(tokenAddress(token), historyMode);
  };
  const openTokenAddress = async (address, options = {}) => {
    const normalized = String(address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error("代币地址无效");
    let token = state.tokens.find((item) => tokenAddress(item).toLowerCase() === normalized);
    if (!token && state.details[normalized]) token = { ...state.details[normalized], contract_address: normalized };
    if (!token) { const detail = await api(`v1/pump/detail?address=${encodeURIComponent(normalized)}`); state.details[normalized] = detail; token = { ...detail, contract_address: normalized }; state.tokens.unshift(token); renderTokens(); }
    await openToken(token, options);
  };
  const drawCharts = () => {
    if (!window.LightweightCharts) return;
    const setChartEmpty = (message, empty) => $$('[data-chart-empty]').forEach((node) => { node.textContent = message; node.hidden = !empty; });
    if (!state.trades.length) { ["#launch-kline", "#trade-kline"].forEach((selector) => { const entry = charts.get(selector); entry?.chart.remove?.(); charts.delete(selector); $(selector)?.replaceChildren(); }); setChartEmpty("暂无真实成交，完成首笔交易后生成 K 线。", true); return; }
    const chartPrice = (quoteRaw, tokenRaw) => { const quote = Number(quoteRaw); const token = Number(tokenRaw); const value = quote > 0 && token > 0 ? quote / token : 0; return Number.isFinite(value) ? value : 0; }; const interval = state.chartInterval; const prices = state.trades.map((trade) => { const quote = trade.quote_amount || trade.bnb_amount; const token = trade.token_amount; return { time: Math.floor((trade.timestamp > 1e12 ? trade.timestamp / 1000 : trade.timestamp) / interval) * interval, price: chartPrice(quote, token) }; }).filter((point) => point.price > 0).sort((a, b) => a.time - b.time);
    const candles = []; prices.forEach((point) => { const last = candles[candles.length - 1]; if (last && last.time === point.time) { last.high = Math.max(last.high, point.price); last.low = Math.min(last.low, point.price); last.close = point.price; } else candles.push({ time: point.time, open: point.price, high: point.price, low: point.price, close: point.price }); });
    if (!candles.length) { setChartEmpty("成交数据暂时无法生成有效 K 线。", true); return; }
    setChartEmpty("", false);
    ["#launch-kline", "#trade-kline"].forEach((selector) => { const host = $(selector); if (!host || !candles.length) return; let entry = charts.get(selector); if (!entry || entry.host !== host) { entry?.chart.remove?.(); host.replaceChildren(); const chart = window.LightweightCharts.createChart(host, { width: host.clientWidth || 640, height: 260, layout: { background: { type: "solid", color: "#0a0b0c" }, textColor: "#777c78" }, grid: { vertLines: { color: "#1d2021" }, horzLines: { color: "#1d2021" } }, rightPriceScale: { borderColor: "#303334" }, timeScale: { borderColor: "#303334", timeVisible: true } }); const series = chart.addCandlestickSeries({ upColor: "#32cf7c", downColor: "#ff5c73", borderUpColor: "#32cf7c", borderDownColor: "#ff5c73", wickUpColor: "#32cf7c", wickDownColor: "#ff5c73" }); entry = { host, chart, series }; charts.set(selector, entry); } entry.series.setData(candles); entry.chart.applyOptions?.({ width: host.clientWidth || 640 }); entry.chart.timeScale().fitContent(); });
  };
  const renderSelected = () => {
    const token = state.selected; const detail = state.detail; if (!token || !detail) return; const progress = Math.max(0, Math.min(100, number(detail.progress_percent))); const address = tokenAddress(token);
    const quote = String(detail.quote_token || token.quote_token || "BNB").toUpperCase(); const raised = detail.total_raised_quote ?? detail.total_raised_bnb; const sold = detail.tokens_sold; const dayStart = Date.now() - 86400000; const recentTrades = state.trades.filter((trade) => Number(trade.timestamp) * (Number(trade.timestamp) > 1e12 ? 1 : 1000) >= dayStart); const volume = Number(recentTrades.reduce((sum, trade) => sum + number(trade.quote_amount || trade.bnb_amount), 0).toFixed(12)); const selectedStatus = status(detail) || status(token) || "deployed";
    const buyTax = number(detail.buy_tax_percent ?? token.buy_tax_percent); const sellTax = number(detail.sell_tax_percent ?? token.sell_tax_percent); const taxLabel = detail.tax_enabled || token.tax_enabled ? `买 ${buyTax}% / 卖 ${sellTax}%` : "0% / 0%";
    text("[data-active-symbol]", detail.symbol || token.symbol); text("[data-active-quote]", quote); text("[data-active-status]", selectedStatus.toUpperCase()); text("[data-active-address]", `${short(address)} · BNB CHAIN`); text("[data-active-price-label]", `PRICE / ${quote}`); text("[data-active-price]", `${decimal(detail.current_price_quote ?? detail.current_price_bnb)} ${quote}`); text("[data-active-market]", `${decimal(raised)} ${quote}`); text("[data-active-rank]", selectedStatus); text("[data-active-curve]", `${progress.toFixed(2)}%`); text("[data-active-volume]", recentTrades.length ? `${decimal(volume)} ${quote}` : "—"); text("[data-active-raised]", `${decimal(raised)} ${quote}`); text("[data-active-trade-count]", state.trades.length); text("[data-trade-count-label]", `共 ${state.trades.length} 笔`); text("[data-active-sold]", sold == null ? "—" : `${decimal(sold)} ${detail.symbol || token.symbol}`); text("[data-active-reserve]", `储备 ${decimal(raised)} ${quote}`); text("[data-active-remaining]", detail.migrated ? "已迁移至 DEX" : "迁移剩余由链上进度决定"); text("[data-chain-contract]", address); text("[data-chain-curve]", detail.curve_address || "—"); text("[data-chain-created]", formatDate(detail.submitted_at || token.submitted_at)); text("[data-chain-creator]", detail.creator || token.creator_address || "—"); text("[data-chain-status]", selectedStatus); text("[data-token-tax-detail], [data-token-tax]", taxLabel); text("[data-holding-amount]", state.balances.token == null ? "—" : formatUnits(state.balances.token)); text("[data-holding-short]", state.balances.token == null ? "—" : formatUnits(state.balances.token, 18, 4)); text("[data-holding-value]", "—"); text("[data-active-change]", "—"); $$('[data-active-image]').forEach((node) => { node.src = assetImage({ ...token, ...detail }); }); $$('[data-active-curve-bar]').forEach((node) => { node.style.width = `${progress}%`; }); $$('[data-copy-token-address]').forEach((node) => { node.dataset.tokenAddress = address; node.title = `复制完整地址 ${address}`; }); const favorite = state.favorites.some((item) => String(item.contract_address || "").toLowerCase() === address.toLowerCase()); $$('[data-favorite-token]').forEach((node) => { node.classList.toggle("active", favorite); node.title = favorite ? "取消自选" : "加入自选"; }); const holderPayload = state.holders[address.toLowerCase()]; if (holderPayload) renderHolders(address, holderPayload); else { text("[data-holder-count]", "点击持有人页加载"); const holderList = $("[data-holder-list]"); if (holderList) holderList.innerHTML = `<p class="footer-note">打开本页后按需读取真实持有人数据。</p>`; }
    const liveRows = state.trades.slice(0, 20).map((trade) => `<div class="live-row"><span class="trade-type ${String(trade.trade_type).toLowerCase() === "buy" ? "buy" : "sell"}">${escapeHtml(String(trade.trade_type || "TRADE").toUpperCase())}</span><div><p><b>${escapeHtml(short(trade.trader))}</b></p><small>${escapeHtml(decimal(trade.quote_amount || trade.bnb_amount))} ${escapeHtml(quote)} · ${escapeHtml(decimal(trade.token_amount))} ${escapeHtml(detail.symbol)}</small></div><small>${escapeHtml(age(new Date((trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000)).toISOString()))}</small></div>`).join(""); const tradePanel = $('[data-panel="detail"] [data-detail-panel="trades"]'); if (tradePanel) { [...tradePanel.querySelectorAll(".live-row, .footer-note")].forEach((node) => node.remove()); tradePanel.querySelector(".section-title")?.insertAdjacentHTML("afterend", liveRows || `<p class="footer-note">暂无真实成交记录。</p>`); } applySide(state.side === "sell");
  };
  const quoteBinding = (response, address, amount) => { const output = state.side === "buy" ? response?.tokens_out : (response?.quote_out_raw || response?.quote_out || response?.bnb_out); const quoteAddressValue = String(response?.quote_token_address || "").toLowerCase(); const expiry = Number(response?.expires_at) * (Number(response?.expires_at) < 1e12 ? 1000 : 1); const detailQuote = String(state.detail?.quote_token_address || ZERO_ADDRESS).toLowerCase(); const quoteToken = String(response?.quote_token || "").toUpperCase(); const quoteKind = quoteToken === "BNB" ? "native" : "erc20"; const outputRaw = String(output || ""); const minOutRaw = String(response?.min_out || ""); const slippageBps = Number(response?.slippage_bps); let minOutValid = false; if (/^\d+$/.test(outputRaw) && /^\d+$/.test(minOutRaw) && Number.isInteger(slippageBps) && slippageBps === USER_SLIPPAGE_BPS) { const outputBig = BigInt(outputRaw); const minOut = BigInt(minOutRaw); minOutValid = minOut > 0n && minOut === outputBig * BigInt(10000 - slippageBps) / 10000n; } const chainId = normalizeChainId(response?.chain_id); const addressKindValid = quoteKind === "native" ? quoteAddressValue === ZERO_ADDRESS && detailQuote === ZERO_ADDRESS : /^0x[0-9a-fA-F]{40}$/.test(quoteAddressValue) && quoteAddressValue !== ZERO_ADDRESS && quoteAddressValue === detailQuote; if (!response || !/^0x[0-9a-fA-F]{40}$/.test(response.token_address || "") || response.token_address.toLowerCase() !== address.toLowerCase() || !/^0x[0-9a-fA-F]{40}$/.test(response.curve_address || "") || response.curve_address.toLowerCase() !== String(state.detail.curve_address || "").toLowerCase() || !addressKindValid || chainId !== "0x38" || !response.quote_id || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 35000 || !response.quote_token || quoteToken !== String(state.detail.quote_token).toUpperCase() || !/^\d+$/.test(outputRaw) || !minOutValid) throw new Error("报价缺少有效且完整的链、代币、曲线、计价币或滑点保护"); return { response, quoteId: String(response.quote_id), quoteKind, tokenAddress: address.toLowerCase(), curveAddress: response.curve_address.toLowerCase(), quoteTokenAddress: quoteAddressValue, quoteToken, account: (state.account || "").toLowerCase(), chainId, side: state.side, amount, output: outputRaw, minOut: BigInt(minOutRaw), slippageBps, expiresAt: expiry }; };
  const assertQuoteBinding = async () => { if (!state.quote || Date.now() >= state.quote.expiresAt) { invalidateQuote(); throw new Error("报价已过期，请重新获取"); } const provider = await assertProviderState(); const address = tokenAddress(state.selected).toLowerCase(); const detailCurve = String(state.detail?.curve_address || "").toLowerCase(); const detailQuote = String(state.detail?.quote_token_address || ZERO_ADDRESS).toLowerCase(); const currentQuoteKind = String(state.detail?.quote_token || "").toUpperCase() === "BNB" ? "native" : "erc20"; const expectedMin = state.quote.output ? BigInt(state.quote.output) * BigInt(10000 - USER_SLIPPAGE_BPS) / 10000n : 0n; if (!state.quote.quoteId || state.quote.tokenAddress !== address || state.quote.curveAddress !== detailCurve || state.quote.quoteTokenAddress !== detailQuote || state.quote.quoteKind !== currentQuoteKind || state.quote.account !== provider.account || state.quote.chainId !== provider.chainId || state.quote.side !== state.side || state.quote.amount !== $("#trade-amount")?.value?.trim() || state.quote.quoteToken !== String(state.detail.quote_token).toUpperCase() || state.quote.slippageBps !== USER_SLIPPAGE_BPS || state.quote.minOut <= 0n || state.quote.minOut !== expectedMin) { invalidateQuote(); throw new Error("报价与当前代币、曲线、钱包、网络或滑点政策不匹配"); } return state.quote; };
  const updateQuote = async () => { if (!state.selected || !state.detail) return; const input = $("#trade-amount"); const amount = input?.value?.trim(); if (!amount || number(amount) <= 0) { invalidateQuote(); return; } const address = tokenAddress(state.selected); const response = state.side === "buy" ? await api(`v1/pump/buy-quote?token_address=${encodeURIComponent(address)}&quote_amount=${encodeURIComponent(amount)}`) : await api(`v1/pump/sell-quote?token_address=${encodeURIComponent(address)}&token_amount=${encodeURIComponent(amount)}`); state.quote = quoteBinding(response, address, amount); state.quoteKey = `${state.side}:${address}:${amount}:${state.account}:${state.chainId}`; const outputUnit = state.side === "buy" ? state.detail.symbol : state.detail.quote_token; const feeRate = String(response.fee_rate_percent || "").trim(); const feeAmount = decimal(response.fee_quote ?? response.fee_bnb); text("[data-quote-output]", `${baseUnits(state.quote.output, 8)} ${outputUnit}`); text("[data-quote-min]", `${baseUnits(state.quote.minOut.toString(), 8)} ${outputUnit}`); text("[data-quote-route]", state.side === "buy" ? `${state.detail.quote_token} → 联合曲线` : `联合曲线 → ${state.detail.quote_token}`); text("[data-quote-fee]", feeRate ? `${feeRate} · ${feeAmount} ${state.detail.quote_token}` : `${feeAmount} ${state.detail.quote_token}`); text("[data-protocol-fee]", feeRate || "以实时报价为准"); text("[data-slippage-value], [data-slippage-label]", `${(state.quote.slippageBps / 100).toFixed(0)}% · 固定`); text("[data-price-impact]", "API 未提供"); };
  const applySideBase = (sell) => { state.side = sell ? "sell" : "buy"; $$('[data-trade-side]').forEach((node) => node.classList.toggle("active", (node.dataset.tradeSide === "sell") === sell)); const token = state.selected; const detail = state.detail; if (!token || !detail) return; const balance = sell ? state.balances.token : state.balances.quote; const unit = sell ? detail.symbol : detail.quote_token; text("[data-order-label]", sell ? "卖出数量" : "支付"); text("[data-order-unit]", unit); text("[data-order-balance]", balance == null ? "钱包余额 —" : `钱包余额 ${formatUnits(balance)} ${unit}`); if (!sell) text("[data-fixed-buy-balance]", balance == null ? `余额 — ${unit}` : `余额 ${formatUnits(balance)} ${unit}`); const submit = $("#trade-submit"); if (submit) { submit.textContent = state.account ? `${sell ? "卖出" : "买入"} ${sell ? detail.symbol : token.symbol || detail.symbol}` : `连接钱包并${sell ? "卖出" : "买入"}`; submit.classList.toggle("red", sell); } updateQuote().catch((error) => toastError(error, "报价获取失败，请稍后重试")); };
  const applySide = (sell) => {
    applySideBase(sell);
    const rate = sell ? state.detail?.sell_tax_percent : state.detail?.buy_tax_percent;
    text("[data-token-tax]", state.detail?.tax_enabled && Number.isFinite(Number(rate)) ? `${Number(rate)}%` : "0%");
  };
  const executeTradeSingleFlight = async () => {
    if (!state.account) await connectWallet();
    if (!state.selected || !state.detail) throw new Error("请先选择代币");
    const amount = $("#trade-amount")?.value?.trim();
    if (!amount) throw new Error("请输入交易数量");
    const expectedKey = `${state.side}:${tokenAddress(state.selected)}:${amount}:${state.account}:${state.chainId}`;
    if (!state.quote || state.quoteKey !== expectedKey) { await updateQuote(); if (!state.quote) throw new Error("报价尚未准备好"); }
    const quoteBindingState = await assertQuoteBinding();
    const curve = quoteBindingState.curveAddress;
    const quote = quoteBindingState.quoteTokenAddress === ZERO_ADDRESS ? null : quoteBindingState.quoteTokenAddress;
    const amountWei = parseUnits(amount);
    const output = amountFromApi(quoteBindingState.output);
    const minOut = quoteBindingState.minOut;
    const selector = state.side === "buy" ? (quote ? "0x6818735c" : "0xd96a094a") : (quote ? "0x5969261f" : "0xd79875eb");
    let hash;
    let mainStatusReported = false;
    state.busy = true;
    try {
      if ((state.side === "buy" && quote) || state.side === "sell") {
        await assertQuoteBinding();
        const asset = state.side === "buy" ? quote : tokenAddress(state.selected);
        const currentAllowance = await allowance(asset, state.account, curve);
        if (currentAllowance < amountWei) {
          let approval;
          try {
            approval = await send({ from: state.account, to: asset, data: `0x095ea7b3${addressWord(curve)}${word(amountWei)}`, gas: 100000n });
            await report({ user_address: state.account, tx_hash: approval, chain_id: "bsc", tx_type: "approve", from_token: state.side === "buy" ? state.detail.quote_token : state.detail.symbol, status: "pending", metadata: { spender: curve } });
            toast("授权交易已发送");
            const receipt = await waitReceipt(approval);
            const ok = receiptSucceeded(receipt);
            await report({ user_address: state.account, tx_hash: approval, chain_id: "bsc", tx_type: "approve", from_token: state.side === "buy" ? state.detail.quote_token : state.detail.symbol, status: ok ? "success" : "failed", metadata: { spender: curve } });
            if (!ok) throw new Error("授权失败");
          } catch (error) {
            if (approval) await report({ user_address: state.account, tx_hash: approval, chain_id: "bsc", tx_type: "approve", status: "failed", metadata: { spender: curve, error: error.message } });
            throw error;
          }
          await assertQuoteBinding();
        }
      }
      const data = state.side === "buy" ? (quote ? `${selector}${word(amountWei)}` : `${selector}${word(minOut)}`) : `${selector}${word(amountWei)}${word(minOut)}`;
      hash = await send({ from: state.account, to: curve, data, value: state.side === "buy" && !quote ? amountWei : 0n, gas: 350000n });
      await report({ user_address: state.account, tx_hash: hash, chain_id: "bsc", tx_type: state.side === "buy" ? "pump_buy" : "pump_sell", from_token: state.side === "buy" ? state.detail.quote_token : state.detail.symbol, to_token: state.side === "buy" ? state.detail.symbol : state.detail.quote_token, from_amount: amount, to_amount: formatUnits(output), status: "pending", metadata: { token_address: tokenAddress(state.selected), curve_address: curve } });
      toast("交易已广播，等待回执…");
      const receipt = await waitReceipt(hash);
      const ok = receiptSucceeded(receipt);
      await report({ user_address: state.account, tx_hash: hash, chain_id: "bsc", tx_type: state.side === "buy" ? "pump_buy" : "pump_sell", from_token: state.side === "buy" ? state.detail.quote_token : state.detail.symbol, to_token: state.side === "buy" ? state.detail.symbol : state.detail.quote_token, from_amount: amount, to_amount: formatUnits(output), status: ok ? "success" : "failed", metadata: { token_address: tokenAddress(state.selected), curve_address: curve } });
      mainStatusReported = true;
      if (!ok) throw new Error("交易回执失败");
      toast("交易已确认");
      await Promise.all([loadDetail(state.selected), loadUserPanels()]);
    } catch (error) {
      if (hash && !mainStatusReported && error?.code !== "TX_CONFIRMATION_PENDING") await report({ user_address: state.account, tx_hash: hash, chain_id: "bsc", tx_type: state.side === "buy" ? "pump_buy" : "pump_sell", status: "failed", metadata: { error: error.message } });
      if (hash) await loadUserPanels().catch(() => undefined);
      throw error;
    } finally { state.busy = false; }
  };
  const executeTrade = async () => { if (state.busy) throw new Error("交易正在处理中，请等待当前交易完成"); const submit = $("#trade-submit"); state.busy = true; if (submit) submit.disabled = true; try { return await executeTradeSingleFlight(); } finally { state.busy = false; if (submit) submit.disabled = false; } };
  const launchWord = (value) => value.toString(16).padStart(64, "0");
  const launchAddressWord = (value) => { if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("发币地址绑定无效"); return value.slice(2).toLowerCase().padStart(64, "0"); };
  const abiString = (value) => { const bytes = Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join(""); return `${launchWord(BigInt(bytes.length / 2))}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")}`; };
  const launchTaxConfig = () => {
    if (!state.taxEnabled) return null; const read = (id) => Number($(id)?.value); const buy=read("#buy-tax-rate"),sell=read("#sell-tax-rate"),funds=read("#funds-recipient-pct"),burn=read("#burn-pct"),holders=read("#holders-pct"),liquidity=read("#liquidity-pct"),minimum=String($("#min-dividend-balance")?.value||"0").trim(),recipient=String($("#tax-recipient-wallet")?.value||"").trim();
    if (![buy,sell].every((v)=>Number.isFinite(v)&&v>=1&&v<=10)) throw new Error("买入和卖出税率必须在 1%–10% 之间"); if (![funds,burn,holders,liquidity].every((v)=>Number.isFinite(v)&&v>=0)||Math.abs(funds+burn+holders+liquidity-100)>0.001) throw new Error("税费分配比例合计必须为 100%"); if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error("请输入有效的税费接收钱包"); parseUnits(minimum);
    return { buy_tax_rate:String(buy),sell_tax_rate:String(sell),funds_recipient_pct:String(funds),burn_pct:String(burn),holders_pct:String(holders),liquidity_pct:String(liquidity),min_dividend_balance:minimum,recipient_wallet:recipient,buyBps:BigInt(Math.round(buy*100)),sellBps:BigInt(Math.round(sell*100)),fundsBps:BigInt(Math.round(funds*100)),burnBps:BigInt(Math.round(burn*100)),holdersBps:BigInt(Math.round(holders*100)),liquidityBps:BigInt(Math.round(liquidity*100)),minimumWei:parseUnits(minimum),recipient};
  };
  const launchCurveTarget = () => {
    if (state.curveMode !== "custom") return null;
    const value = String($("#migration-threshold-quote")?.value || "").trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) || BigInt(parseUnits(value)) <= 0n) throw new Error("请输入有效的 DEX 迁移目标");
    return value;
  };
  const encodeLaunch = (prepared,tax) => { if (!/^0x[0-9a-fA-F]{64}$/.test(prepared.salt)) throw new Error("发币准备参数绑定无效"); const name=abiString(prepared.launch.token_name),symbol=abiString(prepared.launch.symbol); if(!tax){if(prepared.method!=="launchTokenWithQuotePaid(string,string,uint256,bytes32,address)")throw new Error("发币准备方法无效");const nameOffset=160n,symbolOffset=nameOffset+BigInt(name.length/2);return `0x187fdf81${launchWord(nameOffset)}${launchWord(symbolOffset)}${launchWord(BigInt(prepared.migration_threshold_wei))}${prepared.salt.slice(2).toLowerCase()}${launchAddressWord(prepared.quote_token_address)}${name}${symbol}`;} if(!prepared.method.startsWith("launchTaxTokenWithQuotePaid"))throw new Error("税费代币发币方法无效");const nameOffset=416n,symbolOffset=nameOffset+BigInt(name.length/2);return `0x4bec1297${launchWord(nameOffset)}${launchWord(symbolOffset)}${launchWord(BigInt(prepared.migration_threshold_wei))}${prepared.salt.slice(2).toLowerCase()}${launchAddressWord(prepared.quote_token_address)}${launchWord(tax.buyBps)}${launchWord(tax.sellBps)}${launchWord(tax.fundsBps)}${launchWord(tax.burnBps)}${launchWord(tax.holdersBps)}${launchWord(tax.liquidityBps)}${launchWord(tax.minimumWei)}${launchAddressWord(tax.recipient)}${name}${symbol}`; };
  const launchPreflight = async ({ from, to, data, value }) => {
    const balance = await walletNativeBalance();
    if (balance < value) {
      const missing = value - balance;
      throw new Error(`BNB 余额不足：当前 ${formatUnits(balance)} BNB，发射费为 ${formatUnits(value)} BNB（另需 Gas），至少还差 ${formatUnits(missing)} BNB`);
    }
    const fee = await getFeePolicy();
    const estimateTx = { from, to, data, value: `0x${value.toString(16)}`, maxPriorityFeePerGas: `0x${fee.maxPriorityFeePerGas.toString(16)}`, maxFeePerGas: `0x${fee.maxFeePerGas.toString(16)}` };
    let estimatedGas;
    try {
      estimatedGas = BigInt(await selectedProvider().request({ method: "eth_estimateGas", params: [estimateTx] }));
    } catch (error) {
      const message = String(error?.message || error?.data?.message || error?.data?.originalError?.message || "");
      if (/Address must end with 8888|CREATE2 failed/i.test(message)) throw new Error("发币参数与链上 Factory 不一致，请重新加载发币参数");
      if (/insufficient funds/i.test(message)) throw new Error(`BNB 余额不足：当前 ${formatUnits(balance)} BNB，请补充发射费和 Gas 后重试`);
      throw error;
    }
    const gas = (estimatedGas * 120n + 99n) / 100n;
    const required = value + gas * fee.maxFeePerGas;
    if (balance < required) {
      throw new Error(`BNB 余额不足：当前 ${formatUnits(balance)} BNB，发射费和预估 Gas 至少需要 ${formatUnits(required)} BNB，还差 ${formatUnits(required - balance)} BNB`);
    }
    return { fee, gas, balance, required };
  };
  const assertLaunchBinding = (fee, prepared, address, name, symbol, quote, tax) => {
    const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
    const isNonZeroAddress = (value) => isAddress(value) && String(value).toLowerCase() !== ZERO_ADDRESS;
    const isUint = (value) => /^\d+$/.test(String(value || ""));
    const normalizedFeeChain = normalizeChainId(fee?.chain_id);
    const normalizedPreparedChain = normalizeChainId(prepared?.chain_id);
    const expectedQuote = quoteAddress(quote) || ZERO_ADDRESS;
    if (!prepared?.launch?.id || !isNonZeroAddress(address) || !isNonZeroAddress(fee?.factory_address) || !isNonZeroAddress(prepared?.factory_address) || prepared.factory_address.toLowerCase() !== fee.factory_address.toLowerCase()) throw new Error("发币准备工厂绑定无效");
    if (!isNonZeroAddress(fee.receive_address) || !isNonZeroAddress(prepared.fee_recipient) || prepared.fee_recipient.toLowerCase() !== fee.receive_address.toLowerCase()) throw new Error("发币手续费接收地址绑定无效");
    if (normalizedFeeChain !== "0x38" || normalizedPreparedChain !== "0x38") throw new Error("发币准备网络无效");
    if (!isUint(fee.fee_wei) || !isUint(prepared.fee_wei) || fee.fee_wei !== prepared.fee_wei || BigInt(prepared.fee_wei) <= 0n || !isUint(prepared.migration_threshold_wei) || BigInt(prepared.migration_threshold_wei) <= 0n) throw new Error("发币准备金额无效");
    if (!["launchTokenWithQuotePaid(string,string,uint256,bytes32,address)","launchTaxTokenWithQuotePaid(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address))"].includes(prepared.method) || !/^0x[0-9a-fA-F]{64}$/.test(String(prepared.salt || ""))) throw new Error("发币准备方法或随机盐无效");
    if (!isAddress(prepared.predicted_token_address) || prepared.predicted_token_address.toLowerCase() === ZERO_ADDRESS || !isAddress(prepared.curve_address) || prepared.curve_address.toLowerCase() === ZERO_ADDRESS || !isAddress(prepared.quote_token_address) || prepared.quote_token_address.toLowerCase() !== expectedQuote.toLowerCase() || prepared.curve_address.toLowerCase() === prepared.predicted_token_address.toLowerCase()) throw new Error("发币准备资产地址绑定无效");
    if (prepared.launch.creator_address?.toLowerCase() !== address.toLowerCase() || prepared.launch.token_name !== name || prepared.launch.symbol !== symbol || prepared.launch.quote_token?.toUpperCase() !== quote) throw new Error("发币准备参数与钱包或表单不匹配");
    const expectedTaxMethod = Boolean(tax);
    if (prepared.method.startsWith("launchTaxTokenWithQuotePaid") !== expectedTaxMethod) throw new Error("发币准备方法与税费模式不匹配");
    const rawSettings = prepared.launch.launch_settings;
    const settings = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
    if (String(settings?.curve_mode || "standard") !== state.curveMode) throw new Error("发币准备曲线模式不匹配");
    if (Boolean(settings?.enable_tax) !== expectedTaxMethod) throw new Error("发币准备税费配置不匹配");
    if (tax) {
      for (const key of ["buy_tax_rate", "sell_tax_rate", "funds_recipient_pct", "burn_pct", "holders_pct", "liquidity_pct", "min_dividend_balance"]) {
        if (String(settings?.[key]) !== String(tax[key])) throw new Error("发币准备税费配置已变化，请重新加载");
      }
      if (String(settings?.recipient_wallet || "").toLowerCase() !== tax.recipient.toLowerCase()) throw new Error("发币准备税费钱包不匹配");
    }
    return prepared;
  };
  const launchFormKey = () => `${window.bitbtLaunchLogoSelectionKey?.() || document.documentElement.dataset.launchLogoSelection || ""}|` + $$('[data-panel="create-basic"] input, [data-panel="create-basic"] textarea, [data-panel="create-basic"] select, [data-panel="create-economics"] input, [data-panel="create-economics"] textarea, [data-panel="create-economics"] select, [data-panel="create-tax"] input, [data-panel="create-tax"] textarea, [data-panel="create-tax"] select, [data-panel="create-economics"] .active, [data-panel="create-tax"] .active').map((node) => `${node.id || node.name || node.className}:${node.value || node.textContent || ""}`).join("|");
  const waitForLaunchFinality = async (launchId, initial) => {
    let result = initial;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (["deployed", "migrated"].includes(result?.status)) return result;
      if (result?.status === "rejected") throw new Error(result.rejection_reason || "发币已被拒绝");
      if (!["prepared", "pending_review", "approved", "deploying", "deploy_failed"].includes(result?.status)) throw new Error(result?.rejection_reason || `发币状态为 ${result?.status || "未知"}`);
      result = await api(`v1/token/status?id=${encodeURIComponent(launchId)}`);
      if (["deployed", "migrated"].includes(result?.status)) return result;
      if (attempt < 19) await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    throw new Error(result?.rejection_reason || "发币状态确认超时，请稍后在我的代币中查看");
  };
  const persistLaunchConfirmation = () => {
    try {
      if (state.launchConfirmation) sessionStorage.setItem(PENDING_LAUNCH_CONFIRMATION_KEY, JSON.stringify(state.launchConfirmation));
      else sessionStorage.removeItem(PENDING_LAUNCH_CONFIRMATION_KEY);
    } catch {}
  };
  const renderLaunchConfirmationRetry = (message = "链上发币已成功，等待保存结果") => {
    state.launchSnapshot = null;
    state.launchTerminal = false;
    clearLaunchReview();
    const publishButton = $("[data-launch-publish]");
    if (publishButton) { publishButton.disabled = false; publishButton.removeAttribute("disabled"); publishButton.textContent = "重试保存发币结果"; publishButton.title = message; }
  };
  const rememberLaunchConfirmation = (pending, message) => {
    state.launchConfirmation = pending;
    persistLaunchConfirmation();
    renderLaunchConfirmationRetry(message);
  };
  const restoreLaunchConfirmation = () => {
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_LAUNCH_CONFIRMATION_KEY) || "null");
      if (!pending || !/^0x[0-9a-fA-F]{64}$/.test(String(pending.hash || "")) || !pending.prepared?.launch?.id || !/^0x[0-9a-fA-F]{40}$/.test(String(pending.prepared?.predicted_token_address || ""))) throw new Error("invalid pending launch");
      state.launchConfirmation = pending;
      renderLaunchConfirmationRetry("检测到链上成功但尚未保存的发币结果");
      toast("检测到待确认的发币结果，请点击重试保存", 7000);
    } catch { sessionStorage.removeItem(PENDING_LAUNCH_CONFIRMATION_KEY); }
  };
  const clearLaunchConfirmation = () => { state.launchConfirmation = null; persistLaunchConfirmation(); };
  const confirmSuccessfulLaunch = async () => {
    const pending = state.launchConfirmation;
    if (!pending) throw new Error("没有待确认的发币结果");
    const { prepared, hash, name, symbol, quote } = pending;
    if (pending.logoRequired && !pending.confirmedLogoUrl) {
      const selectionKey = window.bitbtLaunchLogoSelectionKey?.() || document.documentElement.dataset.launchLogoSelection || "";
      if (!selectionKey) { renderLaunchConfirmationRetry("链上发币已成功，请重新选择 Logo 后重试"); throw new Error("代币已创建，请重新选择 Logo 后点击重试保存"); }
      try {
        pending.confirmedLogoUrl = await window.bitbtUploadSelectedLaunchLogo?.() || "";
        if (!pending.confirmedLogoUrl) throw new Error("Logo 上传未返回有效地址");
        persistLaunchConfirmation();
      } catch (error) {
        renderLaunchConfirmationRetry("链上发币已成功，Logo 上传失败可重试");
        throw error;
      }
    }
    let result;
    try {
      result = await api("v1/token/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ launch_id: prepared.launch.id, deploy_tx_hash: hash, logo_url: pending.confirmedLogoUrl || undefined }) });
      if (!["deployed", "migrated"].includes(result.status)) result = await waitForLaunchFinality(prepared.launch.id, result);
    } catch (error) {
      renderLaunchConfirmationRetry(`链上交易 ${hash.slice(0, 10)}… 已成功，后台确认可重试`);
      throw error;
    }
    const launchedAddress = result.contract_address || prepared.predicted_token_address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(launchedAddress)) { renderLaunchConfirmationRetry("链上发币已成功，返回地址异常可重试"); throw new Error("发币回执缺少有效代币地址"); }
    const launchedToken = { ...prepared.launch, ...result, contract_address: launchedAddress, token_name: name, symbol, quote_token: quote, status: result.status, curve_address: prepared.curve_address, quote_token_address: prepared.quote_token_address, progress_percent: 0, logo_url: result.logo_url || pending.confirmedLogoUrl || null };
    const normalizedLaunchAddress = launchedAddress.toLowerCase();
    state.tokens = [launchedToken, ...state.tokens.filter((token) => tokenAddress(token).toLowerCase() !== normalizedLaunchAddress)];
    state.details[normalizedLaunchAddress] = launchedToken;
    clearLaunchConfirmation();
    state.launchTerminal = true;
    setTokenPath(launchedAddress, "push");
    renderTokens();
    await openToken(launchedToken, { historyMode: null, fallbackDetail: launchedToken });
    toast(pending.logoRequired ? "发币完成，Logo 已保存" : "发币完成");
    return result;
  };
  const launchTokenSingleFlight = async () => {
    if (state.launchConfirmation) return confirmSuccessfulLaunch();
    if (state.launchTerminal) throw new Error("本次发币流程已结束，请刷新页面开始新的流程");
    const name = $("#token-name")?.value?.trim(); const symbol = $("#token-symbol")?.value?.trim().toUpperCase(); if (!name || !symbol) throw new Error("请填写代币名称和符号"); const address = state.account || await connectWallet(); await assertProviderState();
    const quote = state.launchQuote; if (!quoteAddress(quote) && quote !== "BNB") throw new Error("不支持的发币计价资产"); const description = $("#token-story")?.value?.trim() || ""; const logoSelectionKey = window.bitbtLaunchLogoSelectionKey?.() || document.documentElement.dataset.launchLogoSelection || ""; const metadata = { classification: $("#token-classification")?.value?.trim() || "Meme", twitter: $("#token-twitter")?.value?.trim() || "", telegram: $("#token-telegram")?.value?.trim() || "", website: $("#token-website")?.value?.trim() || "", discord: $("#token-discord")?.value?.trim() || "" }; const tax = launchTaxConfig(); const formKey = launchFormKey(); const snapshotKey = `${address}|${name}|${symbol}|${quote}|${description}|${logoSelectionKey}|${formKey}`; let snapshot = state.launchSnapshot;
    if (!snapshot || snapshot.key !== snapshotKey) {
      const fee = await api("v1/token/launch-fee");
      if (!/^0x[0-9a-fA-F]{40}$/.test(fee.factory_address) || !/^\d+$/.test(fee.fee_wei)) throw new Error("发币费用配置无效");
      const curveTarget = launchCurveTarget();
      const launchSettings = tax ? { antisniper: true, enable_tax: true, request_platform_lp: false, curve_mode: state.curveMode, buy_tax_rate: tax.buy_tax_rate, sell_tax_rate: tax.sell_tax_rate, funds_recipient_pct: tax.funds_recipient_pct, burn_pct: tax.burn_pct, holders_pct: tax.holders_pct, liquidity_pct: tax.liquidity_pct, min_dividend_balance: tax.min_dividend_balance, recipient_wallet: tax.recipient } : { antisniper: true, enable_tax: false, request_platform_lp: false, curve_mode: state.curveMode };
      const prepared = await api("v1/token/prepare-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creator_address: address, token_name: name, symbol, total_supply: "1000000000", decimals: 18, mintable: false, burnable: false, chain_id: "bsc", quote_token: quote, migration_threshold_quote: curveTarget || undefined, description: description || undefined, classification: metadata.classification, twitter: metadata.twitter || undefined, telegram: metadata.telegram || undefined, website: metadata.website || undefined, discord: metadata.discord || undefined, launch_settings: launchSettings }) });
      assertLaunchBinding(fee, prepared, address, name, symbol, quote, tax);
      snapshot = { key: snapshotKey, fee, prepared, address, name, symbol, quote, description, metadata, formKey, logoSelectionKey, tax };
      state.launchSnapshot = snapshot;
      renderLaunchReview(fee, prepared, description);
      renderLaunchTaxReview(tax);
      toast("发币参数已自动准备，请核对快照后发布");
      return snapshot;
    }
    const { fee, prepared } = snapshot; assertLaunchBinding(fee, prepared, address, name, symbol, quote, tax); if (snapshot.name !== name || snapshot.symbol !== symbol || snapshot.quote !== quote || snapshot.address !== address || snapshot.description !== description || snapshot.formKey !== formKey || snapshot.logoSelectionKey !== logoSelectionKey) { invalidateLaunchSnapshot(); throw new Error("发币确认快照已过期，请重新加载"); }
    const provider = selectedProvider(); await ensureBscChain(provider); await assertProviderState(); const accounts = await provider.request({ method: "eth_accounts" }); if (String(accounts?.[0] || "").toLowerCase() !== address.toLowerCase()) throw new Error("钱包账户已变化，请重新连接");
    const launchData = encodeLaunch(prepared, tax); const launchValue = BigInt(fee.fee_wei); let preflight; try { preflight = await launchPreflight({ from: address, to: prepared.factory_address, data: launchData, value: launchValue }); } catch (error) { if (/发币参数与链上 Factory 不一致/.test(String(error?.message || ""))) { invalidateLaunchSnapshot(true); await launchTokenSingleFlight(); toast("链上 Factory 状态已变化，参数已自动更新，请重新核对后发布"); return; } throw error; }
    let hash;
    try {
      hash = await send({ from: address, to: prepared.factory_address, data: launchData, value: launchValue, gas: preflight.gas, fee: preflight.fee });
    } catch (error) {
      const code = Number(error?.code ?? error?.data?.originalError?.code);
      if (code === 4001) { state.launchTerminal = false; renderLaunchReview(fee, prepared, description); toast("钱包取消了交易，可以重新确认"); }
      else setLaunchTerminal("交易状态未知，请先核对链上状态后再继续");
      throw error;
    }
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]+$/.test(hash)) { setLaunchTerminal("交易状态未知，请先核对链上状态后再继续"); throw new Error("钱包未返回可验证的发币交易哈希"); }
    setLaunchTerminal(`已广播 ${hash.slice(0, 10)}…，等待回执`);
    toast("发币交易已广播，等待回执…");
    let receipt;
    try { receipt = await waitReceipt(hash); }
    catch (error) { setLaunchTerminal(`交易 ${hash.slice(0, 10)}… 未完成，请核对链上状态`); throw error; }
    if (!receiptSucceeded(receipt)) { setLaunchTerminal(`交易 ${hash.slice(0, 10)}… 回执失败`); throw new Error("发币交易回执失败"); }

    rememberLaunchConfirmation({ prepared, hash, name, symbol, quote, logoRequired: Boolean(logoSelectionKey), confirmedLogoUrl: "" }, "链上发币成功，正在保存 Logo 与项目信息");
    return confirmSuccessfulLaunch();
  };
  const launchToken = async () => { if (state.launchBusy) throw new Error("发币正在处理中，请等待当前操作完成"); state.launchBusy = true; try { return await launchTokenSingleFlight(); } finally { state.launchBusy = false; } };
  const bindLiveTokenSelection = () => $$("[data-live-token]").forEach((node) => { if (node.dataset.liveBound) return; node.dataset.liveBound = "1"; node.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); const token = state.tokens.find((item) => tokenAddress(item).toLowerCase() === String(node.dataset.liveToken || "").toLowerCase()); if (token) openToken(token).catch((error) => toastError(error, "代币详情加载失败，请稍后重试")); }, true); });
  const setCurveMode = (mode) => { state.curveMode = mode === "custom" ? "custom" : "standard"; $$('[data-curve-mode]').forEach((choice) => choice.classList.toggle("active", choice.dataset.curveMode === state.curveMode)); $$('[data-custom-curve-fields]').forEach((group) => { group.hidden = state.curveMode !== "custom"; }); const unit = $("[data-migration-threshold-unit]"); if (unit) unit.textContent = state.launchQuote; const input = $("#migration-threshold-quote"); if (input && state.curveMode === "custom" && !input.value) input.value = state.launchQuote === "BNB" ? "115" : "69000"; invalidateLaunchSnapshot(); };
  const applyTaxDefaults = () => { if (!state.taxEnabled) return; const defaults = { "#buy-tax-rate": "5", "#sell-tax-rate": "5", "#funds-recipient-pct": "40", "#burn-pct": "20", "#holders-pct": "20", "#liquidity-pct": "20", "#min-dividend-balance": "100000", "#tax-recipient-wallet": state.account || "" }; Object.entries(defaults).forEach(([selector, value]) => { const input = $(selector); if (input && !input.value && value) input.value = value; }); };
  const setTaxMode = (enabled) => { state.taxEnabled = Boolean(enabled); $$('[data-tax-mode]').forEach((choice) => choice.classList.toggle("active", (choice.dataset.taxMode === "tax") === state.taxEnabled)); $$('[data-tax-fields]').forEach((group) => { group.hidden = !state.taxEnabled; }); applyTaxDefaults(); invalidateLaunchSnapshot(); };
  const applyLaunchMode = (mode) => { state.launchMode = ["custom", "community"].includes(mode) ? mode : "fair"; setCurveMode(state.launchMode === "custom" ? "custom" : "standard"); setTaxMode(state.launchMode === "community"); };
  const autoPrepareLaunch = async () => { if (state.launchSnapshot || state.launchConfirmation || state.launchTerminal || state.launchBusy) return; const publishButton = $("[data-launch-publish]"); if (publishButton) { publishButton.disabled = true; publishButton.setAttribute("disabled", ""); publishButton.textContent = "正在自动准备发币参数…"; } try { await launchToken(); } catch (error) { if (publishButton) { publishButton.disabled = true; publishButton.setAttribute("disabled", ""); publishButton.textContent = "参数准备失败，请返回修改后重试"; } toastError(error, "发币参数自动准备失败，请返回修改后重试"); } };
  const show = (name) => { const target = root.querySelector(`[data-panel="${CSS.escape(name)}"]`); if (!target) return; invalidateQuote(); if (name === "create-mode" || (name === "create-basic" && state.launchTerminal)) resetLaunchFlow(); else if (!state.launchSnapshot || name !== "create-review") invalidateLaunchSnapshot(); $$(`[data-panel]`).forEach((panel) => panel.classList.toggle("active", panel === target)); target.classList.add("has-bottom-nav"); target.scrollTop = 0; routeHistory()?.replaceState?.(null, "", `${pumpBasePath()}?screen=${encodeURIComponent(name)}`); if (name === "create-review") void autoPrepareLaunch(); };
  const bindNavigation = () => { $$("[data-open]").forEach((node) => node.addEventListener("click", (event) => { if (node.dataset.liveToken) return; event.preventDefault(); if (node.dataset.launchMode) applyLaunchMode(node.dataset.launchMode); show(node.dataset.open); if (node.dataset.side) applySide(node.dataset.side === "sell"); })); $$("[data-nav]").forEach((node) => node.addEventListener("click", () => show(node.dataset.nav))); $$("[data-detail-tab]").forEach((node) => node.addEventListener("click", () => { $$("[data-detail-tab]").forEach((tab) => tab.classList.toggle("active", tab === node)); $$("[data-detail-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.detailPanel === node.dataset.detailTab)); if (node.dataset.detailTab === "holders") void loadHolders(); })); $$("[data-amount]").forEach((node) => node.addEventListener("click", () => { const input = $("#trade-amount"); if (input) input.value = node.dataset.amount === "MAX" ? "" : node.dataset.amount; invalidateQuote(); })); $$("[data-lang-toggle]").forEach((node) => node.addEventListener("click", () => { const target = pumpLocale() === "zh" ? "en" : "zh"; try { window.localStorage?.setItem(LOCALE_KEY, target); } catch {} document.documentElement.lang = target === "zh" ? "zh-CN" : "en"; text("[data-lang-current]", target === "zh" ? "简体中文" : "English"); toast(target === "zh" ? "语言偏好已保存" : "Language preference saved"); })); };
  const bind = () => { $$('[data-wallet-label], .connect-global, .connect').forEach((node) => { node.dataset.walletBound = "1"; node.addEventListener("click", () => connectWallet().catch((error) => toastError(error, "钱包连接失败，请重试"))); }); $$('[data-toast]:not([data-wallet-bound="1"])').forEach((node) => node.addEventListener("click", () => toast(node.dataset.toast))); $$('[data-copy-token-address]').forEach((node) => node.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); copyTokenAddress().catch((error) => toastError(error, "代币地址复制失败")); }, true)); $$('[data-share-token]').forEach((node) => node.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); shareToken().catch((error) => toastError(error, "代币链接复制失败")); }, true)); $$('[data-favorite-token]').forEach((node) => node.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); toggleFavorite().catch((error) => toastError(error, "自选更新失败")); }, true)); $$('[data-chart-interval]').forEach((node) => node.addEventListener("click", () => { const interval = Number(node.dataset.chartInterval); if (![60, 300, 900, 3600, 14400, 86400].includes(interval)) return; state.chartInterval = interval; $$('[data-chart-interval]').forEach((choice) => choice.classList.toggle("active", Number(choice.dataset.chartInterval) === interval)); drawCharts(); })); $$("[data-trade-side]").forEach((node) => node.addEventListener("click", () => applySide(node.dataset.tradeSide === "sell"))); const input = $("#trade-amount"); input?.addEventListener("input", () => { window.clearTimeout(input._quoteTimer); input._quoteTimer = window.setTimeout(() => updateQuote().catch((error) => toastError(error, "报价获取失败，请稍后重试")), 350); }); $("#trade-submit")?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); executeTrade().catch((error) => toastError(error, "交易提交失败，请稍后重试")); }, true); $$('[data-launch-publish]').forEach((node) => { if (node.dataset.launchBound) return; node.dataset.launchBound = "1"; node.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); launchToken().catch((error) => toastError(error, "发币提交失败，请稍后重试")); }, true); }); };
  const applyMarketActivity = (payload) => { state.marketActivity = Array.isArray(payload?.activity) ? payload.activity : []; state.marketSummary = payload?.summary && typeof payload.summary === "object" ? payload.summary : {}; renderMarketSummary(); renderLiveRows(); };
  const renderUnavailable = (error) => { clearPrototype(); state.tokens = []; state.details = {}; state.selected = null; state.detail = null; state.trades = []; state.marketActivity = []; state.marketSummary = {}; const banner = $("[data-api-status]"); if (banner) banner.textContent = "实时 Pump 数据暂不可用"; text("[data-market-stream-status]", "BNB Chain 数据流暂不可用"); toastError(error, "实时 Pump 数据暂不可用，请稍后重试"); };
  const load = async () => { try { const [tokens, market, config] = await Promise.all([api("v1/pump/tokens"), api("v1/pump/market-activity?limit=100").catch(() => null), api("v1/app/config").catch(() => null)]); state.tokens = tokens; state.config = config; if (market) applyMarketActivity(market); else { renderMarketSummary(); text("[data-market-stream-status]", "全市场链上动态暂不可用"); const banner = $("[data-api-status]"); if (banner) banner.textContent = `Pump 项目数据已连接 · ${state.tokens.length} 个项目 · 全市场动态暂不可用`; } renderTokens(); const routedAddress = routeTokenAddress(); if (routedAddress) await openTokenAddress(routedAddress, { historyMode: "replace" }); else { const first = state.tokens.find((token) => tokenAddress(token)); if (first) void loadDetail(first).catch((error) => toastError(error, "首个项目详情加载失败")); } } catch (error) { renderUnavailable(error); } };
  const refreshSelectedTrades = () => { if (state.refreshPromise || !state.selected) return state.refreshPromise; state.refreshPromise = (async () => { state.trades = await api(`v1/pump/trades?token_address=${encodeURIComponent(tokenAddress(state.selected))}`); renderSelected(); drawCharts(); })().catch((error) => toastError(error, "成交记录刷新失败，请稍后重试")).finally(() => { state.refreshPromise = null; }); return state.refreshPromise; };
  const refreshLive = () => { if (state.refreshPromise) return state.refreshPromise; state.refreshPromise = (async () => { const [tokens, market] = await Promise.all([api("v1/pump/tokens"), api("v1/pump/market-activity?limit=100").catch(() => null)]); state.tokens = tokens; if (market) applyMarketActivity(market); else text("[data-market-stream-status]", "全市场链上动态暂不可用"); renderTokens(); if (state.selected) await loadDetail(state.selected, { refreshBalance: false }); })().catch((error) => renderUnavailable(error)).finally(() => { state.refreshPromise = null; }); return state.refreshPromise; };
  $$('[data-launch-quote]').forEach((node) => node.addEventListener("click", () => { state.launchQuote = String(node.dataset.launchQuote || "").toUpperCase(); const unit = $("[data-migration-threshold-unit]"); if (unit) unit.textContent = state.launchQuote; const target = $("#migration-threshold-quote"); if (target && state.curveMode === "custom") target.value = state.launchQuote === "BNB" ? "115" : "69000"; invalidateLaunchSnapshot(); $$('[data-launch-quote]').forEach((choice) => choice.classList.toggle("active", choice === node)); }));
  $$('[data-curve-mode]').forEach((node) => node.addEventListener("click", () => setCurveMode(node.dataset.curveMode)));
  $$('[data-tax-mode]').forEach((node) => node.addEventListener("click", () => setTaxMode(node.dataset.taxMode === "tax")));
  $$('[data-panel="create-basic"] input, [data-panel="create-basic"] textarea, [data-panel="create-basic"] select, [data-panel="create-economics"] input, [data-panel="create-economics"] textarea, [data-panel="create-economics"] select, [data-panel="create-tax"] input, [data-panel="create-tax"] textarea, [data-panel="create-tax"] select').forEach((node) => { node.addEventListener("input", invalidateLaunchSnapshot); node.addEventListener("change", invalidateLaunchSnapshot); });
  $$('[data-panel="create-economics"] .choice, [data-panel="create-tax"] .choice, [data-panel="create-mode"] [data-launch-mode]').forEach((node) => node.addEventListener("click", invalidateLaunchSnapshot));
  $$('[data-token-filter]').forEach((node) => node.addEventListener("click", () => { state.tokenFilter = node.dataset.tokenFilter || "trending"; $$('[data-token-filter]').forEach((filter) => filter.classList.toggle("active", filter === node)); renderTokens(); }));
  $$('[data-token-search-toggle]').forEach((node) => node.addEventListener("click", () => { show("discover"); const input = $('[data-token-search]'); if (!input) return; input.hidden = false; input.focus(); }));
  $('[data-token-search]')?.addEventListener("input", (event) => { state.tokenSearch = event.target.value || ""; renderTokens(); });
  $$('[data-live-filter]').forEach((node) => node.addEventListener("click", () => { state.liveFilter = node.dataset.liveFilter || "all"; $$('[data-live-filter]').forEach((filter) => filter.classList.toggle("active", filter === node)); renderLiveRows(); }));
  $$('[data-rank-filter]').forEach((node) => node.addEventListener("click", () => { state.rankFilter = node.dataset.rankFilter || "progress"; $$('[data-rank-filter]').forEach((filter) => filter.classList.toggle("active", filter === node)); renderRank(); }));
  $$('[data-launch-filter]').forEach((node) => node.addEventListener("click", () => { state.myLaunchFilter = node.dataset.launchFilter || "all"; $$('[data-launch-filter]').forEach((filter) => filter.classList.toggle("active", filter === node)); renderMyPanels(); }));
  $$('[data-history-filter]').forEach((node) => node.addEventListener("click", () => { state.historyFilter = node.dataset.historyFilter || "all"; $$('[data-history-filter]').forEach((filter) => filter.classList.toggle("active", filter === node)); renderMyPanels(); }));
  routeWindow.addEventListener("popstate", () => { const address = routeTokenAddress(); if (address) { void openTokenAddress(address, { historyMode: null }).catch((error) => toastError(error, "代币详情恢复失败")); return; } const discover = $('[data-panel="discover"]'); if (discover) { $$('[data-panel]').forEach((panel) => panel.classList.toggle("active", panel === discover)); discover.classList.add("has-bottom-nav"); discover.scrollTop = 0; } });
  let refreshCycle = 0;
  setLaunchAvailability(false); invalidateLaunchSnapshot(); clearPrototype(); document.body.classList.remove("runtime-pending"); renderMyPanels(); bindProviderEvents(); bindNavigation(); bind(); restoreLaunchConfirmation(); void restoreSession(); void load(); void loadFavorites(); window.setInterval(() => { if (document.visibilityState === "hidden") return; refreshCycle += 1; void (refreshCycle % 2 === 0 ? refreshLive() : refreshSelectedTrades()); }, 15000);
})();
