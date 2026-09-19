/* Live data adapter for the delivered Launchpad UI. The HTML/CSS stays the source of truth. */
(() => {
  const root = document.getElementById("bitbt-launch");
  if (!root) return;
  const ui20260911 = root.dataset.uiVersion === "20260911";
  const readLocalPreference = (key) => {
    try {
      return window.localStorage?.getItem(key) || "";
    } catch {
      return "";
    }
  };
  const writeLocalPreference = (key, value) => {
    try {
      window.localStorage?.setItem(key, value);
    } catch {}
  };
  // Display-only preferences. Never feed rounded values back into transaction amounts.
  const displayPrecision = () => ['6', '8'].includes(readLocalPreference('bitbt_price_precision')) ? Number(readLocalPreference('bitbt_price_precision')) : null;
  const displayTimeZone = () => {
    const value = readLocalPreference('bitbt_time_zone');
    return ['Asia/Shanghai', 'UTC', 'America/New_York'].includes(value) ? value : undefined;
  };
  const displayPrice = (value, fallback) => {
    const digits = displayPrecision();
    if (digits === null || !Number.isFinite(Number(value))) return fallback;
    const parsed = Number(value);
    // A positive price must never look like zero after rounding.
    if (parsed !== 0 && Math.abs(parsed) < 10 ** -digits) return `${parsed < 0 ? '>−' : '<'}${(10 ** -digits).toFixed(digits)}`;
    return parsed.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  };
  const state = {
    tokens: [],
    tokenFilter: "trending",
    tokenSearch: "",
    marketQuoteFilter: "all",
    marketCategoryFilter: "all",
    marketTypeFilter: "all",
    liveFilter: "all",
    rankFilter: "progress",
    rankWindow: "24h",
    myLaunchFilter: "all",
    historyFilter: "all",
    details: {},
    holders: {},
    comments: {},
    alerts: [],
    points: null,
    referral: null,
    campaigns: [],
    announcements: [],
    marketActivityReady: false,
    announcementFilter: "all",
    selectedAnnouncementId: "",
    perpConfig: null,
    perpMarkets: [],
    selectedPerpMarketId: null,
    perpPoolTarget: null,
    perpPosition: null,
    perpQuoteBalance: null,
    preparedPerpAction: null,
    preparedPerpRequest: null,
    perpSubmitting: false,
    perpKeeperWaking: false,
    perpKeeperWakeAttempt: 0,
    perpOperationNotice: "",
    perpCoreBroadcast: false,
    perpOperationPhase: "",
    perpModernAction: "open_position",
    perpCandles: [],
    perpChartInterval: 300,
    perpChartIndicators: ["MA", "VOL"],
    perpActivity: [],
    perpIndexedPositions: [],
    perpActivityFilter: "all",
    perpHistoryCursor: null,
    perpHistoryBusy: false,
    perpReadErrors: {},
    perpServiceRequests: [],
    perpServiceBusy: false,
    kol: null,
    marketActivity: [],
    marketSummary: {},
    config: null,
    selected: null,
    detail: null,
    trades: [],
    candles: [],
    migrationProof: null,
    myLaunches: [],
    history: [],
    walletHoldings: [],
    walletHoldingsComplete: false,
    tradeHistoryComplete: false,
    creatorRewards: [],
    holderDividends: [],
    v3FeeRewards: [],
    vaultConfig: null,
    vaults: [],
    preparedVault: null,
    strategyConfig: null,
    vaultRegistry: [],
    selectedVaultRegistryId: "",
    preparedRegisteredVault: null,
    preparedRegisteredVaultAction: null,
    strategies: [],
    preparedStrategy: null,
    preparedStrategyAction: null,
    integrationStatus: null,
    webhooks: [],
    favorites: [],
    side: "buy",
    quote: null,
    quoteKey: "",
    account: "",
    chainId: "",
    selectedChain: readLocalPreference("bitbt_pump_chain") || "bsc",
    sessionExpiresAt: 0,
    provider: null,
    balances: { quote: null, token: null, gas: null },
    chartInterval: 300,
    chartIndicators: ["MA", "VOL"],
    busy: false,
    launchBusy: false,
    vaultBusy: false,
    launchQuote: "BNB",
    launchDexProfile: "pancakeswap_v2",
    launchOptions: null,
    launchMode: "fair",
    curveMode: "standard",
    taxEnabled: false,
    launchLogoUrl: "",
    launchSnapshot: null,
    launchConfirmation: null,
    launchTerminal: false,
    liveRefreshPromise: null,
    tradesRefreshPromise: null,
  };
  const SESSION_KEY = "bitbt_pump_session";
  const CHAIN_KEY = "bitbt_pump_chain";
  const SESSION_ADDRESS_KEY = "bitbt_pump_session_address";
  const PROVIDER_KIND_KEY = "bitbt_pump_provider_kind";
  const LOCALE_KEY = "bitbt_pump_locale";
  const ANNOUNCEMENT_READ_KEY = "bitbt_pump_read_announcements";
  const PENDING_LAUNCH_CONFIRMATION_KEY = "bitbt_pump_pending_launch_confirmation";
  const charts = new Map();
  const announcedProviders = [];
  const boundProviders = new Set();
  let providerSelectionPromise = null;
  let walletConnectionPromise = null;
  let sessionRestorePromise = null;
  let sessionRevalidationPromise = null;
  let sessionRevalidationTimer = null;
  let detailRequestSequence = 0;
  let quoteRequestSequence = 0;
  let selectedDetailAddress = "";
  let userDataRequestSequence = 0;
  let walletSessionEpoch = 0;
  let navigationEpoch = 0;
  let balanceRequestSequence = 0;
  let candleRequestSequence = 0;
  let marketSocket = null;
  let marketSocketRetry = 0;
  let marketSocketTimer = null;
  let perpCandlesRefreshPromise = null;
  let perpPositionStreamRefreshTimer = null;
  let perpPositionStreamRefreshInFlight = false;
  let perpPositionStreamRefreshQueued = false;
  let marketRefreshTimer = null;
  let pendingSelectedMarketChange = false;
  let lastMarketEventRefreshAt = 0;
  let lastAlertRefreshAt = 0;
  let walletConnectProviderPromise = null;
  let walletConfigPromise = null;
  let walletConnectBridgePromise = null;
  const NETWORKS = {
    bsc: { id: "bsc", chainId: 56, chainIdHex: "0x38", name: "BNB Smart Chain", shortName: "BNB Chain", native: "BNB", rpcUrls: ["https://bsc-dataseed.binance.org"], explorer: "https://bscscan.com", wrappedNative: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", maxGasPriceWei: 5_000_000_000n },
    robinhood: { id: "robinhood", chainId: 4663, chainIdHex: "0x1237", name: "Robinhood Chain", shortName: "Robinhood", native: "ETH", rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], explorer: "https://robinhoodchain.blockscout.com", wrappedNative: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", maxGasPriceWei: 1_000_000_000n },
    "robinhood-testnet": { id: "robinhood-testnet", chainId: 46630, chainIdHex: "0xb626", name: "Robinhood Chain Testnet", shortName: "Robinhood Testnet", native: "ETH", rpcUrls: ["https://rpc.testnet.chain.robinhood.com"], explorer: "https://explorer.testnet.chain.robinhood.com", wrappedNative: "", maxGasPriceWei: 1_000_000_000n },
  };
  if (!NETWORKS[state.selectedChain]) state.selectedChain = "bsc";
  const selectedNetwork = () => NETWORKS[state.selectedChain] || NETWORKS.bsc;
  const isBscFeatureChain = () => state.selectedChain === "bsc";
  const launchEnabledForSelectedChain = () => {
    const advertised = state.launchOptions?.network?.launch_enabled;
    if (typeof advertised === "boolean") return advertised;
    // Compatibility for an older BSC API response during rolling deploys.
    // Robinhood must always receive the explicit capability flag.
    return isBscFeatureChain() && Boolean(state.launchOptions?.dex_profiles?.some((profile) => profile.enabled));
  };
  const isEvmProvider = (provider) => {
    try {
      return Boolean(provider && typeof provider.request === "function");
    } catch {
      return false;
    }
  };
  const safeProviderInfo = (info) => {
    try {
      return {
        name: typeof info?.name === "string" ? info.name.slice(0, 80) : "EVM Wallet",
        rdns: typeof info?.rdns === "string" ? info.rdns.slice(0, 120) : "",
      };
    } catch {
      return { name: "EVM Wallet", rdns: "" };
    }
  };
  const providerIdentity = (provider, info = {}) => `${info.rdns || ""} ${info.name || ""} ${provider?.isOkxWallet ? "okx" : ""} ${provider?.isOKExWallet ? "okx" : ""} ${provider?.isBinance ? "binance" : ""} ${provider?.isBinanceWallet ? "binance" : ""} ${provider?.isTokenPocket ? "tokenpocket" : ""} ${provider?.isMetaMask ? "metamask" : ""}`.toLowerCase();
  const providerScore = (entry) => {
    const identity = providerIdentity(entry.provider, entry.info);
    if (/okx|okex/.test(identity)) return 500;
    if (/binance/.test(identity)) return 400;
    if (/tokenpocket|token pocket/.test(identity)) return 300;
    if (/metamask/.test(identity)) return 200;
    return 100;
  };
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
    if (existing) {
      existing.info = { ...existing.info, ...safeInfo };
      existing.trustedDirect ||= trustedDirect;
    } else
      announcedProviders.push({
        provider,
        info: safeInfo,
        trustedDirect,
        userApproved: false,
      });
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
  const requestProviderAnnouncements = () =>
    walletWindows().forEach((walletWindow) => {
      try {
        walletWindow.dispatchEvent(new walletWindow.Event("eip6963:requestProvider"));
      } catch {}
    });
  const walletDappUrl = () => {
    try {
      const candidate = window.parent?.location?.href || window.location.href || window.parent?.location?.pathname || window.location.pathname || "/pump";
      const url = new URL(candidate, "https://bitbt.fun");
      return `https://bitbt.fun${url.pathname.startsWith("/launchpad/") ? "/pump" : url.pathname}${url.search}`;
    } catch {
      return "https://bitbt.fun/pump";
    }
  };
  const walletDeepLinks = () => {
    const dappUrl = walletDappUrl();
    const dappWithoutScheme = dappUrl.replace(/^https?:\/\//i, "");
    const okxDeepLink = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(dappUrl)}`;
    return [
      {
        name: "OKX Wallet App",
        brand: "okx",
        note: "在 OKX Wallet DApp 浏览器打开",
        url: `https://www.okx.com/download?deeplink=${encodeURIComponent(okxDeepLink)}`,
      },
      {
        name: "MetaMask App",
        brand: "metamask",
        note: "在 MetaMask 浏览器打开",
        url: `https://metamask.app.link/dapp/${dappWithoutScheme}`,
      },
      {
        name: "Trust Wallet App",
        brand: "trust",
        note: "在 Trust Wallet 浏览器打开",
        url: `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(dappUrl)}`,
      },
      {
        name: "TokenPocket App",
        brand: "tokenpocket",
        note: "在 TokenPocket DApp 浏览器打开",
        url: `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url: dappUrl, chain: "BSC", source: "BitBT Pump" }))}`,
      },
    ];
  };
  const getWalletConfig = () => {
    walletConfigPromise ||= fetch("/api/pump/wallet-config", {
      cache: "no-store",
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "WalletConnect 配置读取失败");
        return payload?.data || {};
      })
      .catch((error) => {
        walletConfigPromise = null;
        throw error;
      });
    return walletConfigPromise;
  };
  const loadWalletConnectBridge = () => {
    if (window.BitBTWalletConnect?.getProvider) return Promise.resolve(window.BitBTWalletConnect);
    walletConnectBridgePromise ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./walletconnect-provider.js";
      script.async = true;
      script.addEventListener("load", () => (window.BitBTWalletConnect?.getProvider ? resolve(window.BitBTWalletConnect) : reject(new Error("WalletConnect 组件初始化失败"))), { once: true });
      script.addEventListener("error", () => reject(new Error("WalletConnect 组件加载失败，请检查网络后重试")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      walletConnectBridgePromise = null;
      throw error;
    });
    return walletConnectBridgePromise;
  };
  const getWalletConnectProvider = () => {
    walletConnectProviderPromise ||= getWalletConfig()
      .then(async (config) => {
        const projectId = String(config.walletConnectProjectId || "").trim();
        if (!projectId) throw new Error("WalletConnect 尚未配置，请使用钱包 App 打开或联系支持");
        const bridge = await loadWalletConnectBridge();
        return bridge.getProvider(projectId);
      })
      .catch((error) => {
        walletConnectProviderPromise = null;
        throw error;
      });
    return walletConnectProviderPromise;
  };
  const openWalletApp = (url) => {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) window.location.href = url;
  };
  const walletBrand = (name = "", rdns = "") => {
    const identity = `${name} ${rdns}`.toLowerCase();
    if (/walletconnect/.test(identity)) return "walletconnect";
    if (/okx|okex/.test(identity)) return "okx";
    if (/binance/.test(identity)) return "binance";
    if (/tokenpocket|token pocket/.test(identity)) return "tokenpocket";
    if (/metamask/.test(identity)) return "metamask";
    if (/trust/.test(identity)) return "trust";
    return "wallet";
  };
  const walletBrandIcon = (brand) => `./assets/wallets/${brand}.svg`;
  const chooseAnnouncedProvider = () => {
    if (providerSelectionPromise) return providerSelectionPromise;
    const choices = announcedProviders.filter((entry) => !entry.trustedDirect && !entry.userApproved && isEvmProvider(entry.provider));
    providerSelectionPromise = new Promise((resolve, reject) => {
      const overlay = document.createElement("div");
      overlay.className = "wallet-provider-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "选择 EVM 钱包");
      const panel = document.createElement("div");
      panel.className = "wallet-provider-dialog";
      const title = document.createElement("h2");
      title.textContent = "选择钱包";
      const note = document.createElement("p");
      note.textContent = "请选择你当前正在使用的钱包。只有确认后，页面才会请求连接和签名。";
      const supported = document.createElement("div");
      supported.className = "wallet-provider-supported";
      supported.setAttribute("aria-label", "支持的钱包");
      [
        ["metamask", "MetaMask"],
        ["okx", "OKX Wallet"],
        ["tokenpocket", "TokenPocket"],
        ["binance", "Binance Wallet"],
        ["trust", "Trust Wallet"],
      ].forEach(([brand, label]) => {
        const badge = document.createElement("span");
        badge.title = label;
        const icon = document.createElement("img");
        icon.src = walletBrandIcon(brand);
        icon.alt = label;
        icon.width = 28;
        icon.height = 28;
        badge.appendChild(icon);
        supported.appendChild(badge);
      });
      const list = document.createElement("div");
      list.className = "wallet-provider-list";
      const cleanup = () => {
        overlay.remove();
        providerSelectionPromise = null;
      };
      const addChoice = (nameText, noteText, onClick, brand = walletBrand(nameText)) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wallet-provider-choice";
        const icon = document.createElement("img");
        icon.className = "wallet-provider-icon";
        icon.src = walletBrandIcon(brand);
        icon.alt = "";
        icon.width = 42;
        icon.height = 42;
        const copy = document.createElement("span");
        copy.className = "wallet-provider-copy";
        const name = document.createElement("strong");
        name.textContent = nameText;
        const note = document.createElement("small");
        note.textContent = noteText;
        copy.append(name, note);
        button.append(icon, copy);
        button.addEventListener("click", onClick);
        list.appendChild(button);
        return button;
      };
      choices.forEach((entry) => {
        const button = addChoice(entry.info.name || "EVM Wallet", entry.info.rdns || "浏览器钱包", () => {
          entry.userApproved = true;
          state.provider = entry.provider;
          sessionStorage.setItem(PROVIDER_KIND_KEY, "injected");
          cleanup();
          resolve(entry.provider);
        }, walletBrand(entry.info.name, entry.info.rdns));
        button.dataset.eip6963Provider = entry.info.rdns || entry.info.name || "provider";
      });
      addChoice("WalletConnect", "扫码或选择 OKX、TokenPocket、Binance、MetaMask 等钱包", () => {
        const selected = list.querySelectorAll("button");
        selected.forEach((button) => {
          button.disabled = true;
        });
        void getWalletConnectProvider()
          .then(async (provider) => {
            if (!provider.connected) await provider.connect();
            state.provider = provider;
            sessionStorage.setItem(PROVIDER_KIND_KEY, "walletconnect");
            cleanup();
            resolve(provider);
          })
          .catch((error) => {
            selected.forEach((button) => {
              button.disabled = false;
            });
            toastError(error, "WalletConnect 连接失败，请重试");
          });
      }, "walletconnect");
      walletDeepLinks().forEach((wallet) => addChoice(wallet.name, wallet.note, () => openWalletApp(wallet.url), wallet.brand));
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "wallet-provider-cancel";
      cancel.textContent = "取消";
      cancel.addEventListener("click", () => {
        cleanup();
        reject(new Error("已取消钱包连接"));
      });
      panel.append(title, note, supported, list, cancel);
      overlay.appendChild(panel);
      root.appendChild(overlay);
      list.querySelector("button")?.focus();
    });
    return providerSelectionPromise;
  };
  const waitForProvider = async (timeout = 350) => {
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
    return chooseAnnouncedProvider();
  };
  const rememberAnnouncedProvider = (event) => {
    rememberProvider(event?.detail?.provider, event?.detail?.info || {}, false);
    if (!state.account && !isEvmProvider(state.provider)) state.provider = collectProviders()[0]?.provider || null;
  };
  walletWindows().forEach((walletWindow) => walletWindow.addEventListener?.("eip6963:announceProvider", rememberAnnouncedProvider));
  requestProviderAnnouncements();
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const text = (selector, value) =>
    $$(selector).forEach((node) => {
      node.textContent = value == null || value === "" ? "—" : String(value);
    });
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const safeExternalUrl = (value) => {
    const candidate = String(value || "").trim();
    if (!/^https?:\/\//i.test(candidate)) return "";
    try {
      const Url = window.URL;
      if (typeof Url !== "function") return candidate;
      const url = new Url(candidate);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };
  const priceImpactLabel = (value) => {
    const impact = Number(value);
    if (!Number.isFinite(impact) || impact < 0) return "暂不可用";
    if (impact > 0 && impact < 0.0001) return "<0.0001%";
    return `${impact < 1 ? impact.toFixed(4) : impact.toFixed(2)}%`;
  };
  const validTxHash = (value) => (/^0x[0-9a-fA-F]{64}$/.test(String(value || "")) ? String(value) : "");
  const assetImage = (token) => {
    const remote = token?.logo_url || token?.image_url || token?.logo;
    return typeof remote === "string" && /^https:\/\//i.test(remote) ? remote : "./assets/tokens/generic.svg";
  };
  const short = (value) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const decimal = (value, digits = 18) => {
    const raw = String(value ?? "").trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return "—";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed === 0) return raw === "0" ? "0" : "—";
    if (Math.abs(parsed) < 0.000001) return raw.replace(/(\.\d*?[1-9])0+$/, "$1");
    return parsed.toLocaleString("en-US", { maximumFractionDigits: digits });
  };
  const exactDecimalDifference = (left, right) => {
    const parse = (value) => {
      const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
      return match ? { whole: match[1], fraction: match[2] || "" } : null;
    };
    const minuend = parse(left);
    const subtrahend = parse(right);
    if (!minuend || !subtrahend) return "";
    const scale = Math.max(minuend.fraction.length, subtrahend.fraction.length);
    const units = (value) => BigInt(`${value.whole}${value.fraction.padEnd(scale, "0")}`);
    const difference = units(minuend) - units(subtrahend);
    if (difference < 0n) return "";
    if (scale === 0) return difference.toString();
    const padded = difference.toString().padStart(scale + 1, "0");
    const whole = padded.slice(0, -scale);
    const fraction = padded.slice(-scale).replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole;
  };
  const formatExactDecimal = (value) => {
    const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) return "—";
    const whole = (match[1].replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fraction = (match[2] || "").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole;
  };
  const hasNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const usd = (value, compact = true) => {
    if (!hasNumber(value)) return "—";
    const parsed = Number(value);
    const absolute = Math.abs(parsed);
    if (absolute === 0) return "$0";
    if (!compact && displayPrecision() !== null) return `$${displayPrice(value, String(value))}`;
    if (compact && absolute >= 1000)
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(parsed);
    if (absolute < 0.000001) return `$${String(value).replace(/(\.\d*?[1-9])0+$/, "$1")}`;
    return parsed.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: absolute >= 1 ? 2 : 0,
      maximumFractionDigits: absolute >= 1 ? 2 : 8,
    });
  };
  const usdOrQuote = (usdValue, quoteValue, quote, compact = true) => (hasNumber(usdValue) ? usd(usdValue, compact) : `${decimal(quoteValue)} ${quote}`);
  const taxSummary = (token) => (token?.tax_enabled ? uiMarkup`税 买${number(token.buy_tax_percent).toFixed(2).replace(/\.00$/, "")}% / 卖${number(token.sell_tax_percent).toFixed(2).replace(/\.00$/, "")}%` : uiCopy("无税", "No transfer tax"));
  const activitySummary = (token) => (hasNumber(token?.buy_ratio_24h_percent) ? uiMarkup`买入 ${number(token.buy_ratio_24h_percent).toFixed(0)}%` : uiMarkup`${Number(token?.trade_count_24h || 0).toLocaleString("en-US")} 笔`);
  const baseUnits = (value, digits = 6) => {
    try {
      const raw = String(value || "");
      return /^\d+$/.test(raw) ? formatUnits(BigInt(raw), 18, digits) : "—";
    } catch {
      return "—";
    }
  };
  const formatDate = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(pumpLocale() === 'zh' ? 'zh-CN' : 'en-US', {timeZone: displayTimeZone()}) : "—";
  };
  const chartLocalization = () => ({
    locale: pumpLocale() === 'zh' ? 'zh-CN' : 'en-US',
    timeFormatter: timestamp => formatDate(typeof timestamp === 'number' ? timestamp * 1000 : `${timestamp.year}-${String(timestamp.month).padStart(2,'0')}-${String(timestamp.day).padStart(2,'0')}T00:00:00Z`),
    priceFormatter: value => displayPrice(value, Number(value).toLocaleString('en-US', {maximumSignificantDigits:8})),
  });
  const chartTick = (timestamp, type) => {
    const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : `${timestamp.year}-${String(timestamp.month).padStart(2,'0')}-${String(timestamp.day).padStart(2,'0')}T00:00:00Z`);
    const fields = type === 0 ? {year:'numeric'} : type === 1 ? {month:'short'} : type === 2 ? {month:'short',day:'numeric'} : {hour:'2-digit',minute:'2-digit',hour12:false};
    return date.toLocaleString(pumpLocale() === 'zh' ? 'zh-CN' : 'en-US', {...fields,timeZone:displayTimeZone()});
  };
  const age = (value) => {
    if (!value) return "—";
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
    return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
  };
  const friendlyError = (error, fallback = "操作失败，请稍后重试") => {
    const message = String(error?.message || error || "").trim();
    const status = Number(error?.status || 0);
    const code = Number(error?.code ?? error?.data?.originalError?.code);
    if (error?.code === "SESSION_EXPIRED" || status === 401 || /登录已过期|SIWE session|unauthorized/i.test(message)) return "登录已过期，请重新连接钱包";
    if (code === 4001 || /user rejected|user denied|provider rejected/i.test(message)) return "已取消钱包操作";
    if (code === -32002 || /already pending|request.*pending/i.test(message)) return "钱包中已有待处理请求，请先在钱包中处理";
    if (/insufficient funds|exceeds balance|余额不足/i.test(message)) return /[\u3400-\u9fff]/.test(message) ? message : `${selectedNetwork().native} 余额不足，请补充发射费和 Gas 后重试`;
    if (/Address must end with 8888|CREATE2 failed|Factory token bytecode mismatch|发币参数与链上工厂不一致/i.test(message)) return "发币参数与链上 Factory 不一致，请重新加载发币参数";
    if (/Below min threshold/i.test(message)) return "迁移阈值低于链上最低要求，请重新加载发币参数";
    if (/migration_threshold_quote/i.test(message)) return "自定义迁移目标超出当前 Factory 允许范围，请按提示调整后重试";
    if (/position limit exceeded/i.test(message)) return "开仓失败：保证金 × 杠杆超过当前市场的单仓名义价值上限，请降低保证金或杠杆";
    if (/close the existing opposite-direction position|opposite-direction position/i.test(message)) return "同一市场已有反方向仓位，当前不能同时持有多仓和空仓；请先平掉现有仓位，再开另一方向";
    if (/open interest limit exceeded/i.test(message)) return "开仓失败：市场总未平仓量已达到上限，请减小仓位或等待其他仓位关闭";
    if (/directional exposure limit exceeded/i.test(message)) return "开仓失败：当前方向的多空敞口已达到上限，请减小仓位或选择另一方向";
    if (/utilization limit exceeded/i.test(message)) return "开仓失败：资金池可用流动性不足，请减小仓位";
    if (/PancakeSwap.*流动性不足/i.test(message)) {
      const reported = message.match(/最低(?:需要|要求)\s*([\d,.]+)\s*USD/i)?.[1];
      const minimum = reported || String(state.perpConfig?.minimumSpotLiquidityUsd || "").trim();
      return minimum
        ? `该代币在已支持的 PancakeSwap 池中流动性不足；最低需要 ${minimum} USD`
        : "该代币在已支持的 PancakeSwap 池中流动性不足";
    }
    if (/perpetual market is in reduce-only mode/i.test(message)) return "市场已限制新增风险，当前仅允许符合条件的平仓或结算；请查看市场状态";
    if (/Perpetual market data temporarily unavailable/i.test(message)) return "市场行情暂时无法更新，本次未准备交易；请稍后重试，旧快照不会用于签名";
    if (/perpetual quote expired during preparation/i.test(message)) return "准备交易耗时过长，报价已过期；请重新确认，本次没有发送交易";
    if (/perpetual market is disabled/i.test(message)) return "该永续市场当前已暂停开仓";
    if (/invalid leverage/i.test(message)) return "杠杆倍数超出该市场允许范围，请重新选择";
    if (/liquidity is locked while positions are open/i.test(message)) return "市场仍有未平仓仓位，当前不能注入或提取流动性";
    if (/insufficient Quote Token balance/i.test(message)) return "报价币余额不足，当前未收取对手池服务费；请补足报价币后重试";
    if (/pool request does not match the selected perpetual market/i.test(message)) return "对手池参数与所选永续市场不一致，当前未收取服务费；请重新选择市场";
    if (/perpetual keeper is (?:unavailable|warming up)/i.test(message)) return "后台正在准备永续服务，请稍等片刻后再试；本次交易尚未发送";
    if (/no platform fees are claimable/i.test(message)) return "当前没有可领取的平台手续费";
    if (status === 413 || /payload too large|request entity too large/i.test(message)) return "文件过大，请压缩后重试";
    if (status === 429 || /rate limit|too many requests/i.test(message)) return "操作过于频繁，请稍后重试";
    if (error?.name === "AbortError" || /timeout|timed out/i.test(message)) return "请求超时，请检查网络后重试";
    if (/failed to fetch|networkerror|network error|load failed|connection (?:reset|closed|lost)|stream disconnected/i.test(message)) return "网络连接中断，请检查网络后重试";
    if (status >= 500 || /bad gateway|service unavailable|temporarily unavailable/i.test(message)) return "服务暂时不可用，请稍后重试";
    if (/invalid (?:api )?response|unexpected token.*html|json/i.test(message)) return "服务返回异常，请稍后重试";
    return /[\u3400-\u9fff]/.test(message) ? message : fallback;
  };
  const api = async (path, init) => {
    const chainScoped = (path.startsWith("v1/pump/") && !path.startsWith("v1/pump/announcements"))
      || /^v1\/token\/(?:launch-options|launch-fee|status|my-tokens|prepare-launch|launch)(?:[?]|$)/.test(path);
    let scopedPath = path;
    if (chainScoped && !/[?&]chain_id=/.test(path)) {
      scopedPath += `${path.includes("?") ? "&" : "?"}chain_id=${encodeURIComponent(state.selectedChain)}`;
    }
    const requestToken = sessionStorage.getItem(SESSION_KEY);
    const publicRead = !init?.method && /^(?:v1\/pump\/(?:tokens|detail|details|trades|market(?:-activity)?|candles|migration-proof|holders|economics\/config|name-check|announcements|perpetual\/(?:config|markets)))(?:[?]|$)/.test(path);
    const response = await fetch(`/api/pump/${scopedPath}`, {
      ...init,
      cache: publicRead ? "default" : "no-store",
      headers: {
        accept: "application/json",
        ...(requestToken ? { authorization: `Bearer ${requestToken}` } : {}),
        ...(init?.headers || {}),
      },
    });
    let payload;
    if (typeof response.text === "function") {
      const raw = await response.text();
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {
          error: response.ok ? "Invalid API response" : `Pump API request failed (${response.status})`,
        };
      }
    } else {
      try {
        payload = await response.json();
      } catch {
        payload = { error: "Invalid API response" };
      }
    }
    if (response.status === 401) {
      const rejectedCurrentSession = Boolean(requestToken && requestToken === sessionStorage.getItem(SESSION_KEY));
      if (rejectedCurrentSession) resetProviderState("登录已过期，请重新连接钱包");
      const error = new Error(rejectedCurrentSession ? "登录已过期，请重新连接钱包" : "请先连接并验证钱包");
      error.code = rejectedCurrentSession ? "SESSION_EXPIRED" : "AUTH_REQUIRED";
      throw error;
    }
    if (!response.ok || payload.data === undefined) {
      const error = new Error(payload.error || payload.message || `Pump API request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload.data;
  };
  const toast = (message, duration = 2200) => {
    const node = $(".toast");
    if (!node) return;
    node.textContent = window.bitbtUiLocale?.message(message, pumpLocale()) ?? message;
    node.classList.add("show");
    window.clearTimeout(node._hideTimer);
    node._hideTimer = window.setTimeout(() => node.classList.remove("show"), duration);
  };
  let operationDialogCopy = null;
  const showOperationDialog = (message, { title = "请调整参数后重试", tag = "操作未完成", success = false } = {}) => {
    const overlay = $("[data-operation-error]");
    const content = $("[data-operation-error-message]");
    const dismiss = $("[data-operation-error-dismiss]");
    const titleNode = $("[data-operation-dialog-title]");
    const tagNode = $("[data-operation-dialog-tag]");
    if (!overlay || !content || !dismiss) return toast(message, 6000);
    operationDialogCopy = {message, title, tag, success};
    content.textContent = window.bitbtUiLocale?.message(message, pumpLocale()) ?? message;
    if (titleNode) titleNode.textContent = window.bitbtUiLocale?.message(title, pumpLocale()) ?? title;
    if (tagNode) {
      tagNode.textContent = window.bitbtUiLocale?.message(tag, pumpLocale()) ?? tag;
      tagNode.classList.toggle("lime", success);
    }
    overlay.hidden = false;
    if (!overlay.dataset.bound) {
      overlay.dataset.bound = "1";
      const close = () => { overlay.hidden = true; };
      dismiss.addEventListener("click", close);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
      });
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !overlay.hidden) close();
      });
    }
    dismiss.focus();
  };
  const showErrorDialog = (message) => showOperationDialog(message);
  const toastError = (error, fallback) => {
    const message = friendlyError(error, fallback);
    toast(message, 6000);
    const deferredPerpetual = /后台正在准备|永续运维服务|本次.*(?:尚未|未)发送|尚未发送永续/.test(message);
    showOperationDialog(message, deferredPerpetual
      ? { title: "后台正在处理，请稍等后再试", tag: "交易尚未发送" }
      : undefined);
  };
  window.addEventListener("bitbt:toast", (event) => toast(event.detail));
  const setLaunchAvailability = (enabled) =>
    $$('[data-open="create-mode"], [data-nav="create-mode"], [data-launch-mode], .launch-now').forEach((node) => {
      node.classList.add("wallet-gated");
      node.disabled = !enabled;
      node.setAttribute("aria-disabled", String(!enabled));
      node.title = enabled ? "开始发币" : "请先连接并验证钱包";
    });
  const tokenAddress = (token) => token?.contract_address || "";
  const routeWindow = (() => {
    try {
      const parentPath = String(window.parent?.location?.pathname || "");
      return window.parent && window.parent !== window && window.parent.location?.origin === window.location.origin && /^\/pump(?:\/|$)/.test(parentPath) ? window.parent : window;
    } catch {
      return window;
    }
  })();
  const routeLocation = () => routeWindow.location || location;
  const routeHistory = () => routeWindow.history || history;
  const screenAliases = { 'revenue-center': 'income-center', 'developer-center': 'developer-tools', 'growth': 'invite-center', 'alerts': 'alert-center' };
  const resolveScreenName = (name) => root.querySelector(`[data-panel="${CSS.escape(name)}"]`) ? name : screenAliases[name] || name;
  const routeScreen = () => {
    try {
      const screen = new URLSearchParams(routeLocation()?.search || "").get("screen") || "";
      return root.querySelector(`[data-panel="${CSS.escape(resolveScreenName(screen))}"]`) ? screen : "";
    } catch {
      return "";
    }
  };
  const pumpLocale = () => {
    try {
      const saved = window.localStorage?.getItem(LOCALE_KEY);
      if (saved === "en" || saved === "zh") return saved;
    } catch {}
    return /^zh(?:-|$)/i.test(String(navigator?.language || "")) ? "zh" : "en";
  };
  // Translate only application-owned copy at its render site. Never rewrite
  // names, addresses, quotes or arbitrary backend errors by scanning live DOM.
  const uiCopy = (zh, en) => pumpLocale() === 'zh' ? zh : en;
  const literalCopy = value => window.bitbtUiLocale?.literal(String(value ?? ''), pumpLocale()) ?? String(value ?? '');
  const uiMarkup = (strings, ...values) => strings.reduce((result, literal, index) => result + (window.bitbtUiLocale?.literal(literal, pumpLocale()) ?? literal) + (index < values.length ? String(values[index]) : ''), '');
  const readAnnouncementIds = () => {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(ANNOUNCEMENT_READ_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
    } catch {
      return new Set();
    }
  };
  const saveReadAnnouncementIds = (ids) => {
    try {
      window.localStorage?.setItem(ANNOUNCEMENT_READ_KEY, JSON.stringify([...ids]));
    } catch {}
  };
  const announcementCopy = (announcement) => {
    const zh = pumpLocale() === "zh";
    return {
      title: zh ? announcement.title : announcement.title_en || announcement.title,
      content: zh ? announcement.content_zh || announcement.content : announcement.content_en || announcement.content,
    };
  };
  const announcementCategory = (category) => {
    const labels = {
      product: pumpLocale() === "zh" ? "产品更新" : "Product",
      campaign: pumpLocale() === "zh" ? "活动" : "Campaign",
      security: pumpLocale() === "zh" ? "安全" : "Security",
      status: pumpLocale() === "zh" ? "系统状态" : "Status",
    };
    return labels[category] || (pumpLocale() === "zh" ? "公告" : "Notice");
  };
  const renderAnnouncements = () => {
    const list = $("[data-panel='announcements'] .announcement-list");
    if (!list) return;
    const readIds = readAnnouncementIds();
    text("[data-announcement-unread]", String(state.announcements.filter((item) => !readIds.has(item.id)).length));
    const filtered = state.announcements.filter((item) => state.announcementFilter === "all" || item.category === state.announcementFilter);
    text('[data-announcement-count]', pumpLocale() === 'zh' ? uiMarkup`${filtered.length} 条 · ${filtered.filter(item => !readIds.has(item.id)).length} 条未读` : `${filtered.length} notices · ${filtered.filter(item => !readIds.has(item.id)).length} unread`);
    const detailHost = $('[data-live-announcement-detail]');
    const selected = filtered.find((item) => item.id === state.selectedAnnouncementId) || filtered.find(item => item.pinned) || filtered[0];
    if (detailHost) {
      detailHost.hidden = !selected;
      detailHost.replaceChildren();
      if (selected) {
        const copy = announcementCopy(selected);
        const network = ({bsc:'BNB Chain', bnb:'BNB Chain', robinhood:'Robinhood Chain'})[selected.chain_id] || (pumpLocale() === 'zh' ? '公告未指定' : 'Not specified in notice');
        detailHost.innerHTML = `<span class="tag lime">${escapeHtml(selected.pinned ? (pumpLocale() === 'zh' ? '置顶公告' : 'Pinned notice') : announcementCategory(selected.category))}</span><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.content).replace(/\n/g, '<br>')}</p><div class="review-row"><span>${pumpLocale() === 'zh' ? (selected.effective_at ? '生效时间' : '发布时间') : (selected.effective_at ? 'Effective' : 'Published')}</span><strong>${escapeHtml(formatDate(selected.effective_at || selected.published_at))}</strong></div><div class="review-row"><span>${pumpLocale() === 'zh' ? '适用网络' : 'Network'}</span><strong>${escapeHtml(network)}</strong></div><button class="primary" type="button" data-open="create-mode">${pumpLocale() === 'zh' ? uiCopy("创建代币", "Create Token") : 'Create token'}</button>`;
      }
    }
    if (!filtered.length) {
      list.innerHTML = `<p class="footer-note">${pumpLocale() === "zh" ? "当前分类暂无官方公告。" : "No official notices in this category."}</p>`;
      return;
    }
    const cards = filtered.map((announcement) => {
      const copy = announcementCopy(announcement);
      const unread = !readIds.has(announcement.id);
      return `<button class="announcement-card${unread ? " unread" : ""}" type="button" data-announcement-id="${escapeHtml(announcement.id)}"><span class="announcement-icon"><i class="ico" style="--icon:url('./assets/icons/lucide/${announcement.category === "security" ? "shield-check" : "bell"}.svg')"></i></span><span><h3>${announcement.pinned ? `${pumpLocale() === "zh" ? "置顶 · " : "Pinned · "}` : ""}${escapeHtml(copy.title)}</h3><p>${escapeHtml(copy.content).slice(0, 180)}${copy.content.length > 180 ? "…" : ""}</p></span><time>${escapeHtml(formatDate(announcement.published_at))}</time></button>`;
    }).join("");
    list.innerHTML = cards;
    list.querySelectorAll("[data-announcement-id]").forEach((node) => node.addEventListener("click", () => {
      const id = node.dataset.announcementId;
      const nextRead = readAnnouncementIds();
      nextRead.add(id);
      saveReadAnnouncementIds(nextRead);
      state.selectedAnnouncementId = id;
      renderAnnouncements();
      detailHost?.scrollIntoView?.({block:'start', behavior:'auto'});
    }));
  };
  const loadAnnouncements = async () => {
    state.announcements = await api("v1/pump/announcements");
    renderAnnouncements();
  };
  const parsePerpMarketId = (value) => {
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  const isNonZeroPerpTokenAddress = (value) => {
    const address = String(value || "").toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(address) && !/^0x0{40}$/.test(address);
  };
  const selectedPerpMarket = () => {
    if (state.selectedPerpMarketId != null) {
      const selectedId = parsePerpMarketId(state.selectedPerpMarketId);
      if (selectedId == null) return null;
      const selected = state.perpMarkets.find((market) => parsePerpMarketId(market.marketId) === selectedId);
      return selected || null;
    }
    const rawSelectedId = String($("#perp-market")?.value ?? "").trim();
    const selectedId = parsePerpMarketId(rawSelectedId);
    if (selectedId == null) return null;
    return state.perpMarkets.find((market) => parsePerpMarketId(market.marketId) === selectedId) || null;
  };
  const perpetualPairLabel = (market) => {
    const displayName = String(market?.displayName || "").trim();
    if (displayName) return displayName;
    const marketId = parsePerpMarketId(market?.marketId);
    return marketId == null ? "—" : `Market #${marketId}`;
  };
  const perpetualBaseLogo = (market) => market?.tokenLogoUrl || null;
  const perpetualQuoteLogo = (market) => market?.quoteTokenLogoUrl || null;
  const perpetualLogoLetter = (symbol) => String(symbol || '?').trim().charAt(0).toUpperCase() || '?';
  const perpetualLogoMarkup = (url, symbol, extraClass = '') => url
    ? `<img class="${extraClass}" src="${escapeHtml(url)}" alt="${escapeHtml(symbol || '')}">`
    : symbol ? `<span class="perps-letter-logo ${extraClass}" aria-label="${escapeHtml(symbol)}">${escapeHtml(perpetualLogoLetter(symbol))}</span>` : '';
  const setPerpetualLogo = (image, url, symbol) => {
    if (!image) return;
    image.hidden = !url;
    if (url) { image.src = url; image.alt = symbol || ''; }
    let letter = image.nextElementSibling;
    if (!letter?.classList.contains('perps-letter-logo')) {
      letter = document.createElement('span');
      letter.className = 'perps-letter-logo';
      if ('perpsQuoteImage' in image.dataset || 'perpsOrderQuoteImage' in image.dataset) letter.classList.add('perps-quote-logo');
      image.after(letter);
    }
    letter.hidden = Boolean(url) || !symbol;
    letter.textContent = perpetualLogoLetter(symbol);
    letter.setAttribute('aria-label', symbol || '');
  };
  const selectInitialPerpMarket = (markets) => {
    if (state.selectedPerpMarketId != null) return;
    const initial = markets.find((market) => parsePerpMarketId(market?.marketId) != null);
    if (initial) state.selectedPerpMarketId = parsePerpMarketId(initial.marketId);
  };
  const perpMarketActivity = (market = selectedPerpMarket()) => state.perpIndexedPositions
    .filter((item) => market && Number(item.marketId) === Number(market.marketId));
  const formatPerpPrice = (value) => {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return "—";
    if (displayPrecision() !== null) return `$${displayPrice(value, String(value))}`;
    if (price >= 1) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
    return `$${price.toLocaleString("en-US", { minimumSignificantDigits: 2, maximumSignificantDigits: 8 })}`;
  };
  const klineLine = (candles, period, valueAt) => candles.map((candle, index) => {
    if (index + 1 < period) return null;
    let total = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) total += valueAt(candles[offset]);
    return { time: candle.time, value: total / period };
  }).filter(Boolean);
  const klineEma = (candles, period, valueAt = (candle) => candle.close) => {
    const alpha = 2 / (period + 1);
    let previous = null;
    return candles.map((candle) => {
      const value = valueAt(candle);
      previous = previous == null ? value : value * alpha + previous * (1 - alpha);
      return { time: candle.time, value: previous };
    });
  };
  const klineBoll = (candles, period = 20, multiple = 2) => {
    const middle = klineLine(candles, period, (candle) => candle.close);
    const byTime = new Map(middle.map((point) => [point.time, point.value]));
    const upper = [], lower = [];
    candles.forEach((candle, index) => {
      if (index + 1 < period) return;
      const mean = byTime.get(candle.time);
      let variance = 0;
      for (let offset = index - period + 1; offset <= index; offset += 1) variance += (candles[offset].close - mean) ** 2;
      const deviation = Math.sqrt(variance / period);
      upper.push({ time: candle.time, value: mean + multiple * deviation });
      lower.push({ time: candle.time, value: mean - multiple * deviation });
    });
    return { middle, upper, lower };
  };
  const klineAtr = (candles, period = 14) => {
    const values = candles.map((candle, index) => index === 0
      ? candle.high - candle.low
      : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close)));
    return klineEma(candles.map((candle, index) => ({ ...candle, atr: values[index] })), period, (candle) => candle.atr);
  };
  const klineSuperTrend = (candles, period = 14, multiple = 3) => {
    const atr = new Map(klineAtr(candles, period).map((point) => [point.time, point.value]));
    let upper = 0, lower = 0, trend = 1;
    return candles.map((candle, index) => {
      const volatility = atr.get(candle.time);
      if (!volatility || index === 0) return null;
      const middle = (candle.high + candle.low) / 2;
      const basicUpper = middle + multiple * volatility;
      const basicLower = middle - multiple * volatility;
      upper = basicUpper < upper || candles[index - 1].close > upper ? basicUpper : upper;
      lower = basicLower > lower || candles[index - 1].close < lower ? basicLower : lower;
      if (trend < 0 && candle.close > upper) trend = 1;
      else if (trend > 0 && candle.close < lower) trend = -1;
      return { time: candle.time, value: trend > 0 ? lower : upper };
    }).filter(Boolean);
  };
  const klineMacd = (candles) => {
    const fast = klineEma(candles, 12), slow = klineEma(candles, 26);
    const dif = fast.map((point, index) => ({ time: point.time, value: point.value - slow[index].value }));
    const signal = klineEma(dif.map((point) => ({ time: point.time, close: point.value })), 9);
    const histogram = dif.map((point, index) => ({ time: point.time, value: (point.value - signal[index].value) * 2, color: point.value >= signal[index].value ? "rgba(50,207,124,.65)" : "rgba(255,92,115,.65)" }));
    return { dif, signal, histogram };
  };
  const klineRsi = (candles, period = 14) => {
    let gain = 0, loss = 0;
    return candles.map((candle, index) => {
      if (index === 0) return null;
      const change = candle.close - candles[index - 1].close;
      const up = Math.max(change, 0), down = Math.max(-change, 0);
      if (index <= period) {
        gain += up; loss += down;
        if (index < period) return null;
        gain /= period; loss /= period;
      } else {
        gain = (gain * (period - 1) + up) / period;
        loss = (loss * (period - 1) + down) / period;
      }
      return { time: candle.time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) };
    }).filter(Boolean);
  };
  const klineKdj = (candles, period = 9) => {
    let k = 50, d = 50;
    const result = { k: [], d: [], j: [] };
    candles.forEach((candle, index) => {
      if (index + 1 < period) return;
      const window = candles.slice(index - period + 1, index + 1);
      const high = Math.max(...window.map((item) => item.high));
      const low = Math.min(...window.map((item) => item.low));
      const rsv = high === low ? 50 : (candle.close - low) / (high - low) * 100;
      k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3;
      result.k.push({ time: candle.time, value: k });
      result.d.push({ time: candle.time, value: d });
      result.j.push({ time: candle.time, value: 3 * k - 2 * d });
    });
    return result;
  };
  const lastKlineValue = (series) => series.length ? series[series.length - 1].value : null;
  const renderPerpetualChart = () => {
    const host = $("#perps-kline");
    const wrap = host?.parentElement;
    const fallback = wrap?.querySelector(".chart-fallback");
    if (!host) return;
    const candles = state.perpCandles
      .map((candle) => ({
        time: Number(candle.open_time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume_quote || 0),
      }))
      .filter((candle) => Number.isFinite(candle.time) && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0);
    if (!window.LightweightCharts || !candles.length) {
      const entry = charts.get("#perps-kline");
      entry?.chart.remove?.();
      charts.delete("#perps-kline");
      host.replaceChildren();
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = selectedPerpMarket()
          ? uiCopy("本站暂未索引到可绘制 K 线的现货成交。", "No indexed spot trades are available for this chart yet.")
          : uiCopy("选择已开放市场后显示真实成交 K 线。", "Select an open market to view real trade candles.");
      }
      return;
    }
    if (fallback) fallback.hidden = true;
    const selected = new Set(state.perpChartIndicators);
    const smallestPrice = Math.min(...candles.map((candle) => candle.low));
    const pricePrecision = smallestPrice >= 1 ? 4 : Math.min(14, Math.max(6, Math.ceil(-Math.log10(smallestPrice)) + 4));
    const chartPriceFormat = { type: 'price', precision: pricePrecision, minMove: 10 ** -pricePrecision };
    const subIndicators = ["VOL", "MACD", "KDJ", "RSI"].filter((name) => selected.has(name));
    const chartHeight = Math.min(520, 320 + Math.max(0, subIndicators.length - 1) * 82);
    wrap?.classList.toggle("has-sub-indicator", subIndicators.length > 1);
    if (wrap) wrap.style.height = chartHeight + "px";
    let entry = charts.get("#perps-kline");
    let created = false;
    if (!entry || entry.host !== host) {
      entry?.chart.remove?.();
      host.replaceChildren();
      const chart = window.LightweightCharts.createChart(host, {
        localization: chartLocalization(),
        width: host.clientWidth || 720,
        height: chartHeight,
        layout: { background: { type: "solid", color: "#0a0b0c" }, textColor: "#777c78" },
        grid: { vertLines: { color: "#1d2021" }, horzLines: { color: "#1d2021" } },
        rightPriceScale: { borderColor: "#303334", scaleMargins: { top: 0.08, bottom: 0.25 } },
        timeScale: { borderColor: "#303334", timeVisible: true, secondsVisible: false, tickMarkFormatter: chartTick },
      });
      const series = chart.addCandlestickSeries({
        upColor: "#32cf7c", downColor: "#ff5c73", borderUpColor: "#32cf7c",
        borderDownColor: "#ff5c73", wickUpColor: "#32cf7c", wickDownColor: "#ff5c73", priceFormat: chartPriceFormat,
      });
      const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
      entry = { host, chart, series, volumeSeries, indicatorSeries: [], renderKey: "" };
      charts.set("#perps-kline", entry);
      created = true;
    }
    const newest = candles[candles.length - 1];
    const dataKey = [state.selectedPerpMarketId, state.perpChartInterval, state.perpChartIndicators.join(','), candles.length, newest.time, newest.open, newest.high, newest.low, newest.close, newest.volume].join(':');
    if (!created && entry.dataKey === dataKey) {
      entry.chart.applyOptions?.({ width: host.clientWidth || 720, height: chartHeight });
      return;
    }
    entry.dataKey = dataKey;
    entry.indicatorSeries.forEach((series) => { try { entry.chart.removeSeries(series); } catch {} });
    entry.indicatorSeries = [];
    const addLine = (data, color, priceScaleId = "right") => {
      const series = entry.chart.addLineSeries({ color, lineWidth: 1, priceScaleId, priceFormat: priceScaleId === 'right' ? chartPriceFormat : { type: 'price', precision: 6, minMove: 0.000001 }, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      series.setData(data);
      entry.indicatorSeries.push(series);
    };
    const legend = [];
    const addLegend = (name, data, css = "") => {
      const value = lastKlineValue(data);
      if (Number.isFinite(value)) legend.push('<b class="' + css + '">' + name + " " + escapeHtml(formatPerpPrice(value)) + "</b>");
    };
    entry.series.applyOptions({ priceFormat: chartPriceFormat });
    entry.series.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    if (selected.has("VOL")) {
      entry.volumeSeries.setData(candles.map((candle) => ({
        time: candle.time, value: Number.isFinite(candle.volume) ? candle.volume : 0,
        color: candle.close >= candle.open ? "rgba(50,207,124,.45)" : "rgba(255,92,115,.45)",
      })));
    } else entry.volumeSeries.setData([]);
    if (selected.has("MA")) {
      [[5, "#e5f453", "lime"], [10, "#47c7ff", "cyan"], [20, "#b58cff", "violet"]].forEach(([period, color, css]) => {
        const data = klineLine(candles, period, (candle) => candle.close); addLine(data, color); addLegend("MA" + period, data, css);
      });
    }
    if (selected.has("EMA")) {
      [[12, "#47c7ff", "cyan"], [26, "#ffad5c", "orange"]].forEach(([period, color, css]) => {
        const data = klineEma(candles, period); addLine(data, color); addLegend("EMA" + period, data, css);
      });
    }
    if (selected.has("BOLL")) {
      const boll = klineBoll(candles);
      addLine(boll.middle, "#e5f453"); addLine(boll.upper, "#47c7ff"); addLine(boll.lower, "#b58cff");
      addLegend("BOLL", boll.middle, "lime"); addLegend("UP", boll.upper, "cyan"); addLegend("LOW", boll.lower, "violet");
    }
    if (selected.has("ST")) {
      const trend = klineSuperTrend(candles); addLine(trend, "#ffad5c"); addLegend("ST(14,3)", trend, "orange");
    }
    const lowerHeight = subIndicators.length ? Math.min(0.18, 0.58 / subIndicators.length) : 0;
    let lowerBottom = 0.04;
    [...subIndicators].reverse().forEach((name) => {
      const scaleId = name === "VOL" ? "volume" : name.toLowerCase();
      entry.chart.priceScale(scaleId).applyOptions({ visible: true, borderColor: "#303334", scaleMargins: { top: 1 - lowerBottom - lowerHeight, bottom: lowerBottom } });
      lowerBottom += lowerHeight;
    });
    if (!selected.has("VOL")) entry.chart.priceScale("volume").applyOptions({ visible: false, scaleMargins: { top: 1, bottom: 0 } });
    if (selected.has("MACD")) {
      const macd = klineMacd(candles);
      const histogram = entry.chart.addHistogramSeries({ priceScaleId: "macd", lastValueVisible: false, priceLineVisible: false });
      histogram.setData(macd.histogram); entry.indicatorSeries.push(histogram);
      addLine(macd.dif, "#47c7ff", "macd"); addLine(macd.signal, "#ffad5c", "macd");
      addLegend("DIF", macd.dif, "cyan"); addLegend("DEA", macd.signal, "orange");
    }
    if (selected.has("KDJ")) {
      const kdj = klineKdj(candles);
      addLine(kdj.k, "#e5f453", "kdj"); addLine(kdj.d, "#47c7ff", "kdj"); addLine(kdj.j, "#b58cff", "kdj");
      addLegend("K", kdj.k, "lime"); addLegend("D", kdj.d, "cyan"); addLegend("J", kdj.j, "violet");
    }
    if (selected.has("RSI")) {
      const rsi = klineRsi(candles); addLine(rsi, "#b58cff", "rsi"); addLegend("RSI14", rsi, "violet");
    }
    entry.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: Math.min(0.7, lowerBottom + 0.02) } });
    const last = candles[candles.length - 1];
    const legendHost = $('[data-perps-chart-legend]');
    if (legendHost) legendHost.innerHTML = "<b>O " + escapeHtml(formatPerpPrice(last.open)) + "</b><b>H " + escapeHtml(formatPerpPrice(last.high)) + "</b><b>L " + escapeHtml(formatPerpPrice(last.low)) + "</b><b>C " + escapeHtml(formatPerpPrice(last.close)) + "</b>" + legend.join("");
    entry.chart.applyOptions?.({ width: host.clientWidth || 720, height: chartHeight });
    const renderKey = state.selectedPerpMarketId + ":" + state.perpChartInterval;
    if (created || entry.renderKey !== renderKey) entry.chart.timeScale().fitContent();
    entry.renderKey = renderKey;
  };
  const perpReadVersions = new Map();
  const beginPerpRead = (key, bindMarket = true) => {
    const version = (perpReadVersions.get(key) || 0) + 1;
    perpReadVersions.set(key, version);
    const account = state.account, chain = state.selectedChain, provider = selectedProvider();
    const session = walletSessionEpoch;
    const marketId = state.selectedPerpMarketId;
    // Public configuration belongs to a chain, not a wallet session. Restoring
    // SIWE during initial load must not discard the only configuration response.
    return () => perpReadVersions.get(key) === version && state.selectedChain === chain
      && (key === 'config' || (state.account === account && selectedProvider() === provider && walletSessionEpoch === session))
      && (!bindMarket || state.selectedPerpMarketId === marketId);
  };
  const setPerpReadError = (key, message = "") => {
    state.perpReadErrors[key] = message;
    for (const panel of root.querySelectorAll('[data-panel="perps"], [data-panel="perpetual"], [data-panel="perps-onchain"]')) {
      let warning = panel.querySelector('[data-perp-read-error]');
      if (!warning) {
        warning = document.createElement('p');
        warning.className = 'footer-note'; warning.dataset.perpReadError = ''; warning.setAttribute('role', 'alert');
        panel.prepend(warning);
      }
      warning.textContent = Object.values(state.perpReadErrors).filter(Boolean).join('；');
      warning.hidden = !warning.textContent;
    }
  };
  const loadPerpetualCandles = async () => {
    if (perpCandlesRefreshPromise) return perpCandlesRefreshPromise;
    perpCandlesRefreshPromise = loadPerpetualCandlesOnce().finally(() => {
      perpCandlesRefreshPromise = null;
    });
    return perpCandlesRefreshPromise;
  };
  const loadPerpetualCandlesOnce = async () => {
    const current = beginPerpRead('candles');
    const market = selectedPerpMarket();
    const address = String(market?.tokenAddress || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      state.perpCandles = [];
      renderPerpetualChart();
      return;
    }
    const marketId = Number(market.marketId);
    const interval = state.perpChartInterval;
    let candles;
    const intervalName = ({ 60: '1m', 300: '5m', 600: '10m', 900: '15m', 3600: '1h', 7200: '2h', 14400: '4h', 86400: '1d' })[interval];
    try {
      candles = await api(`v1/market/kline?symbol=${encodeURIComponent(market.tokenSymbol || address)}&interval=${intervalName || '5m'}&limit=1000&contract_address=${encodeURIComponent(address)}&chain_id=bsc`);
    }
    catch (error) {
      if (!current() || state.perpChartInterval !== interval) return;
      state.perpCandles = []; renderPerpetual(); setPerpReadError('candles', 'K 线加载失败，请稍后刷新'); throw error;
    }
    if (!current() || Number(selectedPerpMarket()?.marketId) !== marketId || state.perpChartInterval !== interval) return;
    state.perpCandles = Array.isArray(candles)
      ? candles.map((candle) => ({ ...candle, volume_quote: candle.volume_quote ?? candle.volume ?? 0 }))
        .sort((left, right) => Number(left.open_time) - Number(right.open_time))
      : [];
    renderPerpetual();
    setPerpReadError('candles');
  };
  const renderPerpetualMarketCards = () => {
    const marketCardIcon = (url, symbol, className) => url
      ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(symbol || '')}">`
      : `<span class="perps-letter-logo ${className}" aria-label="${escapeHtml(symbol || '')}">${escapeHtml(String(symbol || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
    const config = state.perpConfig;
    const query = state.tokenSearch.trim().toLowerCase();
    const markets = state.perpMarkets.filter(item => !query || `${item.tokenName || ''} ${item.tokenSymbol || ''} ${item.tokenAddress || ''}`.toLowerCase().includes(query));
    const marketGrid = $('[data-market-panel="perps"] .token-grid');
    if (marketGrid) {
      marketGrid.innerHTML = markets.length
        ? markets.map((item) => uiMarkup`<button class="token-card perp-market-card" type="button" data-open="perps" data-perp-market-id="${Number(item.marketId)}"><div class="token-head"><span class="perps-pair-logos">${marketCardIcon(item.tokenLogoUrl, item.tokenSymbol, 'token-logo')}${marketCardIcon(item.quoteTokenLogoUrl, item.quoteTokenSymbol, 'perps-quote-logo')}</span><div class="token-name"><strong>${escapeHtml(perpetualPairLabel(item))}</strong><small>${escapeHtml(state.selectedChain === 'robinhood' ? 'Robinhood' : 'BNB Chain')} · ${escapeHtml(item.quoteTokenSymbol || short(item.quoteTokenAddress || ''))} 本位</small></div><span class="change ${item.enabled ? 'up' : ''}">${item.enabled ? uiCopy("已开放", "Available") : uiCopy("已暂停", "Paused")}</span></div><div class="card-metrics"><div><span>流动性</span><strong>${escapeHtml(formatUnits(BigInt(item.liquidityRaw || '0'), Number(item.quoteDecimals || 18)))}</strong></div><div><span>未平仓量</span><strong>${escapeHtml(formatUnits(BigInt(item.lockedNotionalRaw || '0'), Number(item.quoteDecimals || 18)))}</strong></div><div><span>最高杠杆</span><strong>${Number(item.maxLeverage || config?.maxLeverage || 0)}×</strong></div></div></button>`).join('')
        : `<p class="footer-note">${escapeHtml(query ? '没有匹配的永续市场，请修改名称或地址搜索。' : config?.statusNote || '当前没有已开放的真实永续市场。')}</p>`;
    }
  };
  let perpUnreadySince = 0;
  let perpStatusRefreshInFlight = false;
  const marketLeverageCap = (market) => {
    const cap = Number(market?.maxLeverage);
    return Number.isSafeInteger(cap) && cap >= 1 ? cap : 0;
  };
  const syncMarketLeverageInput = (input, market, submitting) => {
    if (!input) return 0;
    const cap = marketLeverageCap(market);
    input.max = String(cap || 1);
    input.value = String(Math.max(1, Math.min(cap || 1, Number(input.value) || 1)));
    input.disabled = !cap || submitting;
    return cap;
  };
  const renderPerpetualCreationLeverage = (config, addPanel) => {
    const protocolCap = Number(config?.maxLeverage || 0);
    const creationCap = config?.internalPilot ? Math.min(protocolCap || 4, 4) : protocolCap;
    const label = creationCap > 0 ? `${creationCap}×` : '—';
    text('[data-perp-max-leverage]', label);
    const field = addPanel?.querySelector('[data-service-setting="2"]');
    if (field) {
      if (field.tagName === 'SELECT') field.options[0].textContent = label;
      else field.value = label;
    }
  };
  const renderPerpetual = () => {
    const config = state.perpConfig;
    const enabled = Boolean(config?.enabled);
    if (config?.operationsReady) perpUnreadySince = 0;
    else if (enabled && !perpUnreadySince) perpUnreadySince = Date.now();
    const keeperStandby = enabled && config?.operationsState === "standby";
    const keeperSyncing = enabled && (config?.operationsState === "preparing" || (!config?.operationsState && !config?.operationsReady && Date.now() - perpUnreadySince < 60_000));
    text('[data-market-perp-count]', `${state.perpMarkets.length.toLocaleString('en-US')}${uiCopy(' 个', '')}`);
    text("[data-perp-menu-status]", enabled ? (keeperStandby ? uiCopy("按需待命", "Standby") : keeperSyncing ? uiCopy("准备中", "Preparing") : config?.openingsPaused ? uiCopy("只减仓", "Reduce only") : uiCopy("已开放", "Available")) : uiCopy("未开放", "Unavailable"));
    text("[data-perp-status]", state.perpKeeperWaking ? uiCopy("永续运维服务正在启动，系统会自动继续准备；请勿重复点击，本次永续交易尚未发送。", "Perpetual operations are starting. Preparation will continue automatically; do not click again. This perpetual trade has not been sent.") : keeperStandby ? uiCopy("Keeper 按需待命，提交交易后自动准备；已有仓位仍受风控监测。", "Keeper is on standby and prepares on demand; existing positions remain monitored.") : keeperSyncing ? uiCopy("Keeper 正在续期链上心跳，请稍候；尚未发送用户交易。", "Keeper is renewing its on-chain heartbeat. No user transaction has been sent.") : config?.statusNote || uiCopy("正在读取永续合约状态…", "Loading perpetual status…"));
    const keeperHint = $('[data-perps-keeper-hint]');
    if (keeperHint) {
      const hint = state.perpKeeperWaking
        ? uiCopy("运维服务正在启动，系统会自动继续；本次开仓交易尚未发送，请勿重复点击。", "Operations are starting. We will continue automatically; this opening trade has not been sent. Please do not click again.")
        : keeperStandby
          ? uiCopy("运维服务目前待命。点击开仓后可能需要短暂启动，期间不会请求签名或发送交易。", "Operations are on standby. Starting a trade may take a moment; no signature or transaction is sent while waiting.")
          : keeperSyncing
            ? uiCopy("运维服务正在准备；系统会在就绪后继续，暂未发送开仓交易。", "Operations are preparing. We will continue when ready; no opening trade has been sent.")
            : '';
      keeperHint.hidden = !enabled || state.perpModernAction !== 'open_position' || !hint;
      keeperHint.textContent = hint;
    }
    text("[data-perp-fee]", config?.feePercent ? uiMarkup`默认 ${config.feePercent} / ${config.feePercent}` : "—");
    text("[data-perp-min-liquidity]", config ? `${config.minLiquidityUsd} USD` : "—");
    renderPerpetualCreationLeverage(config);
    text("[data-perp-version]", config?.contractVersion ? `V${config.contractVersion}` : "—");
    const select = $("#perp-market");
    if (select) {
      const previous = select.value;
      select.innerHTML = state.perpMarkets.length
        ? state.perpMarkets.map((market) => `<option value="${Number(market.marketId)}">${escapeHtml(perpetualPairLabel(market))} · #${Number(market.marketId)}${market.enabled ? "" : uiCopy(" · 已暂停", " · Paused")}</option>`).join("")
        : uiMarkup`<option value="">当前没有已启用市场</option>`;
      if (state.perpMarkets.some((market) => String(market.marketId) === previous)) select.value = previous;
    }
    const market = selectedPerpMarket();
    if (market?.dataStale) text("[data-perp-status]", "行情暂时更新失败，正在显示最近快照；交易前会重新校验，不会使用旧行情签名。");
    if (ui20260911) {
      renderPerpetualMarketCards();
      const marketSearch = $('#perps-market-search');
      if (marketSearch) {
        marketSearch.disabled = !enabled || !state.perpMarkets.length;
        marketSearch.placeholder = !config ? uiCopy('正在读取真实永续市场…', 'Loading perpetual markets…') : !enabled ? uiCopy('当前网络永续市场未开放', 'Perpetuals are unavailable on this network') : !state.perpMarkets.length ? uiCopy('当前没有已开放的永续市场', 'No active perpetual markets') : uiCopy('搜索 MEME 名称、符号或合约地址', 'Search MEME name, symbol or contract');
      }
      text('[data-perps-leverage-range]', marketLeverageCap(market) ? `1–${marketLeverageCap(market)}×` : '—');
      text('[data-perps-settlement-note]', market ? `${market.quoteTokenSymbol || 'Quote Token'} ${uiCopy('本位', 'settled')} · ${selectedNetwork().name} · ${uiCopy('资金费按链上规则随时间累计', 'Funding accrues under on-chain rules')}` : uiCopy('选择市场后显示结算资产与资金费规则', 'Select a market to view settlement and funding rules'));
      setPerpetualLogo($('[data-perps-image]'), perpetualBaseLogo(market), market?.tokenSymbol);
      setPerpetualLogo($('[data-perps-quote-image]'), perpetualQuoteLogo(market), market?.quoteTokenSymbol);
      setPerpetualLogo($('[data-perps-order-base-image]'), perpetualBaseLogo(market), market?.tokenSymbol);
      setPerpetualLogo($('[data-perps-order-quote-image]'), perpetualQuoteLogo(market), market?.quoteTokenSymbol);
      const pairRow = $('[data-panel="perps"] .perps-pairs');
      if (pairRow) {
        pairRow.innerHTML = state.perpMarkets.map((item) => `<button type="button" class="${market && Number(item.marketId) === Number(market.marketId) ? 'active' : ''}" aria-pressed="${market && Number(item.marketId) === Number(market.marketId)}" data-real-perp-market="${Number(item.marketId)}">${perpetualLogoMarkup(perpetualBaseLogo(item), item.tokenSymbol)}${perpetualLogoMarkup(perpetualQuoteLogo(item), item.quoteTokenSymbol, 'perps-quote-logo')}${escapeHtml(perpetualPairLabel(item))} <span>${item.enabled ? 'LIVE' : '暂停'}</span></button>`).join('');
      }
      const searchResults = $('[data-panel="perps"] .perps-search-results');
      if (searchResults) {
        searchResults.innerHTML = uiMarkup`<div class="perps-search-head"><span>搜索结果</span><span>市场状态</span></div>${state.perpMarkets.map((item) => uiMarkup`<div class="perps-search-item ready" data-real-perp-search data-search="${escapeHtml(`${item.tokenName || ''} ${item.tokenSymbol || ''} ${item.tokenAddress || ''}`.toLowerCase())}"><span class="perps-pair-logos">${perpetualLogoMarkup(perpetualBaseLogo(item), item.tokenSymbol)}${perpetualLogoMarkup(perpetualQuoteLogo(item), item.quoteTokenSymbol, 'perps-quote-logo')}</span><div><strong>${escapeHtml(perpetualPairLabel(item))}</strong><small>${escapeHtml(short(item.tokenAddress || ''))} · BSC · <span class="pool-state">${item.enabled ? uiCopy("可交易", "Tradable") : uiCopy("已暂停", "Paused")}</span></small></div><button type="button" data-real-perp-market="${Number(item.marketId)}">选择交易</button></div>`).join('')}<div class="perps-search-empty" data-perps-search-empty>未找到已接入的真实 MEME 永续市场。</div>`;
      }
      const latestCandle = state.perpCandles.at(-1);
      const latestPrice = Number(latestCandle?.close || 0);
      const previousPrice = Number(state.perpCandles.at(-2)?.close || 0);
      const priceChange = previousPrice > 0 ? ((latestPrice - previousPrice) / previousPrice) * 100 : null;
      const cutoff = Date.now() / 1000 - 86400;
      const volume24h = state.perpCandles.reduce((sum, candle) => Number(candle.open_time) >= cutoff ? sum + Number(candle.volume_quote || 0) : sum, 0);
      const quoteDecimals = Number(market?.quoteDecimals || 18);
      const oraclePrice = market?.oraclePriceE18
        ? Number(formatUnits(BigInt(market.oraclePriceE18), 18))
        : 0;
      text('[data-perps-symbol]', market ? perpetualPairLabel(market) : '—');
      text('[data-perps-quote-unit]', market?.quoteTokenSymbol || '—');
      text('[data-perps-margin-title]', `${market?.quoteTokenSymbol || 'QUOTE'}-M PERPETUAL`);
      text('[data-perps-order-market]', market ? perpetualPairLabel(market) : uiCopy('请选择永续市场', 'Select a perpetual market'));
      text('[data-perps-order-description]', market
        ? uiCopy(`开多或开空 ${market.tokenSymbol || 'MEME'}；使用 ${market.quoteTokenSymbol || 'Quote Token'} 支付保证金和结算`, `Long or short ${market.tokenSymbol || 'MEME'}; margin and settlement in ${market.quoteTokenSymbol || 'Quote Token'}`)
        : uiCopy('选择市场后查看开仓标的与结算资产', 'Select a market to see the traded token and settlement asset'));
      const leverageInput = $('#perps-leverage');
      const maximumLeverage = Math.max(1, marketLeverageCap(market));
      if (leverageInput) {
        syncMarketLeverageInput(leverageInput, market, state.perpSubmitting);
        text('[data-perps-leverage]', leverageInput.value);
      }
      $$('[data-panel="perps"] .leverage-scale span').forEach((node, index, nodes) => {
        const compact = maximumLeverage <= nodes.length;
        node.hidden = compact && index >= maximumLeverage;
        node.textContent = `${compact ? index + 1 : Math.round(1 + (maximumLeverage - 1) * index / (nodes.length - 1))}×`;
      });
      $$('[data-perps-size]').forEach(button => { button.disabled = !state.account || state.perpQuoteBalance == null || !market || state.perpSubmitting; });
      text('[data-perps-price]', formatPerpPrice(latestPrice > 0 ? latestPrice : oraclePrice));
      text('[data-perps-mark]', formatPerpPrice(oraclePrice));
      const priceInput = $('#perps-price-limit');
      const marketPrice = market && !market.dataStale && BigInt(market.oraclePriceE18 || '0') > 0n
        ? formatUnits(BigInt(market.oraclePriceE18), 18, 18) : '';
      text('[data-perps-market-price]', marketPrice || '—');
      if (priceInput) {
        const oracleRaw = marketPrice ? BigInt(market.oraclePriceE18) : 0n;
        const isShort = $('[data-perps-side="short"]')?.classList.contains('active');
        const defaultLimit = oracleRaw > 0n
          ? formatUnits(isShort ? oracleRaw * 99n / 100n : (oracleRaw * 101n + 99n) / 100n, 18, 18)
          : '';
        const marketId = market ? String(market.marketId) : '';
        if (priceInput.dataset.marketId !== marketId) {
          priceInput.dataset.marketId = marketId;
          priceInput.dataset.userEdited = '';
        }
        if (!priceInput.dataset.userEdited) priceInput.value = defaultLimit;
        priceInput.disabled = !marketPrice || state.perpSubmitting;
      }
      text('[data-perps-change]', priceChange == null ? '—' : `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
      text('[data-perps-volume]', market ? `${volume24h.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${market.quoteTokenSymbol || 'QUOTE'}` : '—');
      text('[data-perps-oi]', market ? `${formatUnits(BigInt(market.lockedNotionalRaw || '0'), quoteDecimals)} ${market.quoteTokenSymbol || 'QUOTE'}` : '—');
      text('[data-perps-funding]', market ? uiMarkup`上限 ${(Number(market.maxFundingRatePpmPerDay || 0) / 10_000).toFixed(4)}% / 日` : '—');
      text('[data-perps-entry]', state.perpPosition?.open ? formatPerpPrice(formatUnits(BigInt(state.perpPosition.entryPriceE18 || '0'), 18)) : '—');
      text('[data-perps-liq]', '—');
      const margin = Number($("#perps-size")?.value || 0);
      const leverage = Number($("#perps-leverage")?.value || 1);
      const notional = Number.isFinite(margin) && margin > 0 && Number.isFinite(leverage) ? margin * leverage : 0;
      text('[data-perps-notional]', market && notional > 0 ? `${notional.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${market.quoteTokenSymbol || 'QUOTE'}` : '—');
      text('[data-perps-est-liq]', state.perpPosition?.open ? '以链上风险校验为准' : uiCopy("提交前由合约校验", "Validated by the contract before execution"));
      text('[data-perps-open-fee]', market ? `${(Number(market.openFeePpm || 0) / 10_000).toFixed(4)}%` : '—');
      text('[data-perps-maintenance-margin]', config ? `${(Number(config.maintenanceMarginPpm || 0) / 10_000).toFixed(2)}%` : '—');
      const quoteBalanceLabel = state.account && state.perpQuoteBalance != null && market
        ? `${formatUnits(BigInt(state.perpQuoteBalance), quoteDecimals)} ${market.quoteTokenSymbol || 'QUOTE'}`
        : state.account ? '读取中…' : uiCopy("连接钱包后读取", "Connect wallet to load");
      text('[data-perps-equity], [data-perps-available]', quoteBalanceLabel);
      text('[data-perps-position]', !state.account ? uiCopy("连接钱包后读取", "Connect wallet to load") : state.perpPosition?.open ? `${state.perpPosition.isLong ? 'LONG' : 'SHORT'} · ${formatUnits(BigInt(state.perpPosition.notionalRaw || '0'), Number(market?.quoteDecimals || 18))}` : uiCopy("当前无持仓", "No open position"));
      const modernPosition = $('[data-panel="perps"] [data-perps-panel="positions"]');
      if (modernPosition) {
        const decimals = Number(market?.quoteDecimals || 18);
        const pnlRaw = BigInt(state.perpPosition?.currentPnlRaw || '0');
        const pnlValue = formatUnits(pnlRaw, decimals);
        const pnlDisplay = `${pnlRaw > 0n ? '+' : ''}${pnlValue} ${market?.quoteTokenSymbol || 'QUOTE'}`;
        const pnlClass = pnlRaw > 0n ? 'up' : pnlRaw < 0n ? 'down' : '';
        const pnlLabel = pnlRaw > 0n
          ? uiCopy('实时浮盈（含资金费）', 'Live unrealized profit (incl. funding)')
          : pnlRaw < 0n
            ? uiCopy('实时浮亏（含资金费）', 'Live unrealized loss (incl. funding)')
            : uiCopy('实时未实现盈亏（含资金费）', 'Live unrealized PnL (incl. funding)');
        modernPosition.innerHTML = !state.account
          ? uiMarkup`<p class="footer-note">连接钱包后读取当前真实仓位。</p>`
          : !state.perpPosition?.open
            ? uiMarkup`<p class="footer-note">当前钱包在该市场没有未平仓仓位。</p>`
            : uiMarkup`<div class="perps-position-head"><div class="perps-position-name">${perpetualLogoMarkup(perpetualBaseLogo(market), market?.tokenSymbol)}<div><strong>${escapeHtml(perpetualPairLabel(market))} <span class="tag lime">${state.perpPosition.isLong ? uiCopy("我的多仓", "My long") : uiCopy("我的空仓", "My short")}</span></strong><small>逐仓 · ${escapeHtml(market?.quoteTokenSymbol || 'Quote Token')} 本位</small></div></div><div class="perps-pnl"><strong class="${pnlClass}">${escapeHtml(pnlDisplay)}</strong><small>${pnlLabel}</small></div></div><div class="perps-position-grid"><div><span>名义仓位</span><strong>${escapeHtml(formatUnits(BigInt(state.perpPosition.notionalRaw || '0'), decimals))}</strong></div><div><span>开仓均价</span><strong>${escapeHtml(formatUnits(BigInt(state.perpPosition.entryPriceE18 || '0'), 18))}</strong></div><div><span>保证金</span><strong>${escapeHtml(formatUnits(BigInt(state.perpPosition.collateralRaw || '0'), decimals))}</strong></div><div><span>开仓时间</span><strong>${state.perpPosition.openedAt ? escapeHtml(formatDate(Number(state.perpPosition.openedAt) * 1000)) : '—'}</strong></div></div><div class="perps-position-actions"><button type="button" data-modern-perp-close>市价平仓</button></div>`;
      }
      const orders = $('[data-panel="perps"] [data-perps-panel="orders"]');
      if (orders) orders.innerHTML = '<p class="footer-note">当前合约仅支持钱包签名后立即上链的市价操作，没有待成交挂单。</p>';
      const triggers = $('[data-panel="perps"] [data-perps-panel="triggers"]');
      if (triggers) triggers.innerHTML = uiCopy("<p class=\"footer-note\">当前合约未开放止盈止损条件单，界面不会伪造委托数据。</p>", "<p class=\"footer-note\">Stop-loss and take-profit orders are not supported by the current contract. No simulated orders are shown.</p>");
      const onchain = $('[data-panel="perps"] [data-perps-panel="onchain"]');
      if (onchain) {
        const rows = perpMarketActivity(market).slice(0, 5).map((item) => uiMarkup`<div class="compact-order"><strong>${escapeHtml(market ? perpetualPairLabel(market) : `Market #${Number(item.marketId)}`)} <small class="${item.isOpen ? 'up' : ''}">${item.isOpen ? uiCopy("持仓中", "Open") : uiCopy("已平仓 / 已结算", "Closed / settled")}</small></strong><span>交易者<small>${escapeHtml(short(item.traderAddress || ''))}</small></span><span>区块<small>#${Number(item.blockNumber).toLocaleString('en-US')}</small></span><span>交易哈希<small>${escapeHtml(short(item.lastTxHash || ''))}</small></span><a class="secondary" href="${escapeHtml(`${NETWORKS.bsc.explorer}/tx/${item.lastTxHash}`)}" target="_blank" rel="noopener noreferrer">查看</a></div>`).join('');
        onchain.innerHTML = rows || '<p class="footer-note">该市场当前没有已索引的真实链上仓位记录。</p>';
      }
      const submit = $('#perps-submit');
      const pendingRecord = $('[data-perps-pending-record]');
      if (pendingRecord) {
        const pendingKey = state.account && state.perpConfig?.contractAddress
          ? `bitbt_perp_pending:bsc:${state.perpConfig.contractAddress}:${state.account.toLowerCase()}` : '';
        const pendingHash = pendingKey ? readLocalPreference(pendingKey) : '';
        pendingRecord.hidden = !/^0x[a-fA-F0-9]{64}$/.test(pendingHash);
        text('[data-perps-pending-hash]', pendingHash);
      }
      if (submit) {
        const isShort = $('[data-perps-side="short"]')?.classList.contains('active');
        const needsWallet = !state.account;
        submit.disabled = state.perpSubmitting || (!needsWallet && (!enabled || !market || (state.perpModernAction === 'open_position' && Boolean(market?.closeOnly))));
        submit.textContent = state.perpKeeperWaking ? uiCopy('运维服务启动中，请稍候…', 'Starting operations, please wait…') : state.perpSubmitting ? uiCopy('正在准备链上参数…', 'Preparing transaction…') : !state.account ? uiCopy('连接钱包后开仓', 'Connect wallet to trade') : !market ? uiCopy('请选择市场', 'Select market') : state.perpModernAction === 'close_position' ? uiCopy(`确认平仓 ${perpetualPairLabel(market)}`, `Close ${perpetualPairLabel(market)}`) : uiCopy(`确认开${isShort ? '空' : '多'} ${perpetualPairLabel(market)}`, `${isShort ? 'Short' : 'Long'} ${perpetualPairLabel(market)}`);
        submit.removeAttribute('data-toast');
      }
      const orderBox = $('[data-perps-order-box]');
      if (orderBox) {
        const waiting = Boolean(state.perpSubmitting);
        orderBox.classList.toggle('is-waiting', waiting);
        orderBox.setAttribute('aria-busy', waiting ? 'true' : 'false');
        const waitingForClose = state.perpModernAction === 'close_position';
        const actionLabel = waitingForClose ? '平仓' : '开仓';
        const actionLabelEn = waitingForClose ? 'close' : 'open';
        const phaseTitle = state.perpKeeperWaking ? `正在准备${actionLabel}服务` : state.perpOperationPhase === 'confirming' ? `${actionLabel}交易已广播` : state.perpOperationPhase === 'wallet' ? '等待钱包确认' : '正在准备链上参数';
        const phaseTitleEn = state.perpKeeperWaking ? `Preparing ${actionLabelEn} service` : state.perpOperationPhase === 'confirming' ? `${actionLabelEn === 'close' ? 'Close' : 'Open'} transaction broadcast` : state.perpOperationPhase === 'wallet' ? 'Waiting for wallet confirmation' : 'Preparing transaction parameters';
        const phaseDetail = state.perpKeeperWaking
          ? state.perpKeeperWakeAttempt > 0
            ? `后台正在进行第 ${state.perpKeeperWakeAttempt} 次就绪检查；页面会持续等待并在就绪后自动继续。当前交易尚未发送，请勿重复点击。`
            : `后台正在启动服务；页面会持续等待并在就绪后自动继续本次${actionLabel}。当前交易尚未发送，请勿重复点击。`
          : state.perpOperationPhase === 'confirming'
            ? `本次${actionLabel}交易已经发送，正在等待链上确认。为避免重复交易，确认完成前相关按钮已锁定。`
            : state.perpOperationPhase === 'wallet'
              ? `请在钱包中核对并确认本次${actionLabel}。完成或取消前相关按钮已锁定。`
              : `后台正在校验行情、仓位和交易参数。本次${actionLabel}交易尚未发送，完成前请勿重复操作。`;
        const phaseDetailEn = state.perpKeeperWaking
          ? `The service is preparing. This page will keep waiting and continue automatically when ready. No ${actionLabelEn} transaction has been sent; do not click again.`
          : state.perpOperationPhase === 'confirming'
            ? `The ${actionLabelEn} transaction was sent and is waiting for on-chain confirmation. Related controls are locked to prevent a duplicate transaction.`
            : state.perpOperationPhase === 'wallet'
              ? `Review and confirm this ${actionLabelEn} in your wallet. Related controls remain locked until you confirm or cancel.`
              : `The service is checking market, position, and transaction parameters. No ${actionLabelEn} transaction has been sent.`;
        text('[data-perps-wait-title]', uiCopy(phaseTitle, phaseTitleEn));
        text('[data-perps-wait-detail]', uiCopy(phaseDetail, phaseDetailEn));
        orderBox.querySelectorAll('button, input, select, textarea').forEach((control) => {
          if (waiting) {
            if (!control.hasAttribute('data-perps-wait-was-disabled')) {
              control.setAttribute('data-perps-wait-was-disabled', control.disabled ? '1' : '0');
            }
            control.disabled = true;
          } else if (control.hasAttribute('data-perps-wait-was-disabled')) {
            control.disabled = control.getAttribute('data-perps-wait-was-disabled') === '1';
            control.removeAttribute('data-perps-wait-was-disabled');
          }
        });
      }
      $$('[data-modern-perp-close], [data-perps-side], [data-perps-order], [data-perps-use-market-price]').forEach((control) => {
        if (state.perpSubmitting) {
          if (!control.hasAttribute('data-perps-submit-was-disabled')) control.setAttribute('data-perps-submit-was-disabled', control.disabled ? '1' : '0');
          control.disabled = true;
        } else if (control.hasAttribute('data-perps-submit-was-disabled')) {
          control.disabled = control.getAttribute('data-perps-submit-was-disabled') === '1';
          control.removeAttribute('data-perps-submit-was-disabled');
        }
      });
      const operationNotice = $('[data-perps-operation-notice]');
      if (operationNotice) {
        operationNotice.hidden = !state.perpOperationNotice;
        operationNotice.textContent = state.perpOperationNotice;
      }
      renderPerpetualChart();
    }
    if (market) {
      const decimals = Number(market.quoteDecimals || 18);
      text("[data-perp-market-pair]", perpetualPairLabel(market));
      text("[data-perp-market-liquidity]", `${formatUnits(BigInt(market.liquidityRaw), decimals)} / ${formatUnits(BigInt(market.lockedNotionalRaw), decimals)}`);
      text("[data-perp-market-exposure]", `${formatUnits(BigInt(market.longNotionalRaw), decimals)} / ${formatUnits(BigInt(market.shortNotionalRaw), decimals)}`);
      text("[data-perp-market-limits]", `${formatUnits(BigInt(market.maxPositionNotionalRaw), decimals)} / ${formatUnits(BigInt(market.maxOpenInterestRaw), decimals)}`);
      text("[data-perp-market-utilization]", `${(Number(market.maxUtilizationPpm || 0) / 10_000).toFixed(2)}%${market.closeOnly ? uiCopy(" · 只减仓", " · Reduce-only") : ""}`);
      text("[data-perp-market-funding]", `${(Number(market.maxFundingRatePpmPerDay || 0) / 10_000).toFixed(4)}%`);
      text("[data-perp-market-epoch]", market.epochEnd ? formatDate(Number(market.epochEnd) * 1000) : "—");
      text("[data-perp-market-duration]", market.maxPositionDurationSeconds ? uiMarkup`${(Number(market.maxPositionDurationSeconds) / 86400).toFixed(2)} 天` : "—");
      text("[data-perp-market-keeper]", formatUnits(BigInt(market.minKeeperRewardRaw || "0"), decimals));
      const openFeePercent = (Number(market.openFeePpm || 0) / 10_000).toFixed(4);
      const closeFeePercent = (Number(market.closeFeePpm || 0) / 10_000).toFixed(4);
      const platformSharePercent = (Number(market.platformFeeSharePpm || 0) / 10_000).toFixed(2);
      const lpSharePercent = (Number(market.lpFeeSharePpm || 0) / 10_000).toFixed(2);
      text("[data-perp-fee]", `${openFeePercent}% / ${closeFeePercent}%`);
      text("[data-perp-market-fees]", `${openFeePercent}% / ${closeFeePercent}%`);
      text("[data-perp-market-fee-split]", `${platformSharePercent}% / ${lpSharePercent}%`);
      text("[data-perp-market-fee-recipient]", short(market.platformFeeRecipient || ""));
      text("[data-perp-market-fee-claimable]", `${formatUnits(BigInt(market.platformFeeClaimableRaw || "0"), decimals)} / ${formatUnits(BigInt(market.platformFeeLiabilityRaw || "0"), decimals)}`);
      text("[data-perp-market-emergency]", market.emergencySettlementActive ? uiMarkup`已启用 · ${formatUnits(BigInt(market.emergencySettlementPriceE18 || "0"), 18)}` : market.emergencySettlementActivateAfter ? uiMarkup`等待至 ${formatDate(Number(market.emergencySettlementActivateAfter) * 1000)}` : uiCopy("未启用", "Disabled"));
    } else {
      text("[data-perp-market-pair], [data-perp-market-liquidity], [data-perp-market-exposure], [data-perp-market-limits], [data-perp-market-utilization], [data-perp-market-funding], [data-perp-market-epoch], [data-perp-market-duration], [data-perp-market-keeper], [data-perp-market-fees], [data-perp-market-fee-split], [data-perp-market-fee-recipient], [data-perp-market-fee-claimable], [data-perp-market-emergency]", "—");
    }
    const position = state.perpPosition;
    const quoteDecimals = Number(market?.quoteDecimals || 18);
    text("[data-perp-position]", !state.account ? uiCopy("连接钱包后读取", "Connect wallet to load") : position?.open ? uiMarkup`${position.isLong ? "LONG" : "SHORT"} · 保证金 ${formatUnits(BigInt(position.collateralRaw), quoteDecimals)} · 名义 ${formatUnits(BigInt(position.notionalRaw), quoteDecimals)}` : uiCopy("当前无持仓", "No open position"));
    text("[data-perp-position-pnl]", position?.open ? formatUnits(BigInt(position.currentPnlRaw || "0"), quoteDecimals) : "—");
    text("[data-perp-shares]", state.account ? formatUnits(BigInt(position?.liquiditySharesRaw || "0"), quoteDecimals) : "—");
    text("[data-perp-wallet-fee-claimable]", state.account ? formatUnits(BigInt(position?.platformFeeClaimableRaw || "0"), quoteDecimals) : uiCopy("连接钱包后读取", "Connect wallet to load"));
    const action = $("#perp-action")?.value || "open_position";
    $$('[data-panel="perpetual"] input, [data-panel="perpetual"] select').forEach((node) => {
      node.disabled = state.perpSubmitting;
    });
    syncMarketLeverageInput($('#perp-leverage'), market, state.perpSubmitting);
    const addsRisk = ["open_position", "deposit_liquidity"].includes(action);
    const changesLiquidity = ["deposit_liquidity", "withdraw_liquidity"].includes(action);
    const hasOpenInterest = BigInt(market?.lockedNotionalRaw || "0") > 0n;
    const needsAmount = ["open_position", "deposit_liquidity"].includes(action);
    const needsLeverage = action === "open_position";
    const needsShares = action === "withdraw_liquidity";
    const needsTrader = ["liquidate", "expire_position"].includes(action);
    const amountField = $("[data-perp-amount-field]");
    const leverageField = $("[data-perp-leverage-field]");
    const sharesField = $("[data-perp-shares-field]");
    const traderField = $("[data-perp-trader-field]");
    if (amountField) amountField.hidden = !needsAmount;
    if (leverageField) leverageField.hidden = !needsLeverage;
    if (sharesField) sharesField.hidden = !needsShares;
    if (traderField) traderField.hidden = !needsTrader;
    const submit = $("[data-perp-submit]");
    const epochEnded = Number(market?.epochEnd || 0) > 0 && Date.now() >= Number(market.epochEnd) * 1000;
    const canClaimPlatformFees = action !== "claim_platform_fees" || BigInt(position?.platformFeeClaimableRaw || "0") > 0n;
    if (submit) {
      // A stale keeper heartbeat is an idle state, not a dead end. Keep the
      // risk-adding action available so the authenticated prepare request can
      // wake the on-demand keeper. A market-level closeOnly flag remains a
      // hard risk control and is never bypassed here.
      const needsWallet = !state.account;
      submit.disabled = state.perpSubmitting || (!needsWallet && (!enabled || !market || !canClaimPlatformFees || (addsRisk && market?.closeOnly) || (action === "open_position" && epochEnded) || (changesLiquidity && hasOpenInterest)));
      submit.textContent = state.perpSubmitting ? "正在校验并等待钱包确认…" : needsWallet ? uiCopy("连接钱包后交易", "Connect wallet to trade") : uiCopy("确认并提交链上交易", "Confirm and submit on-chain");
    }
    const preview = $("[data-perp-preview]");
    if (preview) {
      preview.hidden = !state.preparedPerpAction;
      preview.innerHTML = state.preparedPerpAction
        ? uiMarkup`<div class="section-title"><h3>链上交易快照</h3><span class="tag lime">${state.preparedPerpAction.transactions.length} 笔</span></div>${state.preparedPerpAction.transactions.map((transaction, index) => `<div class="review-row"><span>${index + 1}. ${escapeHtml(transaction.label)}</span><strong>${escapeHtml(short(transaction.to))}</strong></div>`).join("")}`
        : "";
    }
    renderPerpetualServices();
  };
  const loadPerpetualPosition = async () => {
    const current = beginPerpRead('position');
    const market = selectedPerpMarket();
    if (!state.account || !market || !state.perpConfig?.enabled) {
      state.perpPosition = null;
      renderPerpetual();
      return;
    }
    let position;
    try { position = await api(`v1/pump/perpetual/position?market_id=${Number(market.marketId)}&wallet_address=${encodeURIComponent(state.account)}`); }
    catch (error) {
      if (!current()) return;
      state.perpPosition = null; renderPerpetual(); setPerpReadError('position', '仓位加载失败，请刷新后核对链上记录'); throw error;
    }
    if (!current()) return;
    state.perpPosition = position;
    renderPerpetual();
    setPerpReadError('position');
  };
  const schedulePerpetualPositionStreamRefresh = () => {
    if (!state.account || !state.perpPosition?.open || !perpetualPanelActive() || document.visibilityState === 'hidden') return;
    perpPositionStreamRefreshQueued = true;
    if (perpPositionStreamRefreshTimer || perpPositionStreamRefreshInFlight) return;
    perpPositionStreamRefreshTimer = window.setTimeout(async () => {
      perpPositionStreamRefreshTimer = null;
      if (!perpPositionStreamRefreshQueued) return;
      perpPositionStreamRefreshQueued = false;
      perpPositionStreamRefreshInFlight = true;
      try {
        await loadPerpetualPosition();
      } catch {
        // Keep the last rendered value. The normal read-error state tells the user the live refresh failed.
      } finally {
        perpPositionStreamRefreshInFlight = false;
        if (perpPositionStreamRefreshQueued) schedulePerpetualPositionStreamRefresh();
      }
    }, 500);
  };
  const loadPerpetualWalletBalance = async () => {
    const current = beginPerpRead('balance');
    const market = selectedPerpMarket();
    const provider = selectedProvider();
    const account = state.account;
    const quoteToken = String(market?.quoteTokenAddress || '').toLowerCase();
    if (!account || !provider || !/^0x[0-9a-f]{40}$/.test(quoteToken)) {
      state.perpQuoteBalance = null;
      renderPerpetual();
      return;
    }
    const marketId = Number(market.marketId);
    let balance;
    try {
      balance = /^0x0{40}$/.test(quoteToken) ? await walletNativeBalance(account, provider) : await walletTokenBalance(quoteToken, account, provider);
    } catch (error) {
      if (!current()) return;
      state.perpQuoteBalance = null; renderPerpetual(); setPerpReadError('balance', '钱包余额读取失败，请刷新重试'); throw error;
    }
    if (!current() || state.account !== account || Number(selectedPerpMarket()?.marketId) !== marketId || selectedProvider() !== provider) return;
    state.perpQuoteBalance = balance;
    renderPerpetual();
    setPerpReadError('balance');
  };
  const loadPerpetual = async () => {
    const current = beginPerpRead('config', false);
    if (!isBscFeatureChain()) {
      state.perpConfig = { enabled: false, statusNote: `永续市场当前仅部署在 BNB Smart Chain；${selectedNetwork().shortName} 尚未部署。` };
      state.perpMarkets = [];
      state.perpPosition = null;
      state.perpQuoteBalance = null;
      state.perpCandles = [];
      renderPerpetual();
      return;
    }
    const chain = state.selectedChain;
    let config, markets;
    try {
      config = await api("v1/pump/perpetual/config");
      markets = config?.enabled ? await api("v1/pump/perpetual/markets") : [];
    } catch (error) {
      if (!current()) return;
      state.perpConfig = null; state.perpMarkets = []; state.perpPosition = null; state.perpQuoteBalance = null;
      renderPerpetual(); setPerpReadError('config', '永续配置或市场读取失败，请刷新重试'); throw error;
    }
    if (!current() || state.selectedChain !== chain) return;
    state.perpConfig = config;
    state.perpMarkets = markets;
    selectInitialPerpMarket(markets);
    renderPerpetual();
    setPerpReadError('config');
    await Promise.all([loadPerpetualPosition(), loadPerpetualWalletBalance(), loadPerpetualServiceData(), loadPerpetualCandles()]);
  };
  const perpetualPanelActive = () => Boolean(root.querySelector('[data-panel="perpetual"].active, [data-panel="perps"].active'));
  const refreshPerpetualStatus = async () => {
    if (!ui20260911 || !perpetualPanelActive() || !isBscFeatureChain() || perpStatusRefreshInFlight || state.perpKeeperWaking) return;
    perpStatusRefreshInFlight = true;
    const current = beginPerpRead('config', false);
    try {
      const config = await api("v1/pump/perpetual/config");
      if (!current()) return;
      const markets = config?.enabled ? await api("v1/pump/perpetual/markets") : [];
      if (!current()) return;
      state.perpConfig = config;
      state.perpMarkets = markets;
      selectInitialPerpMarket(markets);
      renderPerpetual();
      setPerpReadError('config');
    } catch (error) {
      if (!current()) return;
      setPerpReadError('config', '永续状态刷新失败，旧状态不可作为交易依据，请重试');
      throw error;
    } finally {
      perpStatusRefreshInFlight = false;
    }
  };
  const perpetualWord = (data, index) => {
    if (!/^0x[0-9a-fA-F]+$/.test(data || "") || data.length < 10 + (index + 1) * 64) throw new Error("永续交易参数编码不完整");
    return BigInt(`0x${data.slice(10 + index * 64, 10 + (index + 1) * 64)}`);
  };
  const validatePreparedPerpetual = (prepared, market, request) => {
    if (request.wallet_address?.toLowerCase() !== state.account?.toLowerCase() || state.selectedChain !== "bsc") throw new Error("钱包或网络已变化，请重新确认交易");
    const contract = String(state.perpConfig?.contractAddress || "").toLowerCase();
    const quoteToken = String(market.quoteTokenAddress || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(contract) || !/^0x[0-9a-f]{40}$/.test(quoteToken)) throw new Error("永续合约或报价资产地址无效");
    if (!prepared || prepared.action !== request.action || Number(prepared.marketId) !== request.market_id || !Array.isArray(prepared.transactions) || !prepared.transactions.length) throw new Error("永续交易快照与请求不一致");
    const actionSelectors = {
      // PumpPerpetual v6 ABI selectors. Keep these signatures aligned with the API encoder.
      deposit_liquidity: "0x34a860e4",
      withdraw_liquidity: "0x95e17d84",
      open_position: "0xd7449e6b",
      close_position: "0x391cb5af",
      liquidate: "0x5fae8b3d",
      expire_position: "0x15589527",
      claim_platform_fees: "0x5fa65a04",
    };
    const expectedSelector = actionSelectors[request.action];
    let actionTransaction = null;
    const approvals = [];
    for (const transaction of prepared.transactions) {
      const to = String(transaction.to || "").toLowerCase();
      const data = String(transaction.data || "").toLowerCase();
      const selector = data.slice(0, 10);
      if (normalizeChainId(transaction.chainId || transaction.chain_id || "") !== "0x38" || BigInt(transaction.value || "0x0") !== 0n) throw new Error("永续交易网络或转账金额不安全");
      if (to === quoteToken && selector === "0x095ea7b3") {
        const spender = `0x${data.slice(34, 74)}`;
        if (spender !== contract) throw new Error("永续授权接收方与合约不一致");
        approvals.push(perpetualWord(data, 1));
      } else if (to === contract && selector === expectedSelector && !actionTransaction) {
        actionTransaction = transaction;
      } else throw new Error("永续交易目标或方法不在允许范围内");
    }
    if (!actionTransaction) throw new Error("永续交易方法缺失");
    if (["open_position", "close_position"].includes(request.action)) {
      const deadline = perpetualWord(actionTransaction.data, request.action === "open_position" ? 6 : 3);
      const minPrice = perpetualWord(actionTransaction.data, request.action === "open_position" ? 4 : 1);
      const maxPrice = perpetualWord(actionTransaction.data, request.action === "open_position" ? 5 : 2);
      if (deadline !== BigInt(prepared.expiresAt || 0) || deadline <= BigInt(Math.floor(Date.now() / 1000)) || minPrice <= 0n || maxPrice < minPrice) throw new Error("永续报价已过期或价格边界无效，请重新确认");
      if (request.action === 'open_position' && request.price_limit_e18) {
        const limit = BigInt(request.price_limit_e18);
        if (request.is_long ? maxPrice > limit : minPrice < limit) throw new Error('最新预言机价格已超出输入的可接受成交价；请刷新市价并重新确认');
      }
    }
    if (request.action !== "claim_platform_fees" && perpetualWord(actionTransaction.data, 0) !== BigInt(request.market_id)) throw new Error("永续 marketId 绑定失败");
    let requiredApproval = 0n;
    if (request.action === "deposit_liquidity") {
      requiredApproval = BigInt(request.amount_raw);
      if (perpetualWord(actionTransaction.data, 1) !== requiredApproval) throw new Error("永续流动性金额绑定失败");
    }
    if (request.action === "open_position") {
      const collateral = BigInt(request.amount_raw);
      const leverage = BigInt(request.leverage);
      const fee = collateral * leverage * BigInt(market.openFeePpm || 0) / 1_000_000n;
      requiredApproval = collateral + fee;
      if (perpetualWord(actionTransaction.data, 1) !== collateral || perpetualWord(actionTransaction.data, 2) !== leverage || perpetualWord(actionTransaction.data, 3) !== (request.is_long ? 1n : 0n)) throw new Error("永续仓位参数绑定失败");
    }
    if (request.action === "withdraw_liquidity") {
      if (perpetualWord(actionTransaction.data, 1) !== BigInt(request.shares_raw) || `0x${actionTransaction.data.slice(10 + 2 * 64 + 24, 10 + 3 * 64)}` !== state.account) throw new Error("永续提取参数绑定失败");
    }
    if (["liquidate", "expire_position"].includes(request.action)) {
      if (`0x${actionTransaction.data.slice(10 + 64 + 24, 10 + 2 * 64)}` !== String(request.recipient || "").toLowerCase()) throw new Error("永续 Keeper 目标仓位绑定失败");
    }
    if (request.action === "claim_platform_fees") {
      const encodedQuote = `0x${actionTransaction.data.slice(10 + 24, 10 + 64)}`;
      if (encodedQuote !== quoteToken || actionTransaction.data.length !== 74) throw new Error("平台手续费领取参数绑定失败");
    }
    if (requiredApproval > 0n && approvals.length && (approvals.at(-1) !== requiredApproval || approvals.slice(0, -1).some((amount) => amount !== 0n))) throw new Error("永续授权额度绑定失败");
    if (requiredApproval === 0n && approvals.length) throw new Error("当前永续操作不需要 ERC20 授权");
  };
  const ensureNoPendingPerpetualTransaction = async (walletAddress, assertContext = () => {}) => {
    assertContext();
    const pendingKey = `bitbt_perp_pending:bsc:${state.perpConfig?.contractAddress}:${walletAddress.toLowerCase()}`;
    const persistPending = (value) => {
      writeLocalPreference(pendingKey, value);
      if (readLocalPreference(pendingKey) !== value) throw new Error("浏览器无法保存待确认交易状态，已停止继续提交；请检查存储权限并核对钱包记录");
    };
    const pending = readLocalPreference(pendingKey);
    if (pending) {
      if (pending === "unknown") throw new Error("上一笔永续交易提交状态未知，请先在钱包中核对链上记录，勿重复提交");
      const receipt = await selectedProvider().request({ method: "eth_getTransactionReceipt", params: [pending] });
      assertContext();
      if (receipt?.status == null) throw new Error(`上一笔永续交易仍待确认，禁止重复发送：${pending}`);
      if (!receiptSucceeded(receipt) && ![false, 0, "0", "0x0", "0x00"].includes(receipt.status)) throw new Error("上一笔永续交易回执状态未知，禁止重复发送");
      persistPending("");
      throw new Error(receiptSucceeded(receipt) ? `上一笔永续交易已成功，请刷新仓位后再操作：${pending}` : `上一笔永续交易链上失败，请确认后重试：${pending}`);
    }
    return { pendingKey, persistPending };
  };
  const preparePerpetualWhenReady = async (request, assertContext = () => {}) => {
    await ensureNoPendingPerpetualTransaction(request.wallet_address, assertContext);
    assertContext();
    const prepare = () => api("v1/pump/perpetual/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    try {
      const prepared = await prepare();
      assertContext();
      return prepared;
    } catch (error) {
      if (!String(error?.message || error).includes('perpetual keeper is warming up')) throw error;
    }
    state.perpKeeperWaking = true;
    state.perpOperationPhase = 'service';
    state.perpKeeperWakeAttempt = 0;
    renderPerpetual();
    try {
      const isOpening = request.action === 'open_position';
      const actionLabel = request.action === 'close_position' ? '平仓' : isOpening ? '开仓' : '操作';
      const maximumReadyChecks = 36;
      for (let attempt = 1; attempt <= maximumReadyChecks; attempt += 1) {
        state.perpKeeperWakeAttempt = attempt;
        renderPerpetual();
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        assertContext();
        try {
          state.perpConfig = await api('v1/pump/perpetual/config');
        } catch (error) {
          if (attempt === maximumReadyChecks) throw error;
          continue;
        }
        assertContext();
        if (state.perpConfig?.operationsState === 'degraded') {
          throw new Error(`永续${actionLabel}暂未完成：后台服务状态异常，已停止自动重试；请稍后再试。本次未发送${actionLabel}交易`);
        }
        if (isOpening && state.perpConfig?.chainOpeningsPaused) {
          throw new Error('永续合约已暂停开仓；本次未发送开仓交易');
        }
        if (state.perpConfig?.operationsReady && (!isOpening || !state.perpConfig?.openingsPaused)) {
          await ensureNoPendingPerpetualTransaction(request.wallet_address, assertContext);
          try {
            const prepared = await prepare();
            assertContext();
            return prepared;
          } catch (error) {
            if (!String(error?.message || error).includes('perpetual keeper is warming up')) throw error;
          }
        }
      }
      throw new Error(`永续${actionLabel}暂未完成：后台服务等待超过 3 分钟仍未就绪；本次未发送${actionLabel}交易，请检查服务状态后重试`);
    } finally {
      state.perpKeeperWaking = false;
      state.perpKeeperWakeAttempt = 0;
      renderPerpetual();
    }
  };
  const preparePerpetualAction = async () => {
    if (!state.account) await connectWallet();
    let market = selectedPerpMarket();
    if (!market || !state.perpConfig?.enabled) throw new Error("永续市场尚未开放");
    const modernPerps = Boolean($('[data-panel="perps"].active'));
    const action = modernPerps ? state.perpModernAction : $("#perp-action")?.value || "open_position";
    if (modernPerps && action === 'open_position') {
      const requestedLeverage = Number($('#perps-leverage')?.value || 0);
      const initialLeverageCap = marketLeverageCap(market);
      if (!initialLeverageCap || !Number.isSafeInteger(requestedLeverage) || requestedLeverage < 1 || requestedLeverage > initialLeverageCap) {
        throw new Error(`当前市场只允许 1–${initialLeverageCap || '—'} 倍杠杆，请刷新市场参数后重试`);
      }
      const marketId = Number(market.marketId);
      const account = state.account;
      const latestMarkets = await api('v1/pump/perpetual/markets');
      if (state.account !== account || Number(selectedPerpMarket()?.marketId) !== marketId) throw new Error('钱包或市场已变化，请重新确认订单');
      market = Array.isArray(latestMarkets) ? latestMarkets.find((item) => Number(item.marketId) === marketId) : null;
      if (!market) throw new Error('当前市场已不可用，请刷新页面');
      state.perpMarkets = latestMarkets;
      renderPerpetual();
    }
    if (["open_position", "deposit_liquidity"].includes(action) && market.closeOnly) throw new Error("永续市场当前只允许平仓、清算和安全提取");
    if (action === "open_position" && Number(market.epochEnd || 0) > 0 && Date.now() >= Number(market.epochEnd) * 1000) throw new Error("当前风险周期已结束，等待存量仓位结算和下一周期开启");
    if (["deposit_liquidity", "withdraw_liquidity"].includes(action) && BigInt(market.lockedNotionalRaw || "0") > 0n) throw new Error("当前市场存在未平仓仓位，LP 份额暂时锁定以防未实现盈亏套利");
    const body = { wallet_address: state.account, market_id: Number(market.marketId), action };
    if (["open_position", "deposit_liquidity"].includes(action)) body.amount_raw = parseUnits($(modernPerps ? "#perps-size" : "#perp-amount")?.value, Number(market.quoteDecimals || 18)).toString();
    if (action === "open_position") {
      body.leverage = Number($(modernPerps ? "#perps-leverage" : "#perp-leverage")?.value || 0);
      const leverageCap = marketLeverageCap(market);
      if (!leverageCap || !Number.isSafeInteger(body.leverage) || body.leverage < 1 || body.leverage > leverageCap) {
        throw new Error(`当前市场只允许 1–${leverageCap || '—'} 倍杠杆，请刷新市场参数后重试`);
      }
      body.is_long = modernPerps ? !$('[data-perps-side="short"]')?.classList.contains("active") : $("#perp-side")?.value !== "short";
      if (state.perpPosition?.open && Boolean(state.perpPosition.isLong) !== body.is_long) {
        const existingDirection = state.perpPosition.isLong ? '多仓' : '空仓';
        const requestedDirection = body.is_long ? '多仓' : '空仓';
        throw new Error(`同一市场已有${existingDirection}，不能同时再开${requestedDirection}；请先平掉现有${existingDirection}，再开${requestedDirection}`);
      }
      if (modernPerps) {
        const oracle = BigInt(market.oraclePriceE18 || '0');
        if (market.dataStale || oracle <= 0n) throw new Error('当前预言机市价不可用，请刷新市场后重试');
        let limit;
        try { limit = parseUnits($('#perps-price-limit')?.value, 18); }
        catch { throw new Error('请输入有效的可接受成交价'); }
        if (limit <= 0n) throw new Error('可接受成交价必须大于零');
        if (body.is_long ? limit < oracle : limit > oracle) throw new Error(body.is_long ? '开多最高价不能低于当前预言机价' : '开空最低价不能高于当前预言机价');
        const difference = body.is_long ? limit - oracle : oracle - limit;
        const slippageBps = difference * 10_000n / oracle;
        if (slippageBps > 500n) throw new Error('可接受成交价不得偏离当前预言机价超过 5%');
        body.slippage_bps = Number(slippageBps);
        body.price_limit_e18 = limit.toString();
      }
      const notional = BigInt(body.amount_raw) * BigInt(body.leverage);
      const maxPosition = BigInt(market.maxPositionNotionalRaw || "0");
      if (maxPosition > 0n && notional > maxPosition) {
        const decimals = Number(market.quoteDecimals || 18);
        const amount = formatUnits(BigInt(body.amount_raw), decimals);
        const total = formatUnits(notional, decimals);
        const limit = formatUnits(maxPosition, decimals);
        const maxCollateral = formatUnits(maxPosition / BigInt(body.leverage), decimals);
        throw new Error(`开仓金额超出单仓上限：${amount} × ${body.leverage} = ${total}，当前上限为 ${limit}。请把保证金降至 ${maxCollateral} 以下，或降低杠杆。`);
      }
    }
    if (action === "withdraw_liquidity") body.shares_raw = String($("#perp-shares")?.value || "").trim();
    if (["liquidate", "expire_position"].includes(action)) {
      body.recipient = String($("#perp-trader")?.value || "").trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(body.recipient) || /^0x0{40}$/.test(body.recipient)) throw new Error("请输入有效的目标仓位钱包地址");
    }
    const prepared = await preparePerpetualWhenReady(body);
    validatePreparedPerpetual(prepared, market, body);
    state.preparedPerpAction = prepared;
    state.preparedPerpRequest = body;
    renderPerpetual();
    return prepared;
  };
  const executePreparedPerpetual = async (prepared, market, request, onCoreBroadcast, assertContext = () => {}) => {
    assertContext();
    const { pendingKey, persistPending } = await ensureNoPendingPerpetualTransaction(request.wallet_address, assertContext);
    // Approval confirmation can outlive a quote. Refresh the exact original
    // request after approvals, never reread mutable form inputs.
    for (let round = 0; round < 3; round += 1) {
      assertContext();
      validatePreparedPerpetual(prepared, market, request);
      const approvals = prepared.transactions.filter((tx) => String(tx.data).startsWith("0x095ea7b3"));
      for (const tx of approvals) {
        if (state.account?.toLowerCase() !== request.wallet_address.toLowerCase() || state.selectedChain !== "bsc") throw new Error("钱包或网络已变化，请重新确认交易");
        await sendVaultTransaction(tx, tx.label || "永续授权", undefined, undefined, assertContext);
      }
      if (approvals.length) {
        assertContext();
        prepared = await preparePerpetualWhenReady(request, assertContext);
        continue;
      }
      validatePreparedPerpetual(prepared, market, request);
      const tx = prepared.transactions[0];
      try {
        const hash = await sendVaultTransaction(tx, tx.label || "永续操作",
          (hash) => { persistPending(hash); onCoreBroadcast?.(hash); },
          () => persistPending("unknown"), assertContext);
        persistPending("");
        return hash;
      } catch (error) {
        if (Number(error?.code) === 4001 && readLocalPreference(pendingKey) === "unknown") persistPending("");
        throw error;
      }
    }
    throw new Error("授权状态尚未同步，请稍后重试；尚未发送永续操作交易");
  };
  const executePerpetualAction = async () => {
    if (!state.preparedPerpAction || !state.preparedPerpRequest) return;
    const market = selectedPerpMarket();
    if (!market) throw new Error("永续市场已变化，请重新加载参数");
    validatePreparedPerpetual(state.preparedPerpAction, market, state.preparedPerpRequest);
    state.perpOperationPhase = 'wallet';
    renderPerpetual();
    await executePreparedPerpetual(state.preparedPerpAction, market, state.preparedPerpRequest, () => {
      state.perpCoreBroadcast = true;
      state.perpOperationPhase = 'confirming';
      renderPerpetual();
    });
    state.preparedPerpAction = null;
    state.preparedPerpRequest = null;
    state.perpModernAction = "open_position";
    toast("永续操作链上回执成功");
    try {
      await loadPerpetual();
    } catch {
      // A transient read-RPC failure after a successful receipt must never be
      // presented as a failed transaction or invite an accidental re-send.
      toast("链上交易已成功，仓位数据暂时刷新失败，正在自动重试…", 6000);
      window.setTimeout(() => {
        void loadPerpetual().catch(() => toast("仓位数据仍在同步，请稍后刷新页面", 6000));
      }, 3000);
    }
  };
  const submitPerpetualAction = async () => {
    if (state.perpSubmitting) return;
    const actionAtStart = state.perpModernAction;
    state.perpCoreBroadcast = false;
    state.perpOperationPhase = 'preparing';
    state.perpOperationNotice = "";
    state.perpSubmitting = true;
    renderPerpetual();
    try {
      await preparePerpetualAction();
      await executePerpetualAction();
    } catch (error) {
      if (!state.perpCoreBroadcast) {
        const label = actionAtStart === 'close_position' ? '平仓' : '开仓';
        const reason = String(error?.message || error || '后台正在准备，请稍后再试').trim();
        state.perpOperationNotice = `永续${label}未完成：${reason}。本次${label}交易未发送，请稍后再试。`;
      }
      throw error;
    } finally {
      state.perpSubmitting = false;
      state.perpOperationPhase = '';
      renderPerpetual();
    }
  };
  const handlePerpetualSubmit = async () => {
    if (!state.account) {
      await connectWallet();
      await loadPerpetual();
      return;
    }
    await submitPerpetualAction();
  };
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
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand?.("copy");
      input.remove();
      if (!copied) throw new Error("浏览器禁止复制，请长按内容手动复制");
    }
  };
  const copyTokenAddress = async () => {
    const address = tokenAddress(state.selected);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("当前代币地址无效，暂时无法复制");
    await copyText(address);
    toast("完整代币地址已复制");
  };
  const shareToken = async () => {
    const address = tokenAddress(state.selected);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("当前代币链接无效");
    const url = `${routeLocation().origin || "https://bitbt.fun"}${pumpBasePath()}/${address.toLowerCase()}`;
    await copyText(url);
    toast("代币详情链接已复制");
  };
  const status = (token) => String(token?.status || "").replaceAll("_", " ");
  const tokenTaxPercent = (token) => {
    const values = [token?.tax_percent, token?.buy_tax_percent, token?.sell_tax_percent, token?.tax_rate_percent, token?.transfer_tax_percent, token?.tax_bps == null ? null : Number(token.tax_bps) / 100];
    return Math.max(
      0,
      ...values.map((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }),
    );
  };
  const tokenIsMigrated = (token) => Boolean(token?.migrated) || ["migrated", "dex", "graduated"].includes(String(token?.status || "").toLowerCase());
  const tokenCreatedAt = (token) => {
    const timestamp = Date.parse(String(token?.submitted_at || token?.created_at || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const marketMetric = (token, metric, window = state.rankWindow) => token?.[metric === "price_change" ? `price_change_${window}_percent` : `${metric}_${window}`];
  const rankWindowLabel = () => state.rankWindow.toUpperCase();
  const filteredTokens = () => {
    const query = state.tokenSearch.trim().toLowerCase();
    const tokens = state.tokens.filter((token) => {
      if (
        query &&
        ![token.token_name, token.symbol, tokenAddress(token)].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        )
      )
        return false;
      if (state.marketQuoteFilter !== "all" && String(token.quote_token || "").toLowerCase() !== state.marketQuoteFilter) return false;
      if (
        state.marketCategoryFilter !== "all" &&
        String(token.classification || "others")
          .trim()
          .toLowerCase() !== state.marketCategoryFilter
      )
        return false;
      if (state.marketTypeFilter === "tax" && !token.tax_enabled) return false;
      if (state.marketTypeFilter === "standard" && token.tax_enabled) return false;
      return true;
    });
    if (state.tokenFilter === "latest") return tokens.sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a));
    if (state.tokenFilter === "near-migration") return tokens.filter((token) => !tokenIsMigrated(token) && Number(token.progress_percent || 0) >= 70).sort((a, b) => Number(b.progress_percent || 0) - Number(a.progress_percent || 0));
    if (state.tokenFilter === "dex") return tokens.filter(tokenIsMigrated).sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a));
    if (state.tokenFilter === "high-tax") return tokens.filter((token) => tokenTaxPercent(token) >= 5).sort((a, b) => tokenTaxPercent(b) - tokenTaxPercent(a));
    return tokens.sort((a, b) => number(b.volume_quote_24h) - number(a.volume_quote_24h) || number(b.trade_count_24h) - number(a.trade_count_24h) || number(b.progress_percent) - number(a.progress_percent));
  };
  const tokenCard = (token) => {
    const progress = Math.max(0, Math.min(100, number(token.progress_percent)));
    const address = tokenAddress(token);
    const image = assetImage(token);
    const migrated = tokenIsMigrated(token);
    const change = Number(token.price_change_24h_percent);
    const hasChange = Number.isFinite(change);
    const changeClass = change < 0 ? "down" : "up";
    const quote = String(token.quote_token || "BNB").toUpperCase();
    const tax = tokenTaxPercent(token);
    const badge = migrated
      ? '<span class="tag">DEX</span>'
      : tax > 0
        ? `<span class="tag cyan">TAX ${escapeHtml(`${tax.toFixed(2).replace(/\.?0+$/, "")}%`)}</span>`
        : '<span class="tag lime">LIVE</span>';
    const holders = hasNumber(token.holders_count) ? Number(token.holders_count).toLocaleString("en-US") : "—";
    const raisedRaw = token.total_raised_quote ?? token.total_raised_bnb;
    const thresholdRaw = token.migration_threshold_quote ?? token.migration_threshold_bnb;
    const remainingRaw = token.remaining_to_migration_quote ?? token.migration_remaining_quote ?? token.remaining_to_migration_bnb;
    const thresholdDifference = exactDecimalDifference(thresholdRaw, raisedRaw);
    const directRemaining = formatExactDecimal(remainingRaw);
    const remaining = directRemaining !== "—"
      ? directRemaining
      : thresholdDifference
        ? formatExactDecimal(thresholdDifference)
        : "—";
    const thirdMetric = migrated
      ? uiMarkup`<div><span>流动性</span><strong>${escapeHtml(usdOrQuote(token.curve_reserve_usd, token.curve_reserve_quote, quote))}</strong></div>`
      : uiMarkup`<div><span>持有人</span><strong>${escapeHtml(holders)}</strong></div>`;
    const curve = migrated
      ? ""
      : uiMarkup`<div class="curve"><i style="width:${progress}%"></i></div><div class="curve-label"><span>联合曲线 ${progress.toFixed(0)}%</span><span>还差 ${escapeHtml(remaining)} ${escapeHtml(quote)}</span></div>`;
    return uiMarkup`<button class="token-card" type="button" data-live-token="${escapeHtml(address)}" data-open="detail"><div class="token-head"><img class="token-logo" src="${escapeHtml(image)}" alt="${escapeHtml(token.token_name || token.symbol || "Token")}"><div class="token-name"><strong>${escapeHtml(token.symbol || token.token_name || "—")} ${badge}</strong><small>${escapeHtml(token.token_name || token.symbol || "—")} · ${escapeHtml(migrated ? token.dex_profile || "DEX" : age(token.submitted_at))}</small></div><span class="change ${changeClass}">${hasChange ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}%` : "—"}</span></div><div class="card-metrics"><div><span>市值</span><strong>${escapeHtml(usdOrQuote(token.market_cap_usd, token.market_cap_quote, quote))}</strong></div><div><span>24H 成交</span><strong>${escapeHtml(usdOrQuote(token.volume_usd_24h, token.volume_quote_24h, quote))}</strong></div>${thirdMetric}</div>${curve}</button>`;
  };
  const renderTokens = () => {
    const html = filteredTokens()
      .filter((token) => tokenAddress(token))
      .map(tokenCard)
      .join("");
    $$(ui20260911 ? '[data-panel="discover"] [data-live-token-grid], [data-market-panel="spot"] .token-grid' : ".token-grid").forEach((node) => {
      node.innerHTML = html || uiMarkup`<p class="footer-note">暂无真实 Pump 项目数据。</p>`;
    });
    bindLiveTokenSelection();
    renderRank();
  };
  const renderTradeConfig = () => {
    const quote = String(state.detail?.quote_token || "BNB").toUpperCase();
    const configuredAmounts = state.config?.pump?.quickAmountsByQuote?.[quote] || state.config?.pump?.quickAmounts;
    const amounts = Array.isArray(configuredAmounts) ? configuredAmounts : [];
    const chips = [...amounts, "MAX"];
    $$('[data-panel="trade"] [data-amount]').forEach((node, index) => {
      const amount = chips[index];
      node.hidden = amount === undefined;
      if (amount !== undefined) {
        node.dataset.amount = amount;
        node.textContent = amount === "MAX" ? "MAX" : amount;
      }
    });
  };
  const renderMarketSummary = () => {
    const summary = state.marketSummary || {};
    const total = Number.isFinite(Number(summary.total_tokens)) ? Number(summary.total_tokens) : state.tokens.length;
    const launches = Number.isFinite(Number(summary.launches_24h)) ? Number(summary.launches_24h) : 0;
    const trades = Number.isFinite(Number(summary.trades_24h)) ? Number(summary.trades_24h) : 0;
    text("[data-market-total]", total.toLocaleString("en-US"));
    text("[data-market-spot-count]", `${total.toLocaleString("en-US")}${uiCopy(' 个', '')}`);
    text("[data-market-launches]", launches.toLocaleString("en-US"));
    text("[data-market-trades]", trades.toLocaleString("en-US"));
    text("[data-market-live-count]", `LIVE ${state.marketActivity.length}`);
    text("[data-market-stream-status]", uiCopy(uiMarkup`${selectedNetwork().shortName} 数据流已连接 · 最近 ${state.marketActivity.length} 条真实动态`, `${selectedNetwork().shortName} feed connected · ${state.marketActivity.length} recent events`));
    const banner = $("[data-api-status]");
    if (banner) banner.textContent = uiCopy(uiMarkup`实时 Pump 数据已连接 · ${total} 个项目 · ${state.marketActivity.length} 条最新动态`, `Live Pump data connected · ${total} projects · ${state.marketActivity.length} recent events`);
  };
  const renderLiveRows = () => {
    const visible = state.marketActivity.filter((item) => state.liveFilter === "all" || String(item.activity_type).toLowerCase() === state.liveFilter);
    const rows = visible
      .slice(0, 100)
      .map((item) => {
        const kind = String(item.activity_type || "").toLowerCase();
        const label = kind === "buy" ? "BUY" : kind === "sell" ? "SELL" : "NEW";
        const token = state.tokens.find((entry) => tokenAddress(entry).toLowerCase() === String(item.token_address || "").toLowerCase());
        const symbol = item.symbol || item.token_name || token?.symbol || "TOKEN";
        const amount = kind === "create" ? uiMarkup`创建 ${symbol}` : `${decimal(item.quote_amount)} ${item.quote_token || "BNB"} · ${decimal(item.token_amount)} ${symbol}`;
        const timestamp = Number(item.timestamp);
        const eventAge = age(new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toISOString());
        const verb = kind === "buy" ? uiCopy("买入", "bought") : kind === "sell" ? uiCopy("卖出", "sold") : uiCopy("创建了", "created");
        return `<button class="live-row" data-live-token="${escapeHtml(item.token_address || "")}" type="button"><img src="${escapeHtml(assetImage(token || item))}" alt="${escapeHtml(symbol)}"><div><p><b>${escapeHtml(short(item.trader))}</b> ${verb} <b>${escapeHtml(symbol)}</b></p><small>${escapeHtml(eventAge)} · ${escapeHtml(amount)} · ${escapeHtml(item.status || "—")}</small></div><span class="trade-type ${kind === "buy" ? "buy" : kind === "sell" ? "sell" : ""}">${label}</span></button>`;
      })
      .join("");
    const livePanel = $('[data-panel="live"]');
    if (livePanel) {
      [...livePanel.querySelectorAll(".live-row, .footer-note")].forEach((node) => node.remove());
      livePanel.querySelector(".filter-row")?.insertAdjacentHTML("afterend", rows || uiMarkup`<p class="footer-note">暂无真实全市场链上动态。</p>`);
    }
    bindLiveTokenSelection();
  };
  const renderRank = () => {
    const panel = $('[data-panel="rank"]');
    if (!panel) return;
    [...panel.querySelectorAll(".rank-row, .footer-note")].forEach((node) => node.remove());
    let ranked = [...state.tokens];
    if (state.rankFilter === "latest") ranked.sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a));
    else if (state.rankFilter === "migrated") ranked = ranked.filter(tokenIsMigrated).sort((a, b) => tokenCreatedAt(b) - tokenCreatedAt(a));
    else if (state.rankFilter === "gainers") ranked.sort((a, b) => number(marketMetric(b, "price_change")) - number(marketMetric(a, "price_change")));
    else if (state.rankFilter === "volume") ranked.sort((a, b) => number(marketMetric(b, "volume_usd") ?? marketMetric(b, "volume_quote")) - number(marketMetric(a, "volume_usd") ?? marketMetric(a, "volume_quote")));
    else if (state.rankFilter === "net-flow") ranked.sort((a, b) => number(b.net_flow_usd_24h ?? b.net_flow_quote_24h) - number(a.net_flow_usd_24h ?? a.net_flow_quote_24h));
    else if (state.rankFilter === "market-cap") ranked.sort((a, b) => number(b.market_cap_usd ?? b.market_cap_quote) - number(a.market_cap_usd ?? a.market_cap_quote));
    else ranked.sort((a, b) => number(b.progress_percent) - number(a.progress_percent));
    const windowLabel = rankWindowLabel();
    const rows = ranked
      .slice(0, 20)
      .map((token, index) => {
        const rawChange = marketMetric(token, "price_change");
        const change = rawChange == null ? Number.NaN : Number(rawChange);
        const quote = String(token.quote_token || "BNB").toUpperCase();
        const right = state.rankFilter === "volume" ? usdOrQuote(marketMetric(token, "volume_usd"), marketMetric(token, "volume_quote"), quote) : state.rankFilter === "net-flow" ? (hasNumber(token.net_flow_usd_24h) ? usd(token.net_flow_usd_24h) : `${decimal(token.net_flow_quote_24h)} ${quote}`) : state.rankFilter === "market-cap" ? usdOrQuote(token.market_cap_usd, token.market_cap_quote, quote) : usdOrQuote(token.current_price_usd, token.current_trade_price || token.current_price_quote || token.current_price_bnb, quote, false);
        const badge = Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}%` : `${number(token.progress_percent).toFixed(0)}%`;
        return uiMarkup`<button class="rank-row" type="button" data-live-token="${escapeHtml(tokenAddress(token))}"><span class="num">${String(index + 1).padStart(2, "0")}</span><img src="${escapeHtml(assetImage(token))}" alt="${escapeHtml(token.symbol || "Token")}"><div><strong>${escapeHtml(token.symbol || token.token_name || "—")}</strong><small>${escapeHtml(status(token))} · ${escapeHtml(taxSummary(token))} · ${windowLabel} ${Number(marketMetric(token, "trade_count") || 0).toLocaleString("en-US")} 笔</small></div><div class="rank-price"><strong>${escapeHtml(right)}</strong><span class="${change < 0 ? "down" : "up"}">${escapeHtml(state.rankFilter === "net-flow" ? activitySummary(token) : badge)}</span></div></button>`;
      })
      .join("");
    (panel.querySelector("[data-rank-windows]") || panel.querySelector(".rank-tabs"))?.insertAdjacentHTML("afterend", rows || uiMarkup`<p class="footer-note">暂无真实 Pump 排行数据。</p>`);
    bindLiveTokenSelection();
    text("[data-rank-total]", state.tokens.length);
    text("[data-rank-migrated]", state.tokens.filter(tokenIsMigrated).length);
    text("[data-rank-progress]", state.tokens.length ? `${Math.max(...state.tokens.map((token) => number(token.progress_percent))).toFixed(0)}%` : "—");
  };
  const renderHolders = (address, payload) => {
    if (tokenAddress(state.selected).toLowerCase() !== String(address || "").toLowerCase()) return;
    const rows = Array.isArray(payload?.top_holders) ? payload.top_holders : [];
    text('[data-detail-holder-total]', payload?.available !== false && hasNumber(payload?.holders_count) ? String(payload.holders_count) : '—');
    text('[data-detail-top-ten]', payload?.available !== false && rows.length && rows.slice(0, 10).every(holder => hasNumber(holder.percentage)) ? `${rows.slice(0, 10).reduce((sum, holder) => sum + Number(holder.percentage), 0).toFixed(2)}%` : '—');
    if (payload?.available === false) {
      text("[data-holder-count]", uiCopy("等待链上索引", "Waiting for on-chain indexing"));
      const list = $("[data-holder-list]");
      if (list) list.innerHTML = uiMarkup`<p class="footer-note">该代币已上线，但持有人数据源尚未完成索引。请稍后刷新；这里不会展示推测数据。</p>`;
      return;
    }
    text("[data-holder-count]", payload?.holders_count ? uiMarkup`${Number(payload.holders_count).toLocaleString("en-US")} 位持有人` : uiCopy("暂无可用持有人数据", "Holder data unavailable"));
    const list = $("[data-holder-list]");
    if (!list) return;
    list.innerHTML = rows.length
      ? `<div class="data-table">${rows
          .slice(0, 10)
          .map((holder, index) => {
            const holderAddress = String(holder?.address || "");
            const percentage = Number(holder?.percentage);
            const safePercentage = Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
            return `<div class="holder-bar"><div class="holder-address"><span class="num">${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(short(holderAddress))}</strong>${holderAddress.toLowerCase() === String(state.detail?.creator || "").toLowerCase() ? '<span class="creator-badge">CREATOR</span>' : ""}</div><i style="--w:${safePercentage}%"></i><strong>${safePercentage ? `${safePercentage.toFixed(2)}%` : "—"}</strong></div>`;
          })
          .join("")}</div>`
      : uiMarkup`<p class="footer-note">当前数据源尚未返回该代币的持有人分布，不展示推测数据。</p>`;
  };
  const loadHolders = async () => {
    const address = tokenAddress(state.selected).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return;
    if (state.holders[address]) {
      renderHolders(address, state.holders[address]);
      return;
    }
    text("[data-holder-count]", "正在读取…");
    const list = $("[data-holder-list]");
    if (list) list.innerHTML = `<p class="footer-note">正在读取真实持有人数据…</p>`;
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
  const renderComments = (address = tokenAddress(state.selected).toLowerCase()) => {
    const comments = state.comments[address] || [];
    text("[data-comment-count]", uiMarkup`${comments.length} 条`);
    const list = $("[data-comment-list]");
    if (list) list.innerHTML = comments.length ? comments.map((comment) => `<article class="comment-card"><div class="between"><strong>${escapeHtml(short(comment.author_address))}</strong><span>${escapeHtml(age(comment.created_at))}</span></div><p>${escapeHtml(comment.body)}</p></article>`).join("") : uiMarkup`<p class="footer-note">暂无评论。这里不会展示模拟内容。</p>`;
    const input = $("[data-comment-input]");
    if (input) input.disabled = !state.account;
    const submit = $("[data-comment-submit]");
    if (submit) {
      submit.disabled = !state.account;
      submit.textContent = state.account ? "发布" : uiCopy("连接钱包", "Connect Wallet");
    }
  };
  const loadComments = async (force = false) => {
    const address = tokenAddress(state.selected).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return;
    if (!force && state.comments[address]) return renderComments(address);
    const list = $("[data-comment-list]");
    if (list) list.innerHTML = `<p class="footer-note">正在读取真实评论…</p>`;
    const comments = await api(`v1/pump/comments?token_address=${encodeURIComponent(address)}&limit=200`);
    if (tokenAddress(state.selected).toLowerCase() !== address) return;
    state.comments[address] = Array.isArray(comments) ? comments : [];
    renderComments(address);
  };
  const submitComment = async () => {
    if (!state.account) return connectWallet();
    await assertProviderState();
    const address = tokenAddress(state.selected).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("请先选择代币");
    const input = $("[data-comment-input]");
    const body = String(input?.value || "").trim();
    if (!body || body.length > 500) throw new Error("评论需为 1–500 个字符");
    const comment = await api("v1/pump/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token_address: address,
        author_address: state.account,
        body,
      }),
    });
    state.comments[address] = [comment, ...(state.comments[address] || []).filter((item) => item.id !== comment.id)];
    if (input) input.value = "";
    renderComments(address);
    toast("评论已发布");
  };
  const renderAlertButtons = () => {
    const address = tokenAddress(state.selected).toLowerCase();
    $$("[data-token-alert]").forEach((node) => {
      const active = state.alerts.some((alert) => alert.enabled && alert.token_address?.toLowerCase() === address && alert.alert_type === node.dataset.tokenAlert);
      node.classList.toggle("active", active);
      node.title = !state.account ? "连接钱包后设置提醒" : active ? "点击关闭提醒" : "点击开启提醒";
    });
    text("[data-alert-total]", state.alerts.filter((alert) => alert.enabled).length);
  };
  const renderAlerts = () => {
    const list = $("[data-alert-list]");
    if (!list) return;
    const tokenSelect = $('#alert-token-select');
    if (tokenSelect) {
      const previous = tokenSelect.value;
      tokenSelect.innerHTML = '<option value="">请选择代币</option>' + state.tokens.map(item => `<option value="${escapeHtml(tokenAddress(item))}">${escapeHtml(item.token_name || item.symbol || short(tokenAddress(item)))}</option>`).join('');
      if (state.tokens.some(item => tokenAddress(item) === previous)) tokenSelect.value = previous;
    }
    text('[data-alert-record-count]', uiMarkup`${state.alerts.length} 条`);
    const labels = {
      curve_80: "曲线达到 80%",
      curve_90: "曲线达到 90%",
      migrated: "迁移至 DEX",
      price_above: "价格突破",
      price_below: "价格跌破",
    };
    list.innerHTML = state.alerts.length
      ? state.alerts
          .map((alert) => {
            const token = state.tokens.find((item) => tokenAddress(item).toLowerCase() === alert.token_address.toLowerCase());
            const alertState = alert.enabled ? "监控中" : alert.last_triggered_at ? uiMarkup`已触发 · ${formatDate(alert.last_triggered_at)}` : "已关闭";
            return `<article class="profile-card alert-card"><div class="between"><div><strong>${escapeHtml(token?.token_name || token?.symbol || short(alert.token_address))}</strong><p class="footer-note">${escapeHtml(labels[alert.alert_type] || alert.alert_type)}${alert.threshold ? ` · ${escapeHtml(alert.threshold)}` : ""} · ${escapeHtml(alertState)}</p></div>${alert.enabled ? uiMarkup`<button class="secondary" data-alert-remove="${escapeHtml(alert.id)}">关闭</button>` : ""}</div></article>`;
          })
          .join("")
      : `<p class="footer-note">${state.account ? uiCopy("尚未设置提醒。请在代币详情中开启。", "No alerts set. Enable them on a token's detail page.") : "连接钱包后显示提醒。"}</p>`;
    $$("[data-alert-remove]").forEach((node) => node.addEventListener("click", () => removeAlert(node.dataset.alertRemove).catch((error) => toastError(error, "提醒关闭失败"))));
    renderAlertButtons();
  };
  const setTokenAlert = async (alertType, requestedAddress = tokenAddress(state.selected)) => {
    if (!state.account) await connectWallet();
    await assertProviderState();
    const address = String(requestedAddress || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("请先选择代币");
    const existing = state.alerts.find((alert) => alert.token_address?.toLowerCase() === address && alert.alert_type === alertType);
    if (existing?.enabled) return removeAlert(existing.id);
    const alert = await api("v1/pump/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_address: state.account,
        token_address: address,
        alert_type: alertType,
        enabled: true,
      }),
    });
    state.alerts = [alert, ...state.alerts.filter((item) => item.id !== alert.id && !(item.token_address?.toLowerCase() === address && item.alert_type === alertType))];
    renderAlerts();
    toast("提醒已开启");
  };
  const removeAlert = async (id) => {
    if (!state.account) throw new Error("请先连接钱包");
    await api("v1/pump/alerts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, wallet_address: state.account }),
    });
    state.alerts = state.alerts.filter((alert) => alert.id !== id);
    renderAlerts();
    toast("提醒已关闭");
  };
  const deviceId = () => {
    try {
      let id = readLocalPreference("bitbt_pump_device");
      if (!id) {
        id = crypto.randomUUID();
        writeLocalPreference("bitbt_pump_device", id);
      }
      return id;
    } catch {
      return "pump-browser-device";
    }
  };
  const renderMyPanels = () => {
    const launches = state.myLaunches;
    const visibleLaunches = launches.filter((launch) => state.myLaunchFilter === "all" || (state.myLaunchFilter === "migrated" ? tokenIsMigrated(launch) : !tokenIsMigrated(launch)));
    const activityType = (tx) => tx.activity_type || (tx.tx_type === "pump_buy" ? "buy" : tx.tx_type === "pump_sell" ? "sell" : /launch|create|deploy/i.test(String(tx.tx_type || "")) ? "create" : "");
    const selectedActivityType = state.historyFilter === "pump_buy" ? "buy" : state.historyFilter === "pump_sell" ? "sell" : state.historyFilter === "launch" ? "create" : state.historyFilter;
    const visibleHistory = state.history.filter((tx) => selectedActivityType === "all" || activityType(tx) === selectedActivityType);
    const launchPanel = $('[data-panel="my-launches"]');
    if (launchPanel) {
      launchPanel.querySelectorAll(".launch-card, .summary-hero, .footer-note").forEach((node) => node.remove());
      launchPanel.querySelector(".filter-row")?.insertAdjacentHTML("beforebegin", uiMarkup`<div class="summary-hero"><span class="eyebrow">CREATOR OVERVIEW</span><h1>${state.account ? uiCopy("真实链上数据", "Real on-chain data") : "—"}</h1><p>${state.account ? uiCopy("当前钱包的真实发射记录", "Launches by this wallet") : "连接并验证钱包后显示真实数据"}</p><div class="summary-grid"><div><span>已发射</span><strong>${launches.length}</strong></div><div><span>已迁移</span><strong>${launches.filter((item) => item.status === "migrated").length}</strong></div><div><span>交易记录</span><strong>${state.history.length}</strong></div></div></div>`);
      const cards = visibleLaunches.map((launch) => uiMarkup`<button class="launch-card" data-live-token="${escapeHtml(launch.contract_address || "")}"><div class="launch-card-head"><img src="${escapeHtml(assetImage(launch))}" alt="${escapeHtml(launch.token_name || launch.symbol || "Token")}"><div><strong>${escapeHtml(launch.token_name || launch.symbol || "—")} · ${escapeHtml(launch.symbol || "—")}</strong><small>${escapeHtml(status(launch))} · ${escapeHtml(age(launch.submitted_at))}</small></div><span class="tag lime">${escapeHtml(String(launch.status || "").toUpperCase())}</span></div><div class="card-metrics"><div><span>计价</span><strong>${escapeHtml(launch.quote_token || "BNB")}</strong></div><div><span>地址</span><strong>${escapeHtml(short(launch.contract_address))}</strong></div><div><span>网络</span><strong>${escapeHtml(launch.chain_id || "bsc")}</strong></div></div></button>`).join("");
      launchPanel.querySelector(".filter-row")?.insertAdjacentHTML("afterend", cards || `<p class="footer-note">${state.account ? uiCopy("当前筛选暂无真实发射记录。", "No launches match this filter.") : "连接并验证钱包后显示真实发射记录。"}</p>`);
      bindLiveTokenSelection();
    }
    const activity = $('[data-panel="activity"]');
    if (activity) {
      activity.querySelectorAll(".activity-card, .wallet-history-group, .footer-note").forEach((node) => node.remove());
      const groupedHistory = new Map();
      visibleHistory.forEach((tx) => {
        const date = new Date(tx.created_at || 0);
        const dateLabel = Number.isFinite(date.getTime())
          ? date.toLocaleDateString(pumpLocale() === "zh" ? "zh-CN" : "en-CA", { timeZone: displayTimeZone() })
          : uiCopy("日期未知", "Unknown date");
        if (!groupedHistory.has(dateLabel)) groupedHistory.set(dateLabel, []);
        groupedHistory.get(dateLabel).push(tx);
      });
      const groups = [...groupedHistory.entries()].map(([dateLabel, transactions]) => uiMarkup`<section class="wallet-history-group"><h2>${escapeHtml(dateLabel)}</h2><div class="wallet-history-list">${transactions.map((tx) => {
        const kind = activityType(tx);
        const label = kind === "buy" ? uiCopy("买入", "Buy") : kind === "sell" ? uiCopy("卖出", "Sell") : kind === "create" ? uiCopy("创建代币", "Create Token") : uiCopy("交易", "Transaction");
        const symbol = tx.symbol || tx.token_name || "TOKEN";
        const quote = tx.quote_token || "BNB";
        const quoteAmount = decimal(tx.quote_amount);
        const tokenAmount = decimal(tx.token_amount);
        const value = kind === "buy" ? `−${quoteAmount} ${quote}` : kind === "sell" ? `+${quoteAmount} ${quote}` : symbol;
        const detail = kind === "create" ? `${short(tx.token_address)} · ${tx.status || "—"}` : `${tokenAmount} ${symbol} · ${tx.status || "—"}`;
        const txHash = validTxHash(tx.tx_hash);
        const content = `<span class="wallet-history-icon" aria-hidden="true"><i class="ico" style="--icon:url('./assets/icons/lucide/${kind === "sell" ? "arrow-up-right" : kind === "buy" ? "arrow-down-left" : "waypoints"}.svg')"></i></span><span class="wallet-history-main"><strong>${escapeHtml(label)} · ${escapeHtml(symbol)}</strong><small>${escapeHtml(detail)}</small><small>${escapeHtml(txHash ? short(txHash) : short(tx.token_address))} · ${escapeHtml(age(tx.created_at))}</small></span><span class="wallet-history-value ${kind === "sell" ? "up" : kind === "buy" ? "down" : ""}"><strong>${escapeHtml(value)}</strong><small>${txHash ? uiCopy("查看链上详情", "View on-chain") : uiCopy("链上哈希不可用", "Transaction hash unavailable")}</small></span><span class="wallet-history-chevron" aria-hidden="true"><i class="ico sm" style="--icon:url('./assets/icons/lucide/chevron-right.svg')"></i></span>`;
        return txHash ? `<a class="activity-card wallet-history-row" href="${escapeHtml(selectedNetwork().explorer)}/tx/${txHash}" target="_blank" rel="noopener noreferrer">${content}</a>` : `<div class="activity-card wallet-history-row wallet-history-row-static">${content}</div>`;
      }).join("")}</div></section>`).join("");
      activity.querySelector(".filter-row")?.insertAdjacentHTML("afterend", groups || uiMarkup`<p class="footer-note">${state.account ? uiCopy("当前筛选暂无真实交易记录。", "No real transactions match this filter.") : uiCopy("连接并验证钱包后显示真实交易记录。", "Connect and verify your wallet to view real transactions.")}</p>`);
    }
    const profilePanel = $('[data-panel="profile"]');
    if (!profilePanel?.hasAttribute('data-reference-profile')) {
      profilePanel?.querySelector("[data-profile-summary]")?.remove();
      profilePanel?.querySelector("[data-reward-summary]")?.remove();
    }
    if (profilePanel?.hasAttribute('data-reference-profile')) {
      const setProfile = (selector, value) => {
        profilePanel.querySelectorAll(selector).forEach(node => { node.textContent = value; });
      };
      setProfile('.profile-connect-copy strong', state.account ? short(state.account) : uiCopy("连接钱包，查看你的账户", "Connect wallet to view your account"));
      setProfile('.profile-avatar', state.account ? state.account.slice(2, 4).toUpperCase() : '—');
      setProfile('.profile-connect-action', state.account ? uiCopy("已连接", "Connected") : uiCopy("连接钱包", "Connect Wallet"));
      const stats = profilePanel.querySelectorAll('.profile-stats > div');
      const migrated = launches.filter(tokenIsMigrated).length;
      if (stats[0]) {
        stats[0].querySelector('strong').textContent = state.account ? String(launches.length) : '—';
        stats[0].querySelector('small').textContent = state.account ? uiMarkup`${migrated} 个已迁移` : uiCopy("连接钱包后读取", "Connect wallet to load");
      }
      if (stats[1]) {
        stats[1].querySelector('strong').textContent = state.account ? String(state.history.length) : '—';
        stats[1].querySelector('small').textContent = uiCopy("已加载的真实记录", "Loaded records");
      }
      if (stats[2]) {
        stats[2].querySelector('span').textContent = uiCopy("奖励账本", "Reward ledger");
        stats[2].querySelector('strong').textContent = state.account ? uiMarkup`${state.creatorRewards.length} 条` : '—';
        stats[2].querySelector('small').textContent = uiCopy("实际领取状态以账本为准", "Claim status follows the ledger");
      }
      setProfile('.launch-tool .tag', state.account ? uiMarkup`${launches.length} 个项目` : '— 个项目');
      setProfile('.launch-tool .tool-foot > span', state.account ? uiMarkup`${migrated} 个项目已迁移` : uiCopy("连接钱包后读取", "Connect wallet to load"));
      setProfile('[data-open="activity"] .tool-copy small', state.account ? uiCopy(`${state.history.length} 条已加载记录`, `${state.history.length} loaded records`) : uiCopy('当前钱包链上记录', 'On-chain activity for this wallet'));
      setProfile('.creator-reward-card strong', state.account ? uiCopy(`${state.creatorRewards.length} 条真实奖励记录 · 查看明细`, `${state.creatorRewards.length} reward records · View details`) : uiCopy('连接钱包后读取真实奖励账本', 'Connect wallet to load reward ledger'));
      setProfile('.revenue-tool .tool-value', state.account ? uiCopy(`${state.creatorRewards.length} 条记录`, `${state.creatorRewards.length} records`) : '—');
      const details = profilePanel.querySelector('[data-profile-extra-content]');
      if (details) {
        const rewards = state.creatorRewards.map(reward => `<div class="review-row"><span>${escapeHtml(reward.quote_symbol || 'BNB')} · ${escapeHtml(reward.status || '—')}</span><strong>${escapeHtml(baseUnits(reward.amount_wei))} ${escapeHtml(reward.quote_symbol || 'BNB')}</strong></div>`).join('');
        const emptyRewards = uiCopy('<p class="footer-note">暂无已加载的奖励记录。</p>', '<p class="footer-note">No reward records loaded.</p>');
        details.innerHTML = uiMarkup`<div class="points-summary"><div><span>PUMP 积分</span><strong>${state.account ? Number(state.points?.wallet_points || 0).toLocaleString('en-US') : '—'}</strong></div><div><span>积分排名</span><strong>${state.account && state.points?.wallet_rank ? `#${Number(state.points.wallet_rank)}` : '—'}</strong></div><div><span>收藏</span><strong>${state.favorites.length}</strong></div></div>${rewards || emptyRewards}<p class="footer-note">未执行链上兑付的金额不代表已到账。</p>`;
      }
    } else if (profilePanel) {
      profilePanel.querySelector(".section-title")?.insertAdjacentHTML("beforebegin", uiMarkup`<div class="profile-card" data-profile-summary><div class="profile-head"><span class="profile-avatar">${state.account ? state.account.slice(2, 4).toUpperCase() : "—"}</span><div><h2>${state.account ? short(state.account) : uiCopy("请连接钱包", "Connect wallet")}</h2><p>${state.account ? uiMarkup`${escapeHtml(selectedNetwork().shortName.toUpperCase())} · 实时数据` : uiCopy("连接钱包后显示账户数据", "Connect your wallet to view account data")}</p></div><span class="tag lime">PUMP</span></div><div class="card-metrics"><div><span>已发射</span><strong>${launches.length}</strong></div><div><span>交易次数</span><strong>${state.history.length}</strong></div><div><span>收藏</span><strong>${state.favorites.length}</strong></div></div>${state.account ? uiMarkup`<div class="points-summary"><div><span>PUMP 积分</span><strong>${Number(state.points?.wallet_points || 0).toLocaleString("en-US")}</strong></div><div><span>积分排名</span><strong>${state.points?.wallet_rank ? `#${state.points.wallet_rank}` : "—"}</strong></div></div>` : ""}</div>`);
      const rewards = state.creatorRewards.map((reward) => `<div class="review-row"><span>${escapeHtml(reward.quote_symbol || "BNB")} · ${escapeHtml(reward.status === "accrued" ? "可签署凭证" : reward.status === "pending_contract_upgrade" ? "待曲线合约升级" : reward.status)}</span><strong>${escapeHtml(baseUnits(reward.amount_wei))} ${escapeHtml(reward.quote_symbol || "BNB")}</strong></div>`).join("");
      profilePanel.querySelector(".section-title")?.insertAdjacentHTML("afterend", uiMarkup`<div class="profile-card" data-reward-summary><div class="section-title"><h3>创作者奖励账本</h3><span class="tag lime">API</span></div>${rewards || `<p class="footer-note">${state.account ? "暂无已记录的创作者奖励。" : "连接钱包后显示奖励账本。"}</p>`}<p class="footer-note">这里只展示后端真实累计；未执行链上兑付的金额不会标记为已到账。</p></div>`);
    }
    const watchlist = $('[data-panel="watchlist"] .token-grid');
    if (watchlist) {
      const favoriteAddresses = new Set(state.favorites.map((item) => String(item.contract_address || "").toLowerCase()));
      const cards = state.tokens
        .filter((token) => favoriteAddresses.has(tokenAddress(token).toLowerCase()))
        .map(tokenCard)
        .join("");
      watchlist.innerHTML = cards || uiMarkup`<p class="footer-note">暂无自选代币。请在代币详情中点击收藏。</p>`;
      bindLiveTokenSelection();
    }
    renderAlerts();
    renderGrowth();
  };
  const renderVaultRecipientRows = () => {
    const list = $(`[data-vault-recipient-list]`);
    if (!list || list.children.length) return;
    const addRow = (address = "", bps = "") => {
      if (list.children.length >= 10) return toast("最多支持 10 个收款地址");
      const row = document.createElement("div");
      row.className = "vault-recipient-row";
      row.innerHTML = `<input class="field" data-vault-recipient-address placeholder="0x 收款地址" value="${escapeHtml(address)}"><input class="field" data-vault-recipient-bps inputmode="numeric" placeholder="bps" value="${escapeHtml(bps)}"><button type="button" data-vault-remove-recipient aria-label="删除"><i class="ico sm" aria-hidden="true" style="--icon:url('./assets/icons/lucide/x.svg')"></i></button>`;
      row.querySelector("[data-vault-remove-recipient]")?.addEventListener("click", () => {
        if (list.children.length <= 1) return toast("至少保留一个收款地址");
        row.remove();
        state.preparedVault = null;
        renderVaultPreview();
      });
      row.querySelectorAll("input").forEach((input) =>
        input.addEventListener("input", () => {
          state.preparedVault = null;
          renderVaultPreview();
        }),
      );
      list.appendChild(row);
    };
    addRow(state.account || "", "10000");
    list._addRow = addRow;
  };
  const renderVaultPreview = () => {
    const preview = $(`[data-vault-preview]`);
    const deploy = $(`[data-vault-deploy]`);
    if (!preview || !deploy) return;
    if (!state.preparedVault) {
      preview.hidden = true;
      preview.replaceChildren();
      deploy.disabled = true;
      return;
    }
    const prepared = state.preparedVault;
    preview.hidden = false;
    preview.innerHTML = uiMarkup`<div class="section-title"><h3>部署快照</h3><span class="tag lime">不可修改</span></div><div class="review-row"><span>预测 Vault</span><strong>${escapeHtml(prepared.predicted_vault_address)}</strong></div><div class="review-row"><span>计价资产</span><strong>${escapeHtml(prepared.quote_symbol)}</strong></div>${prepared.recipients.map((item) => `<div class="review-row"><span>${escapeHtml(short(item.address))}</span><strong>${(Number(item.bps) / 100).toFixed(2)}%</strong></div>`).join("")}<p class="footer-note">请再次核对地址。链上部署后，收款地址和比例不可修改。</p>`;
    deploy.disabled = !state.account || !state.vaultConfig?.enabled;
  };
  const renderVaults = () => {
    renderVaultRecipientRows();
    const firstRecipient = $(`[data-vault-recipient-list] [data-vault-recipient-address]`);
    if (state.account && firstRecipient && !firstRecipient.value) firstRecipient.value = state.account;
    text("[data-vault-feature-status]", state.vaultConfig?.enabled ? uiCopy("已启用", "Enabled") : uiCopy("尚未部署", "Not deployed"));
    text("[data-vault-keeper-status]", state.vaultConfig?.keeper_status === "ready" ? "READY" : "DISABLED");
    text("[data-vault-keeper-threshold]", state.vaultConfig?.auto_distribution_threshold_wei || "—");
    text("[data-vault-count]", String(state.vaults.length));
    const rewardList = $(`[data-unified-revenue-list]`);
    if (rewardList) {
      const creator = state.creatorRewards.map((reward) => uiMarkup`<div class="profile-card vault-card"><div class="review-row"><span>创建者奖励 · ${escapeHtml(reward.status || "—")}</span><strong>${escapeHtml(baseUnits(reward.amount_wei))} ${escapeHtml(reward.quote_symbol || "BNB")}</strong></div></div>`).join("");
      const dividends = state.holderDividends.map((reward) => uiMarkup`<div class="profile-card vault-card"><div class="review-row"><span>持币分红 · ${escapeHtml(reward.symbol)}</span><strong>${escapeHtml(baseUnits(reward.claimable_wei))} ${escapeHtml(reward.quote_symbol)}</strong></div><button class="secondary" type="button" data-holder-dividend-claim="${escapeHtml(reward.token_address)}">领取持币分红</button></div>`).join("");
      const v3Rewards = state.v3FeeRewards.map((reward) => uiMarkup`<div class="profile-card vault-card"><div class="section-title"><h3>V3 LP 手续费奖励</h3><span class="tag lime">Epoch ${escapeHtml(reward.onchain_epoch)}</span></div><div class="review-row"><span>项目 / 奖励资产</span><strong>${escapeHtml(short(reward.token_address))} / ${escapeHtml(short(reward.reward_token_address))}</strong></div><div class="review-row"><span>${reward.claimed ? "已领取" : "可领取"}</span><strong>${escapeHtml(baseUnits(reward.amount_raw))}</strong></div><a class="review-row" href="https://bscscan.com/tx/${escapeHtml(reward.publish_tx_hash)}" target="_blank" rel="noopener noreferrer"><span>分配快照区块 ${Number(reward.snapshot_block).toLocaleString("en-US")}</span><strong>查看发布交易</strong></a>${reward.claim_transaction ? uiMarkup`<button class="secondary" type="button" data-v3-fee-claim="${escapeHtml(reward.id)}">领取 V3 手续费奖励</button>` : ""}</div>`).join("");
      const vaultRows = state.vaults.flatMap((vault) => vault.recipients.filter((item) => item.is_current_wallet).map((item) => uiMarkup`<div class="profile-card vault-card"><div class="review-row"><span>Vault 可领取 · ${escapeHtml(vault.quote_symbol)}</span><strong>${escapeHtml(baseUnits(item.claimable_wei))} ${escapeHtml(vault.quote_symbol)}</strong></div><div class="review-row"><span>Vault 已领取</span><strong>${escapeHtml(baseUnits(item.claimed_wei))} ${escapeHtml(vault.quote_symbol)}</strong></div></div>`)).join("");
      rewardList.innerHTML = creator || dividends || v3Rewards || vaultRows ? creator + dividends + v3Rewards + vaultRows : `<p class="footer-note">${state.account ? uiCopy("当前没有可展示的收入。", "No income available to display.") : "连接钱包后显示创建者奖励、持币分红和链上 Vault 收入。"}</p>`;
      $$(`[data-holder-dividend-claim]`).forEach((button) => button.addEventListener("click", () => claimHolderDividend(button.dataset.holderDividendClaim).catch((error) => toastError(error, "持币分红领取失败"))));
      $$(`[data-v3-fee-claim]`).forEach((button) => button.addEventListener("click", () => claimV3FeeReward(button.dataset.v3FeeClaim).catch((error) => toastError(error, "V3 手续费奖励领取失败"))));
    }
    const claimAll = $(`[data-vault-claim-all]`);
    if (claimAll) claimAll.disabled = state.vaultBusy || (!state.vaults.some((vault) => vault.recipients.some((item) => item.is_current_wallet && BigInt(item.claimable_wei || "0") > 0n)) && !state.holderDividends.some((item) => BigInt(item.claimable_wei || "0") > 0n) && !state.v3FeeRewards.some((item) => item.claim_transaction && !item.claimed && BigInt(item.amount_raw || "0") > 0n));
    const list = $(`[data-vault-list]`);
    if (!list) return;
    if (!state.account) {
      list.innerHTML = uiMarkup`<p class="footer-note">连接并验证钱包后读取链上 Vault。</p>`;
      return;
    }
    if (!state.vaultConfig?.enabled) {
      list.innerHTML = uiMarkup`<p class="footer-note">Split Vault Factory 尚未部署到当前网络，创建与领取功能保持禁用。</p>`;
      return;
    }
    list.innerHTML = state.vaults.length
      ? state.vaults
          .map((vault) => {
            const mine = vault.recipients.find((item) => item.is_current_wallet);
            const recipients = vault.recipients.map((item) => {
              const history = (item.claim_history || []).slice(0, 10).map((claim) => uiMarkup`<a class="review-row" href="https://bscscan.com/tx/${escapeHtml(claim.tx_hash)}" target="_blank" rel="noopener noreferrer"><span>区块 ${Number(claim.block_number).toLocaleString("en-US")} · ${escapeHtml(short(claim.tx_hash))}</span><strong>已领 ${escapeHtml(baseUnits(claim.amount_raw))} ${escapeHtml(vault.quote_symbol)}</strong></a>`).join("");
              return uiMarkup`<div class="review-row"><span>${escapeHtml(short(item.address))} · ${(Number(item.bps) / 100).toFixed(2)}%</span><strong>可领 ${escapeHtml(baseUnits(item.claimable_wei))} · 已领 ${escapeHtml(baseUnits(item.claimed_wei))}</strong></div>${history ? uiMarkup`<details><summary>领取流水（${item.claim_history.length}）</summary>${history}</details>` : ""}`;
            }).join("");
            return uiMarkup`<article class="profile-card vault-card"><div class="section-title"><h3>${escapeHtml(vault.quote_symbol)} Split Vault</h3><span class="tag lime">${escapeHtml(short(vault.vault_address))}</span></div><div class="review-row"><span>累计收入</span><strong>${escapeHtml(baseUnits(vault.total_received_wei))} ${escapeHtml(vault.quote_symbol)}</strong></div><div class="review-row"><span>当前余额</span><strong>${escapeHtml(baseUnits(vault.current_balance_wei))} ${escapeHtml(vault.quote_symbol)}</strong></div>${recipients}${mine?.claim_transaction ? uiMarkup`<button class="primary" type="button" data-vault-claim="${escapeHtml(vault.vault_address)}" ${BigInt(mine.claimable_wei || "0") > 0n ? "" : "disabled"}>领取 ${escapeHtml(baseUnits(mine.claimable_wei))} ${escapeHtml(vault.quote_symbol)}</button>` : ""}</article>`;
          })
          .join("")
      : uiMarkup`<p class="footer-note">当前钱包尚未创建 Split Vault。</p>`;
    $$(`[data-vault-claim]`).forEach((button) => button.addEventListener("click", () => claimVault(button.dataset.vaultClaim).catch((error) => toastError(error, "Vault 领取失败"))));
  };
  const loadVaultConfig = async () => {
    if (!isBscFeatureChain()) {
      state.vaultConfig = { enabled: false };
      state.vaults = [];
      renderVaults();
      return;
    }
    try {
      state.vaultConfig = await api("v1/pump/vaults/config");
    } catch {
      state.vaultConfig = { enabled: false };
    }
    renderVaults();
  };
  const loadVaults = async () => {
    if (!state.account || !state.vaultConfig?.enabled) {
      state.vaults = [];
      renderVaults();
      return;
    }
    const response = await api(`v1/pump/vaults?creator_address=${encodeURIComponent(state.account)}`);
    state.vaults = Array.isArray(response?.vaults) ? response.vaults : [];
    renderVaults();
  };
  const prepareVault = async () => {
    if (state.vaultBusy) return;
    if (!state.account) await connectWallet();
    if (!state.vaultConfig?.enabled) throw new Error("Split Vault Factory 尚未部署");
    const rows = [...$$(`[data-vault-recipient-list] .vault-recipient-row`)];
    const recipients = rows.map((row) => ({
      address: row.querySelector(`[data-vault-recipient-address]`)?.value.trim() || "",
      bps: Number(row.querySelector(`[data-vault-recipient-bps]`)?.value || 0),
    }));
    if (!recipients.length || recipients.some((item) => !/^0x[0-9a-fA-F]{40}$/.test(item.address) || !Number.isInteger(item.bps) || item.bps <= 0)) throw new Error("请填写有效的收款地址与正整数 bps");
    if (recipients.reduce((sum, item) => sum + item.bps, 0) !== 10000) throw new Error("收款比例必须合计 10000 bps");
    state.vaultBusy = true;
    try {
      state.preparedVault = await api("v1/pump/vaults/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creator_address: state.account,
          quote_symbol: $("#vault-quote")?.value || "BNB",
          recipients,
        }),
      });
      renderVaultPreview();
      toast("Vault 部署参数已加载，请核对后签名");
    } finally {
      state.vaultBusy = false;
    }
  };
  const sendVaultTransaction = async (transaction, label, onBroadcast, onSubmitting, assertContext = () => {}) => {
    assertContext();
    if (!state.account) await connectWallet();
    const provider = selectedProvider();
    if (state.selectedChain !== "bsc") throw new Error("Split Vault 当前仅支持 BNB Smart Chain");
    await ensureSelectedChain(provider);
    await assertProviderState();
    assertContext();
    const account = state.account;
    const request = {
      from: account,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || "0x0",
    };
    const estimated = BigInt(await provider.request({ method: "eth_estimateGas", params: [request] }));
    if (state.account !== account || selectedProvider() !== provider || state.selectedChain !== "bsc") throw new Error("钱包或网络在估算 Gas 时发生变化，已停止发送");
    assertContext();
    const hash = await send(
      {
        from: account,
        to: transaction.to,
        data: transaction.data,
        value: BigInt(transaction.value || "0x0"),
        gas: (estimated * 120n) / 100n,
        assertContext,
        onSubmitting,
      },
      provider,
    );
    toast(`${label}已广播，等待链上确认…`, 6000);
    onBroadcast?.(hash);
    const receipt = await waitReceipt(hash, provider);
    if (!receiptSucceeded(receipt)) throw new Error(`${label}链上回执失败`);
    return hash;
  };
  const deployVault = async () => {
    if (!state.preparedVault || state.vaultBusy) return;
    state.vaultBusy = true;
    try {
      await sendVaultTransaction(state.preparedVault.transaction, "Vault 部署");
      state.preparedVault = null;
      renderVaultPreview();
      await loadVaults();
      toast("Split Vault 已部署");
    } finally {
      state.vaultBusy = false;
    }
  };
  const claimVault = async (vaultAddress) => {
    if (state.vaultBusy) return;
    const vault = state.vaults.find((item) => item.vault_address.toLowerCase() === String(vaultAddress).toLowerCase());
    const mine = vault?.recipients.find((item) => item.is_current_wallet);
    if (!mine?.claim_transaction || BigInt(mine.claimable_wei || "0") <= 0n) throw new Error("当前没有可领取收入");
    state.vaultBusy = true;
    try {
      await sendVaultTransaction(mine.claim_transaction, "收入领取");
      await loadVaults();
      toast("收入领取成功");
    } finally {
      state.vaultBusy = false;
    }
  };
  const claimAllVaults = async () => {
    if (state.vaultBusy) return;
    const vaultClaims = state.vaults.flatMap((vault) =>
      vault.recipients
        .filter((item) => item.is_current_wallet && item.claim_transaction && BigInt(item.claimable_wei || "0") > 0n)
        .map((item) => ({
          label: `Vault ${short(vault.vault_address)} 领取`,
          transaction: item.claim_transaction,
        })),
    );
    const dividendClaims = state.holderDividends
      .filter((item) => item.claim_transaction && BigInt(item.claimable_wei || "0") > 0n)
      .map((item) => ({ label: `${item.symbol} 持币分红领取`, transaction: item.claim_transaction }));
    const v3Claims = state.v3FeeRewards
      .filter((item) => item.claim_transaction && !item.claimed && BigInt(item.amount_raw || "0") > 0n)
      .map((item) => ({ label: `V3 Epoch ${item.onchain_epoch} 手续费奖励领取`, transaction: item.claim_transaction }));
    const claims = [...vaultClaims, ...dividendClaims, ...v3Claims];
    if (!claims.length) throw new Error("当前没有可领取收入");
    state.vaultBusy = true;
    renderVaults();
    let succeeded = 0;
    const failures = [];
    try {
      for (const item of claims) {
        try {
          await sendVaultTransaction(item.transaction, item.label);
          succeeded += 1;
        } catch (error) {
          failures.push(`${item.label}: ${friendlyError(error, "领取失败")}`);
        }
      }
      await loadUserPanels();
      if (failures.length) toast(`已成功 ${succeeded} 项，失败 ${failures.length} 项：${failures.join("；")}`, 8000);
      else toast(`全部 ${succeeded} 项收入领取成功`);
    } finally {
      state.vaultBusy = false;
      renderVaults();
    }
  };
  const claimHolderDividend = async (tokenAddress) => {
    if (state.vaultBusy) return;
    const dividend = state.holderDividends.find((item) => item.token_address.toLowerCase() === String(tokenAddress).toLowerCase());
    if (!dividend?.claim_transaction) throw new Error("当前没有可领取持币分红");
    state.vaultBusy = true;
    try {
      await sendVaultTransaction(dividend.claim_transaction, `${dividend.symbol} 持币分红领取`);
      await loadUserPanels();
      toast("持币分红领取成功");
    } finally {
      state.vaultBusy = false;
    }
  };
  const claimV3FeeReward = async (id) => {
    if (state.vaultBusy) return;
    const reward = state.v3FeeRewards.find((item) => item.id === id);
    if (!reward?.claim_transaction || reward.claimed) throw new Error("当前没有可领取 V3 手续费奖励");
    state.vaultBusy = true;
    try {
      await sendVaultTransaction(reward.claim_transaction, `V3 Epoch ${reward.onchain_epoch} 手续费奖励领取`);
      await loadV3FeeRewards();
      toast("V3 手续费奖励领取成功");
    } finally {
      state.vaultBusy = false;
      renderVaults();
    }
  };
  const loadV3FeeRewards = async () => {
    if (!state.account || !isBscFeatureChain()) {
      state.v3FeeRewards = [];
      renderVaults();
      return;
    }
    const rewards = await api(`v1/pump/v3-fee-rewards?wallet_address=${encodeURIComponent(state.account)}`);
    state.v3FeeRewards = Array.isArray(rewards) ? rewards : [];
    renderVaults();
  };
  const strategyName = (id) =>
    ({
      buyback_burn: "Buyback & Burn",
      holder_dividend: "Holder Dividend",
      lp_dividend: "LP Staking Dividend",
      token_dividend: "Token Staking Dividend",
      dynamic_airdrop: "Dynamic Airdrop",
      strategic_reserve: "Strategic Reserve",
      gift_proof: "Gift / Social Proof",
      lucky_draw: "Staking & Lucky Draw",
    })[id] ||
    id ||
    "Unknown";
  const renderRegistrySchema = () => {
    const panel = $(`[data-vault-schema-panel]`);
    if (!panel) return;
    const entry = state.vaultRegistry.find((item) => item.id === state.selectedVaultRegistryId);
    panel.hidden = !entry;
    if (!entry) return;
    text("[data-vault-schema-title]", `${entry.name} · v${entry.version}`);
    text("[data-vault-schema-risk]", `${entry.tier} · ${entry.risk_level} risk`);
    text("[data-vault-schema-note]", uiMarkup`${entry.audit_status}；开发者费 ${Number(entry.developer_fee_bps || 0)} bps。Schema 仅生成受审核字段与动作；签名前仍需核对目标 Factory 和 calldata。`);
    const fields = Array.isArray(entry.vault_data_schema?.fields) ? entry.vault_data_schema.fields : [];
    const fieldsRoot = $(`[data-vault-schema-fields]`);
    if (fieldsRoot) fieldsRoot.innerHTML = fields.map((field) => {
      const name = escapeHtml(field.name || "");
      const label = escapeHtml(field.label || field.name || "Field");
      const description = field.description ? `<span>${escapeHtml(field.description)}</span>` : "";
      if (field.type === "boolean") return `<label><input type="checkbox" data-vault-schema-input="${name}" /> ${label}${description}</label>`;
      if (field.type === "select" && Array.isArray(field.options)) return `<label>${label}${description}</label><select class="field" data-vault-schema-input="${name}">${field.options.slice(0, 50).map((option) => `<option value="${escapeHtml(option.value ?? option)}">${escapeHtml(option.label ?? option)}</option>`).join("")}</select>`;
      const inputType = field.type === "uint256" ? "text" : "text";
      return `<label>${label}${description}</label><input class="field" type="${inputType}" data-vault-schema-input="${name}" placeholder="${escapeHtml(field.placeholder || field.type || "")}" ${field.required ? "required" : ""} />`;
    }).join("") || uiMarkup`<p class="footer-note">该 Factory 没有部署参数。</p>`;
    const actions = Array.isArray(entry.vault_ui_schema?.actions) ? entry.vault_ui_schema.actions : [];
    const actionsRoot = $(`[data-vault-schema-actions]`);
    if (actionsRoot) actionsRoot.innerHTML = actions.map((action) => `<div class="review-row"><span>${escapeHtml(action.label || action.name)}</span><strong>${escapeHtml(action.description || "需钱包确认")}</strong></div>`).join("") || uiMarkup`<p class="footer-note">该 Factory 没有公开 Vault 操作。</p>`;
    const actionForm = $(`[data-vault-schema-action-form]`);
    if (actionForm) actionForm.hidden = !actions.length;
    const actionSelect = $("#registry-vault-action");
    if (actionSelect && actions.length) {
      const previous = actionSelect.value;
      actionSelect.innerHTML = actions.map((action) => `<option value="${escapeHtml(action.name)}">${escapeHtml(action.label || action.name)}</option>`).join("");
      if (actions.some((action) => action.name === previous)) actionSelect.value = previous;
      const selectedAction = actions.find((action) => action.name === actionSelect.value) || actions[0];
      const actionFields = $(`[data-vault-schema-action-fields]`);
      if (actionFields) actionFields.innerHTML = (selectedAction.inputs || []).filter((input) => input.name !== "$owner").map((input) => `<label>${escapeHtml(input.label || input.name)}</label><input class="field" data-vault-schema-action-input="${escapeHtml(input.name)}" placeholder="${escapeHtml(input.type || "")}" />`).join("");
    }
    const preview = $(`[data-vault-schema-preview]`);
    const execute = $(`[data-vault-schema-execute]`);
    if (preview && execute) {
      preview.hidden = !state.preparedRegisteredVault;
      preview.innerHTML = state.preparedRegisteredVault ? uiMarkup`<div class="review-row"><span>目标 Factory</span><strong>${escapeHtml(state.preparedRegisteredVault.to)}</strong></div><div class="review-row"><span>交易 value</span><strong>${escapeHtml(state.preparedRegisteredVault.value)}</strong></div><p class="footer-note">calldata 仅由已审核 Schema 在 API 端编码；请在钱包中再次核对。</p>` : "";
      execute.disabled = !state.account || !state.preparedRegisteredVault;
    }
    const actionPreview = $(`[data-vault-schema-action-preview]`);
    const actionExecute = $(`[data-vault-schema-action-execute]`);
    if (actionPreview && actionExecute) {
      actionPreview.hidden = !state.preparedRegisteredVaultAction;
      actionPreview.innerHTML = state.preparedRegisteredVaultAction ? uiMarkup`<div class="review-row"><span>目标 Vault</span><strong>${escapeHtml(state.preparedRegisteredVaultAction.to)}</strong></div><p class="footer-note">API 已调用已审核 Schema 中的 Factory 验证函数，确认该 Vault 由当前已激活 Factory 登记。</p>` : "";
      actionExecute.disabled = !state.account || !state.preparedRegisteredVaultAction;
    }
  };
  const renderStrategyStore = () => {
    text("[data-strategy-status]", state.strategyConfig?.enabled ? uiCopy("已启用", "Enabled") : uiCopy("尚未部署", "Not deployed"));
    text("[data-strategy-count]", String(state.strategies.length));
    const typeSelect = $("#strategy-type");
    const enabledTemplates = (state.strategyConfig?.templates || []).filter((template) => template.enabled !== false);
    if (typeSelect && enabledTemplates.length) {
      const previous = typeSelect.value;
      typeSelect.innerHTML = enabledTemplates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)} · ${escapeHtml(template.tier || "unverified")}</option>`).join("");
      typeSelect.value = enabledTemplates.some((template) => template.id === previous) ? previous : enabledTemplates[0].id;
    }
    const templates = $(`[data-strategy-template-list]`);
    if (templates) templates.innerHTML = (state.strategyConfig?.templates || []).map((template) => uiMarkup`<article class="profile-card vault-card"><div class="section-title"><h3>${escapeHtml(template.name)}</h3><span class="tag ${template.tier === "official" ? "lime" : ""}">${escapeHtml(template.tier || "unverified")} · v${escapeHtml(template.factory_version || "—")}</span></div><p class="footer-note">${escapeHtml(template.purpose)}</p><div class="review-row"><span>控制权</span><strong>${escapeHtml(template.control_model)}</strong></div><div class="review-row"><span>审计 / 开发者费</span><strong>${escapeHtml(template.audit_status || "unverified")} / ${Number(template.developer_fee_bps || 0)} bps</strong></div><div class="review-row"><span>风险</span><strong>${escapeHtml((template.risks || []).join(" · "))}</strong></div></article>`).join("") || uiMarkup`<p class="footer-note">策略模板暂不可用。</p>`;
    text("[data-vault-registry-count]", String(state.vaultRegistry.length));
    const registry = $(`[data-vault-registry-list]`);
    if (registry) {
      registry.innerHTML = state.vaultRegistry.length ? state.vaultRegistry.map((entry) => uiMarkup`<article class="profile-card vault-card"><div class="section-title"><h3>${escapeHtml(entry.name)}</h3><span class="tag ${entry.tier === "official" ? "lime" : ""}">${escapeHtml(entry.tier)} · ${escapeHtml(entry.risk_level)} risk</span></div><div class="review-row"><span>Factory / 版本</span><strong>${escapeHtml(short(entry.factory_address))} · v${escapeHtml(entry.version)}</strong></div><div class="review-row"><span>审计状态</span><strong>${escapeHtml(entry.audit_status)}</strong></div><div class="review-row"><span>支持资产 / 开发者费</span><strong>${escapeHtml((entry.supported_assets || []).join(" · "))} / ${Number(entry.developer_fee_bps || 0)} bps</strong></div><button class="secondary" type="button" data-vault-schema-open="${escapeHtml(entry.id)}">查看动态配置与操作</button></article>`).join("") : uiMarkup`<p class="footer-note">当前没有已审核上架的社区 Factory。</p>`;
      $$(`[data-vault-schema-open]`).forEach((button) => button.addEventListener("click", () => {
        state.selectedVaultRegistryId = button.dataset.vaultSchemaOpen || "";
        state.preparedRegisteredVault = null;
        state.preparedRegisteredVaultAction = null;
        renderRegistrySchema();
      }));
    }
    renderRegistrySchema();
    const list = $(`[data-strategy-list]`);
    if (list) list.innerHTML = state.strategies.length ? state.strategies.map((item) => uiMarkup`<article class="profile-card vault-card"><div class="section-title"><h3>${escapeHtml(strategyName(item.strategy))}</h3><span class="tag lime">${escapeHtml(short(item.vault_address))}</span></div><div class="review-row"><span>链上地址</span><strong>${escapeHtml(item.vault_address)}</strong></div></article>`).join("") : `<p class="footer-note">${state.account ? uiCopy("当前钱包尚未部署策略 Vault。", "This wallet has not deployed a strategy Vault.") : uiCopy("连接钱包后读取。", "Connect wallet to load。")}</p>`;
    const actionVault = $("#strategy-action-vault");
    if (actionVault) {
      const previous = actionVault.value;
      actionVault.innerHTML = state.strategies.length ? state.strategies.map((item) => `<option value="${escapeHtml(item.vault_address)}" data-strategy-id="${Number(item.strategy_id)}">${escapeHtml(strategyName(item.strategy))} · ${escapeHtml(short(item.vault_address))}</option>`).join("") : uiMarkup`<option value="">请先部署或加载策略</option>`;
      if (state.strategies.some((item) => item.vault_address === previous)) actionVault.value = previous;
    }
    renderStrategyActionControls();
    const type = $("#strategy-type")?.value || "buyback_burn";
    const targetField = $(`[data-strategy-target-field]`);
    if (targetField) targetField.hidden = type !== "buyback_burn";
    const stakingField = $(`[data-strategy-staking-field]`);
    if (stakingField) stakingField.hidden = !["lp_dividend", "token_dividend"].includes(type);
    const selectedLp = String(state.migrationProof?.pair_address || "").toLowerCase();
    const selectedLpReady =
      state.detail?.migrated === true &&
      state.migrationProof?.router_verified === true &&
      state.migrationProof?.factory_verified === true &&
      state.migrationProof?.wrapped_native_verified === true &&
      state.migrationProof?.pair_init_hash_verified === true &&
      state.migrationProof?.lp_assignment_verified === true &&
      /^0x[0-9a-f]{40}$/.test(selectedLp) &&
      selectedLp !== ZERO_ADDRESS;
    const useSelectedLp = $(`[data-strategy-use-selected-lp]`);
    if (useSelectedLp) {
      useSelectedLp.hidden = type !== "lp_dividend";
      useSelectedLp.disabled = !selectedLpReady;
      useSelectedLp.textContent = selectedLpReady ? uiMarkup`使用 ${state.detail?.symbol || "当前项目"} LP · ${short(selectedLp)}` : "使用当前迁移项目 LP";
    }
    const lpHint = $(`[data-strategy-lp-hint]`);
    if (lpHint) lpHint.hidden = type !== "lp_dividend" || selectedLpReady;
    const unlockField = $(`[data-strategy-unlock-field]`);
    if (unlockField) unlockField.hidden = type !== "strategic_reserve";
    const preview = $(`[data-strategy-preview]`);
    const deploy = $(`[data-strategy-deploy]`);
    if (preview && deploy) {
      if (!state.preparedStrategy) {
        preview.hidden = true;
        preview.replaceChildren();
        deploy.disabled = true;
      } else {
        preview.hidden = false;
        preview.innerHTML = uiMarkup`<div class="section-title"><h3>部署快照</h3><span class="tag lime">${escapeHtml(strategyName(state.preparedStrategy.strategy))}</span></div><div class="review-row"><span>预测地址</span><strong>${escapeHtml(state.preparedStrategy.predicted_vault_address)}</strong></div><div class="review-row"><span>主资产</span><strong>${escapeHtml(state.preparedStrategy.primary_asset)}</strong></div><div class="review-row"><span>第二资产</span><strong>${escapeHtml(state.preparedStrategy.secondary_asset || "不需要")}</strong></div>${state.preparedStrategy.unlock_at ? uiMarkup`<div class="review-row"><span>解锁时间</span><strong>${escapeHtml(formatDate(Number(state.preparedStrategy.unlock_at) * 1000))}</strong></div>` : ""}<p class="footer-note">请核对模板、资产、解锁规则和预测地址后再签名。</p>`;
        deploy.disabled = !state.account || !state.strategyConfig?.enabled;
      }
    }
  };
  const strategyActions = (strategyId) => ({
    1: [["fund", "注资"], ["process", "执行回购销毁"]],
    2: [["fund", "注资"], ["publish_epoch", "发布分红快照"], ["claim", "领取快照分红"]],
    3: [["stake", "质押 LP"], ["withdraw", "退出质押"], ["fund", "注入奖励"], ["claim", "领取奖励"]],
    4: [["stake", "质押代币"], ["withdraw", "退出质押"], ["fund", "注入奖励"], ["claim", "领取奖励"]],
    5: [["fund", "注资"], ["publish_epoch", "发布空投快照"], ["claim", "领取空投"]],
    6: [["fund", "注入储备"], ["release", "到期释放"]],
    7: [["fund", "注资"], ["claim", "领取证明奖励"]],
    8: [["fund", "注资"], ["claim", "领取抽奖奖励"]],
  })[strategyId] || [];
  function renderStrategyActionControls() {
    const vaultSelect = $("#strategy-action-vault");
    const strategyId = Number(vaultSelect?.selectedOptions?.[0]?.dataset?.strategyId || 0);
    const actionSelect = $("#strategy-action-type");
    if (actionSelect) actionSelect.innerHTML = strategyActions(strategyId).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    const preview = $(`[data-strategy-action-preview]`);
    const execute = $(`[data-strategy-action-execute]`);
    if (!preview || !execute) return;
    if (!state.preparedStrategyAction) {
      preview.hidden = true;
      preview.replaceChildren();
      execute.disabled = true;
      return;
    }
    preview.hidden = false;
    preview.innerHTML = `<div class="section-title"><h3>${escapeHtml(state.preparedStrategyAction.action)}</h3><span class="tag lime">${state.preparedStrategyAction.transactions.length} 笔交易</span></div>${state.preparedStrategyAction.transactions.map((transaction, index) => `<div class="review-row"><span>${index + 1}. ${escapeHtml(transaction.label)}</span><strong>${escapeHtml(short(transaction.to))} · value ${escapeHtml(transaction.value)}</strong></div>`).join("")}<p class="footer-note">每笔交易分别签名、等待成功回执；任一失败会停止后续交易。</p>`;
    execute.disabled = !state.account || !state.preparedStrategyAction.transactions.length;
  }
  const loadStrategyConfig = async () => {
    if (!isBscFeatureChain()) {
      state.strategyConfig = { enabled: false, templates: [] };
      state.vaultRegistry = [];
      state.strategies = [];
      renderStrategyStore();
      return;
    }
    try {
      const [templates, registry] = await Promise.all([
        api("v1/pump/vault-store/templates"),
        api("v1/pump/vault-store/registry").catch(() => []),
      ]);
      state.strategyConfig = templates;
      state.vaultRegistry = Array.isArray(registry) ? registry : [];
    } catch {
      state.strategyConfig = { enabled: false, templates: [] };
      state.vaultRegistry = [];
    }
    renderStrategyStore();
  };
  const submitVaultRegistry = async () => {
    if (!state.account) await connectWallet();
    const parseSchema = (selector, label) => {
      try {
        const value = JSON.parse($(selector)?.value || "{}");
        if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
        return value;
      } catch {
        throw new Error(`${label} 必须是有效 JSON 对象`);
      }
    };
    const assets = String($("#registry-assets")?.value || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    await api("v1/pump/vault-store/registry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner_address: state.account,
        factory_address: $("#registry-address")?.value.trim() || "",
        name: $("#registry-name")?.value.trim() || "",
        version: $("#registry-version")?.value.trim() || "",
        supported_assets: assets,
        developer_fee_bps: Number($("#registry-developer-fee")?.value || 0),
        vault_data_schema: parseSchema("#registry-data-schema", "vaultDataSchema"),
        vault_ui_schema: parseSchema("#registry-ui-schema", "vaultUISchema"),
        security_contact: $("#registry-security-contact")?.value.trim() || "",
      }),
    });
    toast("Factory 已提交审核；通过前不会公开上架");
  };
  const prepareRegisteredVault = async () => {
    if (!state.account) await connectWallet();
    const entry = state.vaultRegistry.find((item) => item.id === state.selectedVaultRegistryId);
    if (!entry) throw new Error("请先选择已上架 Vault Factory");
    const values = {};
    $$(`[data-vault-schema-input]`).forEach((input) => {
      values[input.dataset.vaultSchemaInput] = input.type === "checkbox" ? input.checked : input.value;
    });
    state.preparedRegisteredVault = await api("v1/pump/vault-store/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_address: state.account, registry_id: entry.id, values }),
    });
    renderRegistrySchema();
    toast("第三方 Vault 部署交易已由已审核 Schema 编码，请核对后签名");
  };
  const executeRegisteredVault = async () => {
    if (!state.preparedRegisteredVault) return;
    await sendVaultTransaction(state.preparedRegisteredVault, "第三方 Vault 部署");
    state.preparedRegisteredVault = null;
    renderRegistrySchema();
    toast("第三方 Vault 部署交易已确认");
  };
  const prepareRegisteredVaultAction = async () => {
    if (!state.account) await connectWallet();
    const values = {};
    $$(`[data-vault-schema-action-input]`).forEach((input) => { values[input.dataset.vaultSchemaActionInput] = input.value; });
    state.preparedRegisteredVaultAction = await api("v1/pump/vault-store/action/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner_address: state.account,
        registry_id: state.selectedVaultRegistryId,
        vault_address: $("#registry-vault-address")?.value.trim() || "",
        action: $("#registry-vault-action")?.value || "",
        values,
      }),
    });
    renderRegistrySchema();
    toast("Vault 归属和动作 Schema 已验证，请核对后签名");
  };
  const executeRegisteredVaultAction = async () => {
    if (!state.preparedRegisteredVaultAction) return;
    await sendVaultTransaction(state.preparedRegisteredVaultAction, "第三方 Vault 操作");
    state.preparedRegisteredVaultAction = null;
    renderRegistrySchema();
  };
  const loadStrategies = async () => {
    if (!state.account || !state.strategyConfig?.enabled) {
      state.strategies = [];
      renderStrategyStore();
      return;
    }
    const response = await api(`v1/pump/strategies?creator_address=${encodeURIComponent(state.account)}`);
    state.strategies = Array.isArray(response) ? response : [];
    renderStrategyStore();
  };
  const prepareStrategy = async () => {
    if (state.vaultBusy) return;
    if (!state.account) await connectWallet();
    if (!state.strategyConfig?.enabled) throw new Error("Strategy Vault Factory 尚未部署");
    const strategy = $("#strategy-type")?.value || "buyback_burn";
    const body = {
      creator_address: state.account,
      strategy,
      quote_symbol: $("#strategy-quote")?.value || "BNB",
    };
    if (strategy === "buyback_burn") body.target_token_address = $("#strategy-target-token")?.value.trim() || "";
    if (["lp_dividend", "token_dividend"].includes(strategy)) body.staking_token_address = $("#strategy-staking-token")?.value.trim() || "";
    if (strategy === "strategic_reserve") body.unlock_days = Number($("#strategy-unlock-days")?.value || 30);
    state.vaultBusy = true;
    try {
      state.preparedStrategy = await api("v1/pump/strategies/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      renderStrategyStore();
      toast("策略参数已加载，请核对后签名");
    } finally {
      state.vaultBusy = false;
    }
  };
  const deployStrategy = async () => {
    if (!state.preparedStrategy || state.vaultBusy) return;
    state.vaultBusy = true;
    try {
      await sendVaultTransaction(state.preparedStrategy.transaction, "策略 Vault 部署");
      state.preparedStrategy = null;
      await loadStrategies();
      toast("策略 Vault 已部署");
    } finally {
      state.vaultBusy = false;
      renderStrategyStore();
    }
  };
  const prepareStrategyAction = async () => {
    if (state.vaultBusy) return;
    if (!state.account) await connectWallet();
    const vault = $("#strategy-action-vault")?.value || "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) throw new Error("请选择有效的策略 Vault");
    let parameters;
    try {
      parameters = JSON.parse($("#strategy-action-parameters")?.value || "{}");
      if (!parameters || Array.isArray(parameters) || typeof parameters !== "object") throw new Error();
    } catch {
      throw new Error("操作参数必须是有效 JSON 对象");
    }
    state.preparedStrategyAction = await api("v1/pump/strategies/action/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_address: state.account,
        vault_address: vault,
        action: $("#strategy-action-type")?.value || "",
        parameters,
      }),
    });
    renderStrategyActionControls();
    toast("策略操作已完成链上类型校验，请核对交易序列");
  };
  const executeStrategyAction = async () => {
    if (!state.preparedStrategyAction || state.vaultBusy) return;
    state.vaultBusy = true;
    try {
      for (const transaction of state.preparedStrategyAction.transactions) {
        await sendVaultTransaction(transaction, transaction.label || "策略操作");
      }
      state.preparedStrategyAction = null;
      renderStrategyActionControls();
      toast("策略操作全部完成");
    } finally {
      state.vaultBusy = false;
    }
  };
  const renderGrowth = () => {
    text('[data-referral-invited]', state.account && state.referral ? Number(state.referral.referred_wallets || 0) : '—');
    text('[data-referral-activated]', state.account && state.referral ? Number(state.referral.activated_wallets || 0) : '—');
    $$('[data-referral-copy-code], [data-referral-share]').forEach(node => { node.disabled = !state.account || !state.referral?.referral_code; });
    text("[data-referral-code]", state.referral?.referral_code || "—");
    text("[data-referral-counts]", state.account ? `${Number(state.referral?.referred_wallets || 0)} / ${Number(state.referral?.activated_wallets || 0)}` : "—");
    text("[data-referrer-address]", state.referral?.referrer_address ? short(state.referral.referrer_address) : uiCopy("未绑定", "Not linked"));
    const createButton = $("[data-referral-create]");
    if (createButton) createButton.textContent = state.referral?.referral_code ? "复制邀请链接" : uiCopy("生成我的邀请码", "Generate my referral code");
    const campaignList = $("[data-campaign-list]");
    if (campaignList)
      campaignList.innerHTML = state.campaigns.length
        ? state.campaigns
            .map((entry) => {
              const campaign = entry.campaign || {};
              const joined = Boolean(entry.participation_status);
              return uiMarkup`<article class="profile-card"><div class="section-title"><h3>${escapeHtml(campaign.title || "活动")}</h3><span class="tag ${joined ? "lime" : ""}">${escapeHtml(joined ? entry.participation_status : campaign.status || "active")}</span></div><p class="footer-note">${escapeHtml(campaign.description || "以活动页面展示的真实规则为准。")}</p><div class="review-row"><span>积分奖励</span><strong>${Number(campaign.points_reward || 0).toLocaleString("en-US")}</strong></div><button class="secondary" data-campaign-join="${escapeHtml(campaign.id || "")}" type="button" ${joined ? "disabled" : ""}>${joined ? "已参加" : "参加活动"}</button></article>`;
            })
            .join("")
        : uiMarkup`<p class="footer-note">当前没有开放中的活动。</p>`;
    $$("[data-campaign-join]").forEach((node) => node.addEventListener("click", () => joinCampaign(node.dataset.campaignJoin).catch((error) => toastError(error, "活动参加失败"))));
    text("[data-kol-status]", state.kol?.status || "未提交");
    const social = $("#kol-social-url");
    if (social && state.kol?.social_url && !social.value) social.value = state.kol.social_url;
    const audience = $("#kol-audience-size");
    if (audience && state.kol?.audience_size != null && !audience.value) audience.value = String(state.kol.audience_size);
    const note = $("#kol-note");
    if (note && state.kol?.note && !note.value) note.value = state.kol.note;
    $$("[data-referral-create], [data-referral-bind], [data-kol-submit]").forEach((node) => {
      node.disabled = !state.account;
    });
  };
  const loadFavorites = async () => {
    const requestSequence = ++userDataRequestSequence;
    const account = state.account;
    try {
      const favorites = await api(`v1/market/favorites?device_id=${encodeURIComponent(deviceId())}&chain_id=${encodeURIComponent(state.selectedChain)}`);
      if (requestSequence !== userDataRequestSequence || state.account !== account) return;
      state.favorites = favorites;
    } catch {
      if (requestSequence !== userDataRequestSequence || state.account !== account) return;
      state.favorites = [];
    }
    renderMyPanels();
  };
  const loadUserPanels = async () => {
    if (!state.account) return loadFavorites();
    const requestSequence = ++userDataRequestSequence;
    const account = state.account;
    const bscOnly = isBscFeatureChain();
    const [activity, favorites, alerts, points, referral, campaigns, kol, v3Rewards] = await Promise.allSettled([
      api(`v1/pump/wallet-activity?address=${encodeURIComponent(account)}&limit=500`),
      api(`v1/market/favorites?device_id=${encodeURIComponent(deviceId())}&chain_id=${encodeURIComponent(state.selectedChain)}`),
      bscOnly ? api(`v1/pump/alerts?wallet_address=${encodeURIComponent(account)}`) : Promise.resolve([]),
      bscOnly ? api(`v1/pump/points?address=${encodeURIComponent(account)}&limit=100`) : Promise.resolve(null),
      bscOnly ? api(`v1/pump/referral?wallet_address=${encodeURIComponent(account)}`) : Promise.resolve(null),
      bscOnly ? api(`v1/pump/campaigns?wallet_address=${encodeURIComponent(account)}`) : Promise.resolve([]),
      bscOnly ? api(`v1/pump/kol?wallet_address=${encodeURIComponent(account)}`) : Promise.resolve(null),
      bscOnly ? api(`v1/pump/v3-fee-rewards?wallet_address=${encodeURIComponent(account)}`) : Promise.resolve([]),
    ]);
    if (requestSequence !== userDataRequestSequence || state.account !== account) return;
    if (activity.status === "fulfilled") {
      state.myLaunches = Array.isArray(activity.value?.launches) ? activity.value.launches : [];
      state.history = Array.isArray(activity.value?.activity) ? activity.value.activity : [];
      state.walletHoldings = Array.isArray(activity.value?.holdings) ? activity.value.holdings : [];
      state.walletHoldingsComplete = activity.value?.holdings_complete === true;
      state.tradeHistoryComplete = activity.value?.trade_history_complete === true;
      state.creatorRewards = Array.isArray(activity.value?.creator_rewards) ? activity.value.creator_rewards : [];
      state.holderDividends = Array.isArray(activity.value?.holder_dividends) ? activity.value.holder_dividends : [];
    } else {
      const [launches, history] = await Promise.allSettled([api(`v1/token/my-tokens?address=${encodeURIComponent(account)}`), api(`v1/wallet/tx/history?address=${encodeURIComponent(account)}&chain_id=${encodeURIComponent(state.selectedChain)}&limit=100`)]);
      if (requestSequence !== userDataRequestSequence || state.account !== account) return;
      state.myLaunches = launches.status === "fulfilled" ? launches.value : [];
      state.history = history.status === "fulfilled" ? history.value : [];
      state.walletHoldings = [];
      state.walletHoldingsComplete = false;
      state.tradeHistoryComplete = false;
      state.creatorRewards = [];
      state.holderDividends = [];
      state.v3FeeRewards = [];
    }
    state.favorites = favorites.status === "fulfilled" ? favorites.value : [];
    state.alerts = alerts.status === "fulfilled" ? alerts.value : [];
    state.points = points.status === "fulfilled" ? points.value : null;
    state.referral = referral.status === "fulfilled" ? referral.value : null;
    state.campaigns = campaigns.status === "fulfilled" && Array.isArray(campaigns.value) ? campaigns.value : [];
    state.kol = kol.status === "fulfilled" ? kol.value : null;
    state.v3FeeRewards = v3Rewards.status === "fulfilled" && Array.isArray(v3Rewards.value) ? v3Rewards.value : [];
    renderMyPanels();
    if (!bscOnly) {
      state.vaultConfig = { enabled: false };
      state.strategyConfig = { enabled: false, templates: [] };
      state.vaults = [];
      state.strategies = [];
      renderVaults();
      renderStrategyStore();
      await loadWebhooks().catch(() => {
        state.webhooks = [];
        renderWebhooks();
      });
      return;
    }
    await loadVaults().catch((error) => {
      state.vaults = [];
      renderVaults();
      toastError(error, "Vault 数据读取失败");
    });
    await loadStrategies().catch((error) => {
      state.strategies = [];
      renderStrategyStore();
      toastError(error, "策略 Vault 读取失败");
    });
    await loadWebhooks().catch((error) => {
      state.webhooks = [];
      renderWebhooks();
      toastError(error, "Webhook 数据读取失败");
    });
  };
  const updateReferral = async (code) => {
    if (!state.account) return connectWallet();
    await assertProviderState();
    state.referral = await api("v1/pump/referral", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_address: state.account,
        ...(code ? { referral_code: code } : {}),
      }),
    });
    renderGrowth();
    toast(code ? "邀请关系已绑定" : "邀请码已生成");
  };
  const createOrCopyReferral = async () => {
    if (!state.referral?.referral_code) return updateReferral();
    await navigator.clipboard.writeText(`https://bitbt.fun/pump?ref=${encodeURIComponent(state.referral.referral_code)}`);
    toast("邀请链接已复制");
  };
  const bindReferral = async () => {
    const code = $("#referral-code-input")?.value?.trim();
    if (!code) throw new Error("请输入邀请码");
    await updateReferral(code);
  };
  const joinCampaign = async (campaignId) => {
    if (!state.account) return connectWallet();
    await assertProviderState();
    await api("v1/pump/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        wallet_address: state.account,
      }),
    });
    const campaigns = await api(`v1/pump/campaigns?wallet_address=${encodeURIComponent(state.account)}`);
    state.campaigns = Array.isArray(campaigns) ? campaigns : [];
    renderGrowth();
    toast("已参加活动");
  };
  const submitKol = async () => {
    if (!state.account) return connectWallet();
    await assertProviderState();
    const socialUrl = $("#kol-social-url")?.value?.trim();
    if (!socialUrl) throw new Error("请填写社交主页链接");
    const audienceRaw = $("#kol-audience-size")?.value?.trim() || "0";
    if (!/^\d+$/.test(audienceRaw)) throw new Error("受众数量必须是整数");
    state.kol = await api("v1/pump/kol", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_address: state.account,
        social_url: socialUrl,
        audience_size: Number(audienceRaw),
        note: $("#kol-note")?.value?.trim() || "",
      }),
    });
    renderGrowth();
    toast("KOL 申请已提交");
  };
  const bindGrowth = () => {
    $('[data-referral-copy-code]')?.addEventListener('click', async () => {
      if (!state.account || !state.referral?.referral_code) return toast('请先生成邀请码');
      try { await navigator.clipboard.writeText(state.referral.referral_code); toast('邀请码已复制'); }
      catch (error) { toastError(error, '邀请码复制失败'); }
    });
    $$('[data-referral-share]').forEach(button => button.addEventListener('click', () => {
      if (!state.account || !state.referral?.referral_code) return toast('请先生成邀请码');
      const link = `https://bitbt.fun/pump?ref=${encodeURIComponent(state.referral.referral_code)}`;
      const base = button.dataset.referralShare === 'telegram' ? 'https://t.me/share/url?url=' : 'https://twitter.com/intent/tweet?url=';
      window.open(base + encodeURIComponent(link), '_blank', 'noopener,noreferrer');
    }));
    $("[data-referral-create]")?.addEventListener("click", () => createOrCopyReferral().catch((error) => toastError(error, "邀请码操作失败")));
    $("[data-referral-bind]")?.addEventListener("click", () => bindReferral().catch((error) => toastError(error, "邀请码绑定失败")));
    $("[data-kol-submit]")?.addEventListener("click", () => submitKol().catch((error) => toastError(error, "KOL 申请提交失败")));
    try {
      const code = new URL(walletDappUrl()).searchParams.get("ref");
      const input = $("#referral-code-input");
      if (code && input) input.value = code.slice(0, 24);
    } catch {}
  };
  const bindVaults = () => {
    renderVaultRecipientRows();
    $(`[data-vault-add-recipient]`)?.addEventListener("click", () => {
      const list = $(`[data-vault-recipient-list]`);
      list?._addRow?.("", "");
      state.preparedVault = null;
      renderVaultPreview();
    });
    $(`[data-vault-prepare]`)?.addEventListener("click", () => prepareVault().catch((error) => toastError(error, "Vault 参数准备失败")));
    $(`[data-vault-deploy]`)?.addEventListener("click", () => deployVault().catch((error) => toastError(error, "Vault 部署失败")));
    $(`[data-vault-claim-all]`)?.addEventListener("click", () => claimAllVaults().catch((error) => toastError(error, "批量领取失败")));
    $("#vault-quote")?.addEventListener("change", () => {
      state.preparedVault = null;
      renderVaultPreview();
    });
    const invalidateStrategy = () => {
      state.preparedStrategy = null;
      renderStrategyStore();
    };
    $("#strategy-type")?.addEventListener("change", invalidateStrategy);
    $("#strategy-quote")?.addEventListener("change", invalidateStrategy);
    $("#strategy-target-token")?.addEventListener("input", invalidateStrategy);
    $("#strategy-staking-token")?.addEventListener("input", invalidateStrategy);
    $("#strategy-unlock-days")?.addEventListener("input", invalidateStrategy);
    $(`[data-strategy-use-selected-lp]`)?.addEventListener("click", () => {
      const pair = String(state.migrationProof?.pair_address || "").toLowerCase();
      if (state.detail?.migrated !== true || state.migrationProof?.router_verified !== true || state.migrationProof?.lp_assignment_verified !== true || !/^0x[0-9a-f]{40}$/.test(pair) || pair === ZERO_ADDRESS) {
        toast("请先打开一个迁移证明完整的项目");
        return;
      }
      const input = $("#strategy-staking-token");
      if (input) input.value = pair;
      invalidateStrategy();
      toast(`${state.detail?.symbol || "当前项目"} LP 已填入`);
    });
    $(`[data-strategy-prepare]`)?.addEventListener("click", () => prepareStrategy().catch((error) => toastError(error, "策略参数准备失败")));
    $(`[data-strategy-deploy]`)?.addEventListener("click", () => deployStrategy().catch((error) => toastError(error, "策略 Vault 部署失败")));
    $("#strategy-action-vault")?.addEventListener("change", () => {
      state.preparedStrategyAction = null;
      renderStrategyActionControls();
    });
    $("#strategy-action-type")?.addEventListener("change", () => {
      state.preparedStrategyAction = null;
      renderStrategyActionControls();
    });
    $("#strategy-action-parameters")?.addEventListener("input", () => {
      state.preparedStrategyAction = null;
      renderStrategyActionControls();
    });
    $(`[data-strategy-action-prepare]`)?.addEventListener("click", () => prepareStrategyAction().catch((error) => toastError(error, "策略操作准备失败")));
    $(`[data-strategy-action-execute]`)?.addEventListener("click", () => executeStrategyAction().catch((error) => toastError(error, "策略操作失败")));
    $(`[data-vault-registry-submit]`)?.addEventListener("click", () => submitVaultRegistry().catch((error) => toastError(error, "Factory 提交失败")));
    $(`[data-vault-schema-prepare]`)?.addEventListener("click", () => prepareRegisteredVault().catch((error) => toastError(error, "第三方 Vault 参数准备失败")));
    $(`[data-vault-schema-execute]`)?.addEventListener("click", () => executeRegisteredVault().catch((error) => toastError(error, "第三方 Vault 部署失败")));
    $("#registry-vault-action")?.addEventListener("change", () => { state.preparedRegisteredVaultAction = null; renderRegistrySchema(); });
    $(`[data-vault-schema-action-prepare]`)?.addEventListener("click", () => prepareRegisteredVaultAction().catch((error) => toastError(error, "Vault 操作准备失败")));
    $(`[data-vault-schema-action-execute]`)?.addEventListener("click", () => executeRegisteredVaultAction().catch((error) => toastError(error, "Vault 操作失败")));
  };
  const renderWebhooks = () => {
    text("[data-webhook-count]", state.webhooks.length);
    text("[data-webhook-status]", state.account ? uiCopy("SIWE 已验证", "SIWE Verified") : "连接钱包后管理");
    const list = $("[data-webhook-list]");
    if (!list) return;
    list.innerHTML = state.account ? state.webhooks.map((hook) => uiMarkup`<div class="profile-card"><div class="review-row"><span>${escapeHtml(hook.endpoint_url)}</span><strong>${hook.active ? "ACTIVE" : "PAUSED"}</strong></div><div class="review-row"><span>事件</span><strong>${escapeHtml((hook.events || []).join(" · "))}</strong></div><div class="review-row"><span>最近状态 / 失败</span><strong>${hook.last_status ?? "—"} / ${hook.failure_count ?? 0}</strong></div><button class="secondary" type="button" data-webhook-delete="${escapeHtml(hook.id)}">删除</button></div>`).join("") || uiMarkup`<p class="footer-note">尚未创建 Webhook。</p>` : uiMarkup`<p class="footer-note">连接钱包后读取。</p>`;
    $$("[data-webhook-delete]").forEach((button) => button.addEventListener("click", () => deleteWebhook(button.dataset.webhookDelete).catch((error) => toastError(error, "Webhook 删除失败"))));
  };
  const loadIntegrationStatus = async () => {
    try {
      state.integrationStatus = await api("v1/pump/integrations/status");
      text("[data-integration-status]", state.integrationStatus.database === "operational" ? "OPERATIONAL" : "DEGRADED");
      text("[data-integration-api]", `${state.integrationStatus.api_version || "v1"} / ${state.integrationStatus.database || "unknown"}`);
      text("[data-integration-services]", `${state.integrationStatus.webhooks || "unknown"} / ${state.integrationStatus.split_vaults || "unknown"} / ${state.integrationStatus.strategy_vaults || "unknown"}`);
      text("[data-integration-partner-keys]", `${Number(state.integrationStatus.partner_api_keys || 0)} configured · independently rate-limited`);
      $(`[data-integration-status]`)?.classList.toggle("lime", state.integrationStatus.database === "operational");
    } catch {
      text("[data-integration-status]", "UNAVAILABLE");
      text("[data-integration-api]", "状态接口暂不可用");
      text("[data-integration-services]", "—");
      text("[data-integration-partner-keys]", "—");
    }
  };
  const loadWebhooks = async () => {
    if (!state.account) {
      state.webhooks = [];
      renderWebhooks();
      return;
    }
    state.webhooks = await api(`v1/pump/integrations/webhooks?owner_address=${encodeURIComponent(state.account)}`);
    renderWebhooks();
  };
  const createWebhook = async () => {
    if (!state.account) return connectWallet();
    await assertProviderState();
    const endpoint = $("#webhook-endpoint")?.value?.trim();
    if (!endpoint) throw new Error("请输入 HTTPS Webhook 地址");
    const events = $$("[data-webhook-event].active")
      .map((button) => button.dataset.webhookEvent)
      .filter(Boolean);
    if (!events.length) throw new Error("至少选择一个 Webhook 事件");
    const created = await api("v1/pump/integrations/webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner_address: state.account, endpoint_url: endpoint, events }) });
    const secret = $("[data-webhook-secret]");
    if (secret) {
      secret.hidden = false;
      secret.textContent = `签名密钥（仅显示一次，请立即保存）：${created.signing_secret}`;
    }
    await loadWebhooks();
    toast("Webhook 已创建");
  };
  const deleteWebhook = async (id) => {
    await assertProviderState();
    await api("v1/pump/integrations/webhooks", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner_address: state.account, id }) });
    await loadWebhooks();
    toast("Webhook 已删除");
  };
  const bindDeveloperCenter = () => {
    $$("[data-webhook-event]").forEach((button) => button.addEventListener("click", () => button.classList.toggle("active")));
    $("[data-webhook-create]")?.addEventListener("click", () => createWebhook().catch((error) => toastError(error, "Webhook 创建失败")));
    renderWebhooks();
    void loadIntegrationStatus();
  };
  const serviceFeeLabel = (raw) => {
    try {
      return `${formatUnits(BigInt(raw || "0"), 18)} BNB`;
    } catch {
      return "—";
    }
  };
  const filteredPerpetualActivity = () => state.perpActivity.filter(item => {
    const filter = state.perpActivityFilter;
    if (filter === 'all') return true;
    if (filter === 'bsc' || filter === 'robinhood') return filter === state.selectedChain;
    if (filter === 'open') return item.eventType === 'open';
    if (filter === 'closed') return ['close', 'liquidate', 'expire'].includes(item.eventType);
    return false;
  });
  const initializePerpetualForms = () => {
    const add = $('[data-panel="perps-add-contract"]');
    const pool = $('[data-panel="perps-create-pool"]');
    if (!add || !pool || add.dataset.liveServiceShell) return;
    add.dataset.liveServiceShell = pool.dataset.liveServiceShell = 'true';
    for (const panel of [add, pool]) {
      panel.querySelectorAll('[data-toast], [data-action-confirm]').forEach(node => { node.removeAttribute('data-toast'); node.removeAttribute('data-action-confirm'); });
    }
    add.querySelector('.page-guide span').textContent = uiCopy("无需人工审批。创建时同步存入最低 Quote LP；系统校验现货流动性与 Oracle 后启用市场。", "No manual approval. The minimum quote LP is deposited during creation; the market is enabled after spot-liquidity and oracle checks pass.");
    add.querySelectorAll('[data-contract-chain]').forEach(node => { node.disabled = true; node.title = '请通过页头切换网络；当前永续创建仅开放 BSC'; node.querySelector('.tag').textContent = node.dataset.contractChain === 'bsc' ? uiCopy("当前支持", "Supported") : uiCopy("未开放", "Not open"); });
    const address = add.querySelector('#perps-contract-address');
    address.value = ''; address.placeholder = '0x...'; address.autocomplete = 'off';
    const verify = add.querySelector('[data-verify-contract]');
    verify.removeAttribute('data-verify-contract'); verify.textContent = uiCopy("核对安全参数", "Check safety parameters");
    verify.addEventListener('click', () => add.querySelectorAll('.contract-shell')[1].scrollIntoView({ block:'start' }));
    const preview = add.querySelector('[data-contract-preview]');
    preview.querySelector('img').src = './assets/tokens/generic.svg'; preview.querySelector('img').alt = 'MEME';
    preview.querySelector('strong').textContent = uiCopy("待输入并校验合约", "Enter a contract to validate"); preview.querySelector('small').textContent = uiCopy("校验在创建交易签名前执行", "Validation runs before signing the creation transaction"); preview.querySelector('.tag').textContent = uiCopy("待校验", "Pending validation");
    address.addEventListener('input', () => {
      const token = String(address.value || '').trim();
      preview.querySelector('strong').textContent = /^0x[0-9a-fA-F]{40}$/.test(token) ? short(token) : uiCopy("待输入并校验合约", "Enter a contract to validate");
      preview.querySelector('small').textContent = uiCopy("将自动套用默认安全模板；创建后保持未开放", "The default safety template is applied automatically; the new market starts disabled");
      preview.querySelector('.tag').textContent = uiCopy("待链上校验", "Pending on-chain validation");
    });
    add.querySelector('.eligibility-grid').innerHTML = [uiCopy("禁止零地址及报价币自身", "Zero address and the quote token itself are not allowed"),uiCopy("受信任 Oracle", "Trusted oracle"),uiCopy("已注册安全模板", "Registered safety template"),uiCopy("链上及后端双重校验", "Validated on-chain and by the backend")].map(label => `<div class="eligibility-item">${label}</div>`).join('');
    const settings = add.querySelectorAll('.contract-shell')[1];
    settings.querySelector('p').textContent = uiCopy("任意 ERC-20 自动使用系统默认安全模板；创建后保持未开放，Oracle、注资和启用条件全部满足后才可交易。", "Any ERC-20 uses the system default safety template. It remains disabled until oracle, funding and activation checks all pass."); settings.querySelector('.tag').textContent = uiCopy("默认安全模板", "Default safety template");
    settings.querySelectorAll('select,input').forEach((node, index) => { node.disabled = true; node.dataset.serviceSetting = String(index); if (node.tagName === 'SELECT') node.innerHTML = '<option>等待安全配置</option>'; else node.value = '等待安全配置'; });
    const direct = add.querySelector('.direct-chain-flow');
    direct.querySelector('p').textContent = uiCopy("平台费 0 BNB；网络 Gas 由钱包实时估算，确认后才发送交易。", "Platform fee 0 BNB; network Gas is estimated by your wallet. The transaction is sent only after confirmation.");
    direct.querySelector('.plain-summary').dataset.serviceSummary = '';
    direct.querySelectorAll('.execution-path span')[2].textContent = uiCopy("创建时注入最低 LP 并等待自动启用", "Deposit the minimum LP during creation and await automatic activation");
    const addButtons = direct.querySelectorAll('.flow-actions button');
    addButtons[0].removeAttribute('data-open'); addButtons[0].dataset.perpServiceSubmit = 'add_contract';
    addButtons[1].dataset.open = 'perps-create-pool'; addButtons[1].textContent = uiCopy("已有市场，前往注资", "Existing market? Deposit liquidity");
    pool.querySelector('.appbar .tag').textContent = uiCopy("链上聚合 LP", "On-chain pooled LP");
    pool.querySelector('.page-title p').textContent = uiCopy("为已有市场可选追加 Quote Token 流动性；首次创建已经存入最低 LP。", "Optionally add quote-token liquidity to an existing market; the minimum LP was already deposited during creation.");
    pool.querySelector('.page-guide span').textContent = uiCopy("当前每个市场使用聚合 LP 池。独立做市池和自选风控方案尚未开放，不会创建虚假的独立池。", "Each market uses a pooled LP. Independent market-making pools and custom risk plans are not available.");
    pool.querySelectorAll('[data-pool-role], [data-pool-preset]').forEach(node => { node.disabled = true; node.title = '使用所选市场的现有协议规则'; });
    pool.querySelector('[data-pool-role="retail"] strong').textContent = uiCopy("聚合 LP 池", "Pooled LP");
    pool.querySelector('[data-pool-role="retail"] small').textContent = uiCopy("按实际报价资产和链上份额分享手续费，承担对手盘盈亏。", "Share fees and counterparty profit or loss using actual quote assets and on-chain shares.");
    pool.querySelector('[data-pool-role="maker"] .tag').textContent = uiCopy("未开放", "Not open");
    pool.querySelectorAll('[data-pool-preset] em').forEach(node => { node.textContent = uiCopy("以所选市场为准", "Determined by the selected market"); });
    const risk = pool.querySelectorAll('.pool-form-card')[0]; risk.querySelector('p').textContent = uiCopy("LP 注资不能修改现有市场杠杆、资金费率或仓位上限。", "LP deposits cannot change market leverage, funding rates or position limits.");
    risk.querySelector('.form-group label').textContent = uiCopy("市场最高杠杆（只读）", "Market maximum leverage (read-only)");
    pool.querySelector('#pool-leverage').disabled = true;
    pool.querySelector('.auto-config-list').innerHTML = [uiCopy("多空容量按市场限制", "Long and short capacity follows market limits"),uiCopy("强平遵循协议规则", "Liquidation follows protocol rules"),uiCopy("资金费率按当前配置", "Funding follows current configuration"),uiCopy("单账户上限不可由 LP 修改", "LPs cannot change per-account limits")].map(label => `<div>${label}</div>`).join('');
    const funds = pool.querySelectorAll('.pool-form-card')[1]; funds.querySelector('p').textContent = uiCopy("服务费与注资分开处理；注资资产进入合约，不进入平台收款地址。", "Service fees and liquidity deposits are separate. Deposits go to the contract, not the platform fee recipient.");
    const selects = funds.querySelectorAll('select'); selects[0].disabled = true; selects[0].innerHTML = uiCopy("<option>BNB Chain（当前支持）</option>", "<option>BNB Chain（Supported）</option>");
    selects[1].id = 'perps-pool-market'; selects[1].innerHTML = '<option value="">等待真实市场</option>';
    const amount = pool.querySelector('[data-pool-funding]'); amount.id = 'perps-pool-amount'; amount.value = ''; amount.placeholder = '0.00';
    amount.closest('.form-group').querySelector('label span').textContent = uiCopy("所选 Quote Token", "Selected quote token");
    const reserve = pool.querySelector('[data-pool-reserve]'); reserve.disabled = true; reserve.value = '不单独收取'; reserve.closest('.form-group').querySelector('label').textContent = uiCopy("单独风险储备（当前不收取）", "Separate risk reserve (not currently collected)");
    funds.querySelectorAll('.advanced-content select').forEach(node => { node.disabled = true; node.innerHTML = '<option>当前市场协议规则</option>'; });
    pool.querySelector('.pool-summary-hero').dataset.poolRealSummary = '';
    pool.querySelector('.pool-split').dataset.poolRealRules = '';
    pool.querySelector('.quote').dataset.poolRealFees = '';
    const buttons = pool.querySelectorAll('.pool-summary-card > button');
    buttons[0].removeAttribute('data-open'); buttons[0].dataset.perpServiceSubmit = 'create_pool'; buttons[0].textContent = uiCopy("授权并追加流动性", "Authorize and add liquidity");
    buttons[1].dataset.open = 'perps-pool'; buttons[1].textContent = uiCopy("查看当前池详情", "View current pool");
    const resume = document.createElement('div'); resume.dataset.perpPoolResumable = ''; pool.querySelector('.pool-builder-grid').before(resume);
    selects[1].addEventListener('change', () => {
      const marketId = parsePerpMarketId(String(selects[1].value).trim());
      const market = marketId == null ? null : state.perpMarkets.find((item) => Number(item.marketId) === marketId);
      state.selectedPerpMarketId = marketId;
      state.perpPoolTarget = market ? { marketId, tokenAddress: String(market.tokenAddress || "").toLowerCase() } : null;
      renderPerpetualServices();
    });
    amount.addEventListener('input', renderPerpetualServices);
  };
  const renderPerpetualServices = () => {
    if (!ui20260911) return;
    initializePerpetualForms();
    const config = state.perpConfig || {};
    const feeRecipient = config.serviceFeeRecipient || "—";
    // The address input remains mounted so refreshes preserve the user's draft.
    const poolAmountDraft = String($("#perps-pool-amount")?.value || "");
    // A newly created market is selected in state before this panel refreshes.
    // Prefer that explicit selection over the stale value still mounted in the
    // pool form; otherwise market #0 can be submitted for a newly created #1.
    const boundPoolTarget = state.perpPoolTarget;
    const boundPoolMarket = boundPoolTarget == null ? null : state.perpMarkets.find((market) =>
      Number(market.marketId) === Number(boundPoolTarget.marketId)
      && String(market.tokenAddress || "").toLowerCase() === String(boundPoolTarget.tokenAddress || "").toLowerCase());
    const selectedMarketId = boundPoolMarket?.marketId ?? state.selectedPerpMarketId;
    const poolMarketDraft = selectedMarketId != null
      && state.perpMarkets.some((market) => Number(market.marketId) === Number(selectedMarketId))
      ? String(selectedMarketId)
      : String($("#perps-pool-market")?.value || "");
    const marketOptions = state.perpMarkets.length
      ? `${uiCopy('<option value="">请选择真实市场</option>', '<option value="">Select a real market</option>')}${state.perpMarkets.map((market) => `<option value="${Number(market.marketId)}" ${String(market.marketId) === poolMarketDraft ? "selected" : ""}>${escapeHtml(perpetualPairLabel(market))} · #${Number(market.marketId)}</option>`).join("")}`
      : uiCopy("<option value=\"\">当前没有可用市场</option>", "<option value=\"\">No markets available</option>");
    const resumablePools = state.perpServiceRequests
      .filter((request) => request.requestType === "create_pool" && request.status === "paid")
      .map((request) => uiMarkup`<article class="risk-note"><strong>服务费已支付 · Market #${Number(request.payload?.marketId)}</strong><span>LP 注资尚未完成，可继续执行且不会再次收取平台服务费。</span><button class="secondary" type="button" data-perp-pool-resume="${escapeHtml(request.requestId)}">继续链上注资</button></article>`)
      .join("");
    const addPanel = $('[data-panel="perps-add-contract"]');
    if (addPanel) {
      const values = [uiCopy("受信任 Oracle（签名前校验）", "Trusted oracle (checked before signing)"), uiCopy("受信任 Quote Token", "Trusted quote token"), '—', String(config.minLiquidityUsd || '—') + ' USD'];
      addPanel.querySelectorAll('[data-service-setting]').forEach(node => {
        const value = values[Number(node.dataset.serviceSetting)];
        if (node.tagName === 'SELECT') node.options[0].textContent = value; else node.value = value;
      });
      const protocolCap = Number(config?.maxLeverage || 0);
      const creationCap = config?.internalPilot ? Math.min(protocolCap || 4, 4) : protocolCap;
      const leverageLabel = creationCap > 0 ? `${creationCap}×` : '—';
      const leverageField = addPanel.querySelector('[data-service-setting="2"]');
      if (leverageField) {
        if (leverageField.tagName === 'SELECT') leverageField.options[0].textContent = leverageLabel;
        else leverageField.value = leverageLabel;
      }
      addPanel.querySelector('[data-service-summary]').textContent = uiCopy("签名钱包：", "Signing wallet: ") + (state.account ? short(state.account) : uiCopy("未连接", "Not connected")) + uiCopy(" · 目标合约：", " · Target contract: ") + (config.contractAddress || uiCopy('等待配置', 'Awaiting configuration')) + uiCopy(" · 创建时同步存入最低 LP", " · Minimum LP deposited during creation");
      const submit = addPanel.querySelector('[data-perp-service-submit]');
      submit.disabled = Boolean(state.perpServiceBusy || !config.enabled || !config.permissionlessMarketCreation || !isBscFeatureChain());
      submit.textContent = state.perpServiceBusy ? uiCopy("正在校验…", "Validating…") : state.account ? uiCopy("校验并由钱包创建市场", "Validate and create with wallet") : uiCopy("连接钱包后创建", "Connect wallet to create");
    }
    const poolPanel = $('[data-panel="perps-create-pool"]');
    if (poolPanel) {
      const select = poolPanel.querySelector('#perps-pool-market');
      // Preserve form elements and focus; refresh options only if the market list changes.
      if (select.dataset.optionsHtml !== marketOptions) {
        select.innerHTML = marketOptions; select.dataset.optionsHtml = marketOptions;
      }
      if (state.perpMarkets.some(item => String(item.marketId) === poolMarketDraft)) select.value = poolMarketDraft;
      const chosen = state.perpMarkets.find(item => String(item.marketId) === select.value);
      const leverage = Number(chosen?.maxLeverage || config.maxLeverage || 0);
      poolPanel.querySelector('#pool-leverage').value = String(leverage || 1);
      poolPanel.querySelectorAll('[data-pool-preset-label]').forEach(node => { node.textContent = uiCopy("使用市场现有规则", "Use current market rules"); });
      const currentLiquidity = chosen
        ? formatUnits(BigInt(chosen.liquidityRaw || '0'), Number(chosen.quoteDecimals || 18))
        : '0';
      poolPanel.querySelector('[data-pool-real-summary]').textContent = chosen
        ? perpetualPairLabel(chosen) + uiCopy(' · 当前 LP ', ' · Current LP ') + currentLiquidity + ' ' + (chosen.quoteTokenSymbol || 'QUOTE') + (poolAmountDraft ? uiCopy(' · 本次追加 ', ' · Add ') + poolAmountDraft : '')
        : uiCopy("请选择市场", "Select a market");
      poolPanel.querySelector('[data-pool-real-rules]').innerHTML = uiCopy("<div><span>最高杠杆</span><strong>", "<div><span>Maximum leverage</span><strong>") + (leverage || '—') + uiCopy("×</strong></div><div><span>市场状态</span><strong>", "×</strong></div><div><span>Market status</span><strong>") + (chosen?.enabled ? (chosen.closeOnly ? uiCopy("只减仓", "Reduce-only") : uiCopy("开放", "Open")) : uiCopy("未开放", "Not open")) + uiCopy("</strong></div><div><span>退出条件</span><strong>有未平仓量时锁定</strong></div>", "</strong></div><div><span>Withdrawal conditions</span><strong>Locked while positions are open</strong></div>");
      poolPanel.querySelector('[data-pool-real-fees]').innerHTML = uiCopy("<div><span>平台服务费</span><strong>", "<div><span>Platform service fee</span><strong>") + escapeHtml(serviceFeeLabel(config.createPoolFeeWei)) + uiCopy("</strong></div><div><span>统一收款地址</span><strong>", "</strong></div><div><span>Fee recipient</span><strong>") + escapeHtml(short(feeRecipient)) + uiCopy("</strong></div><div><span>Quote Token 授权</span><strong>仅输入金额</strong></div><div><span>网络 Gas</span><strong>钱包实时估算</strong></div>", "</strong></div><div><span>Quote-token allowance</span><strong>Entered amount only</strong></div><div><span>Network Gas</span><strong>Estimated by wallet</strong></div>");
      poolPanel.querySelector('[data-perp-pool-resumable]').innerHTML = resumablePools;
      const submit = poolPanel.querySelector('[data-perp-service-submit]');
      submit.disabled = Boolean(state.perpServiceBusy || !chosen || !isBscFeatureChain());
      submit.textContent = state.perpServiceBusy ? uiCopy("正在提交…", "Submitting…") : state.account ? uiCopy("授权并追加流动性（可选）", "Authorize and add liquidity (optional)") : uiCopy("连接钱包后追加流动性", "Connect wallet to add liquidity");
    }
    const market = state.selectedPerpMarketId == null ? null : selectedPerpMarket();
    const poolDetail = $('[data-panel="perps-pool"]');
    if (poolDetail) {
      const set = (selector, value) => poolDetail.querySelectorAll(selector).forEach(node => { node.textContent = value; });
      const unit = market?.quoteToken || 'QUOTE';
      const amount = raw => market && raw != null ? formatUnits(BigInt(raw), Number(market.quoteDecimals || 18)) : '—';
      set('.pool-identity h2', uiMarkup`${market ? perpetualPairLabel(market) : '—'} · 聚合池 #${market ? Number(market.marketId) : '—'}`);
      set('.pool-identity p', uiMarkup`${selectedNetwork().shortName} · 链上聚合 LP 池`);
      const logo = poolDetail.querySelector('.pool-identity img');
      if (logo) {
        const logoUrl = market?.tokenLogoUrl || '';
        logo.hidden = !logoUrl;
        if (logoUrl) { logo.src = logoUrl; logo.alt = market?.tokenSymbol || ''; }
        let letter = logo.nextElementSibling;
        if (!letter?.classList.contains('perps-letter-logo')) {
          letter = logo.ownerDocument.createElement('span');
          letter.className = 'perps-letter-logo';
          logo.after(letter);
        }
        letter.hidden = Boolean(logoUrl) || !market?.tokenSymbol;
        letter.textContent = String(market?.tokenSymbol || '').charAt(0).toUpperCase();
      }
      const summaries = [...poolDetail.querySelectorAll('.pool-identity .plain-summary span')];
      [uiMarkup`${unit} 结算`, uiCopy("LP 按链上份额记账", "LP accounting uses on-chain shares"), uiCopy("资金可能亏损", "Funds are at risk")].forEach((label, i) => { if (summaries[i]) summaries[i].textContent = label; });
      set('.pool-health > strong', market?.enabled ? (market.closeOnly ? uiCopy("只减仓", "Reduce-only") : uiCopy("市场已启用", "Market enabled")) : uiCopy("市场未开放", "MarketNot open"));
      set('.pool-health > small', config.statusNote ? literalCopy(config.statusNote) : uiCopy('具体操作仍须通过最新合约校验', 'Each operation must pass current contract validation'));
      const metricValues = [amount(market?.liquidityRaw), amount(market?.lockedNotionalRaw), '—', '—'];
      poolDetail.querySelectorAll('.pool-metrics strong').forEach((node, i) => { node.textContent = metricValues[i] || '—'; });
      set('.depth-head h3', uiCopy("多空当前未平仓量", "Current long and short open interest"));
      set('.depth-head p', uiCopy("展示真实持仓分布，不把名义持仓伪装为可成交深度。", "Shows actual position distribution. Notional exposure is not executable market depth."));
      let longPercent = 0, shortPercent = 0;
      if (market) {
        const long = BigInt(market.longNotionalRaw || '0'), short = BigInt(market.shortNotionalRaw || '0'), total = long + short;
        if (total > 0n) { longPercent = Number(long * 10000n / total) / 100; shortPercent = 100 - longPercent; }
      }
      const longBar = poolDetail.querySelector('.depth-bar .long'), shortBar = poolDetail.querySelector('.depth-bar .short');
      if (longBar) longBar.style.width = `${longPercent}%`;
      if (shortBar) shortBar.style.width = `${shortPercent}%`;
      set('.depth-labels .up', uiMarkup`多头 ${amount(market?.longNotionalRaw)} ${unit}`);
      set('.depth-labels .down', uiMarkup`空头 ${amount(market?.shortNotionalRaw)} ${unit}`);
      const riskValues = [market ? `${Number(market.maxLeverage)}×` : '—', '—', '—', '—', market?.oracleAddress || market?.primaryOracle || '—'];
      poolDetail.querySelectorAll('.depth-card .review-row strong').forEach((node, i) => { node.textContent = riskValues[i] || '—'; });
      set('.participant-card .form-card-title p', uiCopy("暂未提供全部 LP 名册，仅显示当前钱包已加载的份额。", "The full LP roster is unavailable. Showing loaded shares for this wallet only."));
      set('.participant-card .form-card-title .tag', uiCopy("当前钱包", "Current wallet"));
      const participants = [...poolDetail.querySelectorAll('.participant-row')];
      participants.slice(1).forEach(node => node.remove());
      if (participants[0]) participants[0].innerHTML = uiMarkup`<strong>${escapeHtml(state.account ? short(state.account) : uiCopy("未连接", "Not connected"))}</strong><span>原始份额</span><strong>${escapeHtml(state.account && state.perpPosition?.liquiditySharesRaw != null ? String(state.perpPosition.liquiditySharesRaw) : '—')}</strong>`;
      const deposit = poolDetail.querySelector('.participant-card > .primary');
      const withdraw = poolDetail.querySelector('.participant-card > .secondary');
      if (deposit) { deposit.removeAttribute('data-toast'); deposit.dataset.perpShortcut = 'deposit_liquidity'; deposit.textContent = uiMarkup`注入 ${unit} 成为对手方`; }
      if (withdraw) { withdraw.removeAttribute('data-toast'); withdraw.dataset.perpShortcut = 'withdraw_liquidity'; withdraw.textContent = uiCopy("查看退出规则并申请退出", "View rules and request withdrawal"); }
      const copy = poolDetail.querySelector('[data-perp-pool-share], [aria-label="分享池子"]');
      if (copy) { copy.removeAttribute('data-toast'); copy.dataset.perpPoolShare = ''; copy.title = '复制网络、市场编号和代币地址'; copy.disabled = !market; }
      const settings = poolDetail.querySelector('[data-perp-pool-settings], [aria-label="池子设置"]');
      if (settings) { settings.removeAttribute('data-toast'); settings.dataset.perpPoolSettings = ''; settings.dataset.open = 'perpetual'; }
      set('.perps-risk span', uiCopy("池子不是保本产品。LP 承担交易者盈利、穿仓、预言机及极端行情风险；退出与注资须符合链上条件，页面不会修改风控参数。", "Capital is not guaranteed. LPs bear trader profits, insolvency, oracle and extreme-market risks. Deposits and withdrawals must meet on-chain conditions; this page does not override risk settings."));
    }
    const activityPanel = $('[data-panel="perps-onchain"]');
    if (activityPanel) {
      // Keep the delivered page shell. Refresh only API-bound slots: replacing
      // the whole panel previously erased its original layout and focused DOM.
      const filteredActivity = filteredPerpetualActivity();
      const set = (selector, value) => {
        const node = activityPanel.querySelector(selector);
        if (node) node.textContent = value;
      };
      const historyGuide = uiCopy("显示当前钱包已索引的真实事件和实时未平仓位；历史未回补。未提供的价格、杠杆和保证金显示 —，不使用原型数据。", "Shows indexed events and live open positions for this wallet; historical data is not backfilled. Missing prices, leverage and collateral show —, never sample data.");
      set('.page-guide span', historyGuide);
      set('.onchain-intro h1', uiCopy('每一笔合约交互，都有链上凭证。', 'Every contract interaction has on-chain proof.'));
      set('.onchain-intro p', historyGuide);
      set('.onchain-sync span', 'V11 EVENT FEED');
      set('.onchain-sync strong', uiCopy('BNB Chain 索引', 'BNB Chain index'));
      set('.onchain-sync small', uiCopy('数据来自当前钱包的已索引事件', 'Data comes from indexed events for this wallet'));
      const metrics = [...activityPanel.querySelectorAll('.record-overview > div, .onchain-kpis > article')];
      const values = [
        [uiCopy("已加载记录", "Loaded records"), String(state.perpActivity.length)],
        [uiCopy("开仓 / 当前仓位", "Opens / current positions"), String(state.perpActivity.filter(item => item.eventType === 'open').length)],
        [uiCopy("平仓 / 清算 / 结算", "Closures / liquidations / settlements"), String(state.perpActivity.filter(item => item.eventType !== 'open').length)],
        [uiCopy("当前钱包", "Current wallet"), state.account ? short(state.account) : uiCopy("未连接", "Not connected")],
      ];
      metrics.forEach((node, index) => {
        const value = values[index];
        if (!value) return;
        const label = node.matches('.onchain-kpi') ? node.querySelector('div > span') : node.querySelector('span');
        const metric = node.matches('.onchain-kpi') ? node.querySelector('div > strong') : node.querySelector('strong');
        if (label) label.textContent = value[0];
        if (metric) metric.textContent = value[1];
        const note = node.matches('.onchain-kpi') ? node.querySelector('div > small') : node.querySelector('small');
        if (note) note.textContent = uiCopy('仅统计当前已加载数据', 'Loaded data only');
      });
      const explainer = activityPanel.querySelector('.onchain-explainer span');
      if (explainer) explainer.textContent = uiCopy('当前只展示 BNB Chain V11 已索引记录；Keeper 待命是正常按需状态，不代表后台故障。', 'Only indexed BNB Chain V11 records are shown. Keeper standby is a normal on-demand state, not a backend failure.');
      const controls = activityPanel.querySelector('.record-control-bar');
      if (controls && !controls.dataset.liveActivityControls) {
        controls.dataset.liveActivityControls = 'true';
        controls.innerHTML = uiMarkup`<div class="record-filter-block"><span>记录类型</span><div class="record-filter-group" aria-label="记录类型筛选"><button class="active" type="button" data-record-filter="all">全部</button><button type="button" data-record-filter="open">开仓</button><button type="button" data-record-filter="closed">平仓 / 清算 / 结算</button></div></div><button class="secondary record-export" type="button"><i class="ico" style="--icon:url('./assets/icons/lucide/arrow-down.svg')"></i>导出 CSV</button>`;
      }
      const refresh = activityPanel.querySelector('[data-perp-activity-refresh], .appbar button[aria-label="刷新记录"]');
      if (refresh) { refresh.removeAttribute('data-toast'); refresh.dataset.perpActivityRefresh = ''; }
      activityPanel.querySelectorAll('[data-record-filter]').forEach(button => {
        const filter = button.dataset.recordFilter;
        button.dataset.perpActivityFilter = filter;
        // Event history does not currently include trade direction. Do not
        // infer long/short from event type or pretend unsupported data exists.
        button.disabled = ['long', 'short'].includes(filter);
        button.title = button.disabled ? '逐笔事件接口尚未提供多空方向，暂不可按方向筛选' : '';
        button.classList.toggle('active', state.perpActivityFilter === filter);
      });
      const exportButton = activityPanel.querySelector('.ledger-toolbar > button');
      const modernExportButton = exportButton || activityPanel.querySelector('.record-export');
      if (modernExportButton) {
        modernExportButton.removeAttribute('data-toast');
        modernExportButton.dataset.perpActivityExport = '';
        modernExportButton.disabled = !filteredActivity.length;
        modernExportButton.title = '导出当前筛选下已加载的事件，不代表全部历史';
      }
      const historyDateLabel = (value, currentPosition) => {
        if (currentPosition) return uiCopy('当前持仓', 'Open positions');
        if (value === null || value === undefined || value === '') return uiCopy('日期未知', 'Unknown date');
        const date = new Date(value || 0);
        if (!Number.isFinite(date.getTime())) return uiCopy('日期未知', 'Unknown date');
        const timeZone = typeof displayTimeZone === 'function' ? displayTimeZone() : undefined;
        const parts = new Intl.DateTimeFormat('en-CA', {
          ...(timeZone ? { timeZone } : {}), year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
        return `${parts.year}/${parts.month}/${parts.day}`;
      };
      const groups = new Map();
      filteredActivity.forEach(item => {
        const key = historyDateLabel(item.updatedAt, item.currentPosition === true);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      const rows = [...groups.entries()].map(([dateLabel, items]) => uiMarkup`<section class="wallet-history-group">
        <h2>${escapeHtml(dateLabel)}</h2>
        <div class="wallet-history-list">${items.map(item => {
        const itemMarket = state.perpMarkets.find(candidate => Number(candidate.marketId) === Number(item.marketId));
        const hash = String(item.lastTxHash || '');
        const validHash = /^0x[0-9a-fA-F]{64}$/.test(hash);
        const currentPosition = item.currentPosition === true;
        const label = currentPosition
          ? uiCopy('当前未平仓位', 'Open position')
          : ({ open: uiCopy('开仓', 'Opened'), close: uiCopy('平仓', 'Closed'), liquidate: uiCopy('清算', 'Liquidated'), expire: uiCopy('到期结算', 'Expired') }[item.eventType] || uiCopy('合约事件', 'Contract event'));
        const pair = itemMarket ? perpetualPairLabel(itemMarket) : `Market #${Number(item.marketId)}`;
        const quoteUnit = itemMarket?.quoteTokenSymbol || 'QUOTE';
        const rawDelta = item.quoteDeltaRaw == null ? '' : String(item.quoteDeltaRaw);
        const hasDelta = /^-?\d+$/.test(rawDelta);
        const delta = hasDelta ? BigInt(rawDelta) : 0n;
        const amount = hasDelta ? `${delta > 0n ? '+' : ''}${formatUnits(delta, Number(itemMarket?.quoteDecimals || 18))} ${quoteUnit}` : label;
        const amountClass = hasDelta ? (delta > 0n ? 'up' : delta < 0n ? 'down' : '') : (item.eventType === 'open' || currentPosition ? 'up' : '');
        const contract = short(state.perpConfig?.contractAddress || '');
        const body = uiMarkup`<span class="wallet-history-icon" aria-hidden="true"><i class="ico" style="--icon:url('./assets/icons/lucide/file-signature.svg')"></i></span>
          <span class="wallet-history-main"><strong>${uiCopy('合约交互', 'Contract interaction')}</strong><small>${escapeHtml(label)} · ${escapeHtml(pair)}</small><small>${escapeHtml(contract)} · ${uiCopy('区块', 'Block')} #${Number(item.blockNumber).toLocaleString('en-US')}${validHash ? ` · ${escapeHtml(short(hash))}` : ''}</small></span>
          <span class="wallet-history-value ${amountClass}"><strong>${escapeHtml(amount)}</strong><small>${currentPosition ? uiCopy('点击前往平仓', 'Tap to close') : validHash ? uiCopy('查看链上详情', 'View on-chain') : uiCopy('交易哈希不可用', 'Transaction hash unavailable')}</small></span>
          <span class="wallet-history-chevron" aria-hidden="true"><i class="ico sm" style="--icon:url('./assets/icons/lucide/chevron-right.svg')"></i></span>`;
        return currentPosition
          ? uiMarkup`<button class="onchain-row wallet-history-row" type="button" data-perp-close-market="${Number(item.marketId)}">${body}</button>`
          : validHash
            ? uiMarkup`<a class="onchain-row wallet-history-row" href="${escapeHtml(`${NETWORKS.bsc.explorer}/tx/${hash}`)}" target="_blank" rel="noopener noreferrer">${body}</a>`
            : uiMarkup`<div class="onchain-row wallet-history-row wallet-history-row-static">${body}</div>`;
      }).join('')}</div></section>`).join('');
      const ledger = activityPanel.querySelector('.onchain-ledger');
      if (ledger) ledger.innerHTML = rows || `<p class="footer-note">${!isBscFeatureChain() ? '当前网络尚无永续事件索引。' : !state.account ? uiCopy("请连接钱包查看自己的交易记录。", "Connect your wallet to view your trades.") : state.perpHistoryBusy ? '正在加载逐笔记录…' : '当前筛选暂无已索引事件；这不代表钱包没有历史交易。'}</p>`;
      const ledgerMeta = activityPanel.querySelector('.ledger-meta');
      if (ledgerMeta) ledgerMeta.innerHTML = uiMarkup`<span>当前显示 <strong>${filteredActivity.length}</strong> 条已加载记录</span><span><i></i>BNB Chain V11 · 以链上索引为准</span>`;
      const errors = Object.values(state.perpReadErrors).filter(Boolean).join('；');
      const footer = activityPanel.querySelector('.ledger-foot > span');
      if (footer) {
        footer.dataset.perpReadError = '';
        footer.setAttribute('role', 'status');
        footer.textContent = errors || uiCopy('仅展示已加载事件；区块确认与索引存在延迟。缺失字段可在区块浏览器核验。', 'Only loaded events are shown. Confirmations and indexing may lag. Verify missing fields in the explorer.');
      }
      const more = activityPanel.querySelector('.ledger-foot > button');
      if (more) {
        more.removeAttribute('data-toast');
        more.dataset.perpHistoryMore = '';
        more.disabled = state.perpHistoryBusy || !state.perpHistoryCursor;
        more.textContent = state.perpHistoryBusy ? '加载中…' : state.perpHistoryCursor ? uiCopy("加载更多", "Load more") : uiCopy("已加载完毕", "All loaded");
      }
    }
  };
  const loadPerpetualServiceData = async () => {
    const current = beginPerpRead('services', false);
    if (!isBscFeatureChain()) {
      state.perpActivity = [];
      state.perpServiceRequests = [];
      state.perpIndexedPositions = [];
      renderPerpetualServices();
      return;
    }
    const wallet = state.account;
    const [positions, services] = await Promise.allSettled([
      api('v1/pump/perpetual/activity?limit=200'),
      wallet ? api(`v1/pump/perpetual/service-requests?wallet_address=${encodeURIComponent(wallet)}`) : Promise.resolve([]),
    ]);
    if (!current()) return;
    state.perpIndexedPositions = positions.status === 'fulfilled' && Array.isArray(positions.value) ? positions.value : [];
    state.perpServiceRequests = services.status === 'fulfilled' && Array.isArray(services.value) ? services.value : [];
    renderPerpetual();
    const failures = [positions.status === 'rejected' ? '公开仓位索引读取失败' : '', services.status === 'rejected' ? '对手池申请读取失败，请刷新重试；不要重复支付' : ''].filter(Boolean);
    setPerpReadError('services', failures.join('；'));
    if (failures.length) throw new Error(failures.join('；'));
  };
  const loadPerpetualActivity = async (append = false) => {
    if (append && (state.perpHistoryBusy || !state.perpHistoryCursor)) return;
    const current = beginPerpRead('history', false);
    const version = perpReadVersions.get('history');
    if (!isBscFeatureChain()) {
      state.perpMarkets = [];
      state.perpActivity = [];
      renderPerpetualServices();
      renderWalletState();
      return;
    }
    if (!state.account) {
      state.perpActivity = []; state.perpHistoryCursor = null; state.perpHistoryBusy = false;
      renderPerpetualServices(); renderWalletState(); return;
    }
    state.perpHistoryBusy = true;
    if (!append) { state.perpActivity = []; state.perpHistoryCursor = null; }
    renderPerpetualServices();
    const cursor = state.perpHistoryCursor;
    const page = append ? `&before_block=${cursor.blockNumber}&before_log_index=${cursor.logIndex}` : '';
    try {
      const [markets, rows, positions] = await Promise.all([
        api("v1/pump/perpetual/markets"),
        api(`v1/pump/perpetual/activity?history=true&limit=200&wallet_address=${encodeURIComponent(state.account)}${page}`),
        append ? Promise.resolve([]) : api(`v1/pump/perpetual/activity?limit=200&wallet_address=${encodeURIComponent(state.account)}`),
      ]);
      if (!current()) return;
      if (!Array.isArray(rows) || rows.some((r) => !['open','close','liquidate','expire'].includes(r.eventType) || String(r.traderAddress).toLowerCase() !== state.account.toLowerCase())) {
        throw new Error('逐笔交易接口尚未更新或返回了不匹配的钱包记录');
      }
      state.perpMarkets = Array.isArray(markets) ? markets : [];
      if (!Array.isArray(positions) || positions.some((r) => String(r.traderAddress).toLowerCase() !== state.account.toLowerCase())) {
        throw new Error('当前持仓索引返回了不匹配的钱包记录');
      }
      const livePositions = (append ? state.perpActivity.filter((r) => r.currentPosition === true) : positions.filter((r) => r.isOpen === true).map((r) => ({
        ...r,
        eventType: 'open',
        currentPosition: true,
        lastTxHash: r.openedTxHash || r.lastTxHash,
      })));
      const liveHashes = new Set(livePositions.map((r) => String(r.lastTxHash || '').toLowerCase()).filter(Boolean));
      const priorHistory = append ? state.perpActivity.filter((r) => r.currentPosition !== true) : [];
      const combined = [...livePositions, ...priorHistory, ...rows.filter((r) => !liveHashes.has(String(r.lastTxHash || '').toLowerCase()))];
      state.perpActivity = [...new Map(combined.map((r) => [`${r.lastTxHash}:${r.currentPosition ? 'current' : r.logIndex}`, r])).values()];
      state.perpHistoryCursor = rows.length === 200 ? rows.at(-1) : null;
      setPerpReadError('history');
    } catch (error) {
      if (!current()) return;
      setPerpReadError('history', '逐笔记录加载失败，当前结果可能不完整，请刷新或重试'); throw error;
    } finally {
      if (perpReadVersions.get('history') === version) state.perpHistoryBusy = false;
      if (current()) { state.perpHistoryBusy = false; renderPerpetualServices(); renderWalletState(); setPerpReadError('history', state.perpReadErrors.history); }
    }
  };
  const completePaidPoolRequest = async (request) => {
    const account = state.account;
    const provider = selectedProvider();
    const epoch = walletSessionEpoch;
    const contract = String(state.perpConfig?.contractAddress || "").toLowerCase();
    const current = () => walletSessionEpoch === epoch && state.account === account
      && state.selectedChain === "bsc" && selectedProvider() === provider
      && String(state.perpConfig?.contractAddress || "").toLowerCase() === contract;
    const assertCurrent = () => {
      if (!current()) throw new Error("钱包或网络已变化，请返回原钱包及 BSC 恢复申请");
    };
    const checkWallet = async () => {
      assertCurrent();
      const [chain, accounts] = await Promise.all([
        provider.request({ method: "eth_chainId" }),
        provider.request({ method: "eth_accounts" }),
      ]);
      assertCurrent();
      if (normalizeChainId(chain) !== "0x38" || String(accounts?.[0] || "").toLowerCase() !== account.toLowerCase()) throw new Error("请返回原钱包及 BSC 恢复申请");
    };
    if (!account || !provider || !/^0x[0-9a-f]{40}$/.test(contract)
      || (request?.walletAddress && request.walletAddress.toLowerCase() !== account.toLowerCase())) throw new Error("申请的钱包或合约绑定无效");
    await checkWallet();
    const payload = request?.payload || {};
    const market = state.perpMarkets.find((item) => Number(item.marketId) === Number(payload.marketId));
    const payloadTokenAddress = String(payload.tokenAddress || "").toLowerCase();
    const marketTokenAddress = String(market?.tokenAddress || "").toLowerCase();
    if (!market || !isNonZeroPerpTokenAddress(payloadTokenAddress) || !isNonZeroPerpTokenAddress(marketTokenAddress)
      || marketTokenAddress !== payloadTokenAddress
      || !request?.requestId || request.status !== "paid") throw new Error("找不到与代币及市场完全匹配的已付费对手池申请");
    state.selectedPerpMarketId = Number(payload.marketId);
    const body = { wallet_address: account, market_id: Number(payload.marketId), action: "deposit_liquidity", amount_raw: String(payload.amountRaw || "") };
    const completionKey = `bitbt_perp_pool_completion:${request.requestId}:${account}`;
    const pendingKey = `bitbt_perp_pending:bsc:${state.perpConfig.contractAddress}:${account.toLowerCase()}`;
    let depositTxHash = readLocalPreference(completionKey);
    if (depositTxHash) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(depositTxHash)) throw new Error("注资交易记录无效，请核对钱包记录，勿重复注资");
      const [receipt, tx] = await Promise.all([
        provider.request({ method: "eth_getTransactionReceipt", params: [depositTxHash] }),
        provider.request({ method: "eth_getTransactionByHash", params: [depositTxHash] }),
      ]);
      await checkWallet();
      if (!receiptHasStatus(receipt)) throw new Error("注资交易仍待确认，请稍后恢复，勿重复注资");
      const expectedData = `0x34a860e4${word(BigInt(body.market_id))}${word(BigInt(body.amount_raw))}`;
      const matches = (value, expected) => String(value || "").toLowerCase() === expected.toLowerCase();
      if (!tx || !matches(tx.hash, depositTxHash) || !matches(receipt.transactionHash, depositTxHash)
        || !matches(tx.from, account) || !matches(receipt.from, account)
        || !matches(tx.to, contract) || !matches(receipt.to, contract)
        || !matches(tx.input, expectedData) || BigInt(tx.value || "0") !== 0n
        || (tx.chainId != null && normalizeChainId(tx.chainId) !== "0x38")) throw new Error("注资交易与原申请不匹配，已停止恢复");
      const failed = [false, 0, "0", "0x0", "0x00"].includes(receipt.status);
      if (!failed && !receiptSucceeded(receipt)) throw new Error("注资回执状态未知，勿重复注资");
      if (failed) {
        if (readLocalPreference(completionKey) === depositTxHash) writeLocalPreference(completionKey, "");
        if (readLocalPreference(pendingKey) === depositTxHash) writeLocalPreference(pendingKey, "");
        throw new Error("原注资交易已确认回滚，失败记录已清理；请核对后再次点击继续注资，本次未重发");
      }
    }
    if (!depositTxHash) {
      const action = await preparePerpetualWhenReady(body, assertCurrent);
      await checkWallet();
      validatePreparedPerpetual(action, market, body);
      try {
        depositTxHash = await executePreparedPerpetual(action, market, body, (hash) => {
          writeLocalPreference(completionKey, hash);
          if (readLocalPreference(completionKey) !== hash) throw new Error("注资交易已广播，但本地记录保存失败，请在钱包核对交易后联系客服，不要重复注资");
        }, assertCurrent);
      } catch (error) {
        if (/链上回执失败/.test(String(error?.message || error))) writeLocalPreference(completionKey, "");
        throw error;
      }
    }
    await checkWallet();
    const completed = await api("v1/pump/perpetual/service-requests/complete?chain_id=bsc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: account, requestId: request.requestId, txHash: depositTxHash }) });
    assertCurrent();
    writeLocalPreference(completionKey, "");
    if (readLocalPreference(pendingKey) === depositTxHash) writeLocalPreference(pendingKey, "");
    state.perpServiceRequests = [completed, ...state.perpServiceRequests.filter((item) => item.requestId !== completed.requestId)];
    toast("对手池服务费与链上 LP 注资均已成功", 8000);
    await loadPerpetual();
    assertCurrent();
    state.perpPoolTarget = null;
    show("perps-pool");
  };
  const createPermissionlessPerpetualMarket = async () => {
    if (state.perpServiceBusy) return;
    if (!state.account) await connectWallet();
    if (!isBscFeatureChain()) throw new Error("添加永续市场当前仅支持 BNB Smart Chain");
    if (!state.perpConfig?.enabled || !state.perpConfig?.permissionlessMarketCreation) {
      throw new Error("永续合约治理状态未就绪，当前禁止创建市场");
    }
    const tokenAddress = String($("#perps-contract-address")?.value || "").trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(tokenAddress) || /^0x0{40}$/.test(tokenAddress)) throw new Error("请输入有效的 BSC MEME 合约地址");
    const account = state.account;
    const provider = selectedProvider();
    const epoch = walletSessionEpoch;
    const contractAtStart = String(state.perpConfig?.contractAddress || "").toLowerCase();
    const recoveryKey = `bitbt_perp_market_creation:bsc:${contractAtStart}:${account}:${tokenAddress}`;
    const assertCurrent = () => {
      if (walletSessionEpoch !== epoch || state.account !== account || selectedProvider() !== provider
        || state.selectedChain !== "bsc" || String(state.perpConfig?.contractAddress || "").toLowerCase() !== contractAtStart) {
        throw new Error("钱包、网络或永续合约配置已变化，请重新核对后创建");
      }
    };
    if (!provider || !account || !/^0x[0-9a-f]{40}$/.test(contractAtStart)) throw new Error("钱包或永续合约配置无效");
    const continueToPool = async (marketId, txHash = "", existing = false) => {
      if (parsePerpMarketId(marketId) == null) throw new Error("永续市场编号无效，请勿重复创建并联系客服核验");
      state.selectedPerpMarketId = Number(marketId);
      state.perpPoolTarget = { marketId: Number(marketId), tokenAddress };
      try {
        await loadPerpetual();
      } catch {
        assertCurrent();
        show("perps");
        showOperationDialog(`${existing ? "该代币已有永续市场" : "市场创建交易已确认"}。${txHash ? `\n交易哈希：${txHash}` : ""}\n市场 #${marketId} 正在同步，请稍后刷新后进入“创建对手池”；请勿重复创建。`, { title: "市场正在同步", tag: "无需重复创建", success: true });
        return;
      }
      assertCurrent();
      const created = state.perpMarkets.find((market) => Number(market.marketId) === marketId
        && String(market.tokenAddress || "").toLowerCase() === tokenAddress);
      if (!created) {
        show("perps");
        showOperationDialog(`${existing ? "该代币已有永续市场" : "市场创建交易已确认"}。${txHash ? `\n交易哈希：${txHash}` : ""}\n市场 #${marketId} 尚未进入列表，请稍后刷新后进入“创建对手池”；请勿重复创建。`, { title: "市场正在同步", tag: "无需重复创建", success: true });
        return;
      }
      renderPerpetualServices();
      show("perps-create-pool");
      showOperationDialog(existing
        ? `该代币已存在市场 #${marketId}，无需重复创建。当前 LP 和启用状态以链上数据为准；如需扩容，可选择追加流动性。`
        : `市场创建交易已确认。\n交易哈希：${txHash}\n该笔交易已原子完成 Oracle 校验、最低 Quote LP 注入及市场启用；无需重复注资。`,
      { title: existing ? "市场已存在" : "市场创建成功", tag: "查看市场状态", success: true });
    };
    await assertProviderState();
    assertCurrent();
    state.perpServiceBusy = true;
    renderPerpetualServices();
    try {
      let txHash = readLocalPreference(recoveryKey);
      if (txHash) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          writeLocalPreference(recoveryKey, "");
          throw new Error("本地保存的市场创建交易无效，已清理；请重新创建");
        }
        const [receipt, transaction] = await Promise.all([
          provider.request({ method: "eth_getTransactionReceipt", params: [txHash] }),
          provider.request({ method: "eth_getTransactionByHash", params: [txHash] }),
        ]);
        assertCurrent();
        if (!receiptHasStatus(receipt)) throw new Error("市场创建交易仍在确认中，请稍后重试；本次不会重新签名");
        if (!receiptSucceeded(receipt)) {
          writeLocalPreference(recoveryKey, "");
          throw new Error("原市场创建交易已确认回滚，失败记录已清理；请核对参数后重新创建");
        }
        const recoveredData = String(transaction?.input || transaction?.data || "").toLowerCase();
        const expectedTokenWord = tokenAddress.slice(2).padStart(64, "0");
        if (!transaction
          || !receipt
          || String(transaction.hash || "").toLowerCase() !== txHash.toLowerCase()
          || String(receipt.transactionHash || "").toLowerCase() !== txHash.toLowerCase()
          || String(receipt.from || "").toLowerCase() !== account
          || String(receipt.to || "").toLowerCase() !== contractAtStart
          || String(transaction.from || "").toLowerCase() !== account
          || String(transaction.to || "").toLowerCase() !== contractAtStart
          || BigInt(transaction.value || "0") !== 0n
          || normalizeChainId(transaction.chainId || "") !== "0x38"
          || !/^0x723219d3[0-9a-f]{320}$/.test(recoveredData)
          || recoveredData.slice(10, 74) !== expectedTokenWord) {
          writeLocalPreference(recoveryKey, "");
          throw new Error("本地市场创建记录与当前钱包、代币或合约不匹配，已清理且不会重复发送");
        }
      } else {
        const prepared = await api("v1/pump/perpetual/prepare-market", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress: account, tokenAddress }),
        });
        assertCurrent();
        const preview = $('[data-panel="perps-add-contract"] [data-contract-preview]');
        if (preview) {
          preview.querySelector('strong').textContent = short(tokenAddress);
          preview.querySelector('small').textContent = prepared?.profileSource === 'default'
            ? uiCopy('现货流动性与默认安全模板已通过；创建时同步存入最低测试 Quote LP', 'Spot liquidity and the default safety template passed; the minimum test Quote LP is deposited during creation')
            : uiCopy('现货流动性与专用安全模板已通过；创建时同步存入最低 Quote LP', 'Spot liquidity and the token safety template passed; the minimum Quote LP is deposited during creation');
          preview.querySelector('.tag').textContent = uiCopy('校验通过', 'Validated');
        }
        const existingMarketIdRaw = prepared?.existingMarketId;
        const existingMarketId = existingMarketIdRaw == null ? null : parsePerpMarketId(existingMarketIdRaw);
        if (existingMarketIdRaw != null && existingMarketId == null) {
          throw new Error("已有市场编号无效，请勿签名并联系客服核验");
        }
        if (existingMarketId != null) {
          if (String(prepared?.tokenAddress || "").toLowerCase() !== tokenAddress
            || !Array.isArray(prepared?.transactions) || prepared.transactions.length !== 0) {
            throw new Error("已有市场确认结果与当前代币不匹配，请勿签名并联系客服核验");
          }
          await continueToPool(existingMarketId, "", true);
          return;
        }
        const transactions = prepared?.transactions;
        const quoteToken = String(prepared?.quoteTokenAddress || "").toLowerCase();
        const oracle = String(prepared?.oracleAddress || "").toLowerCase();
        const encodeAddressWord = (value) => String(value || "").replace(/^0x/, "").toLowerCase().padStart(64, "0");
        const encodeUintWord = (value) => BigInt(value).toString(16).padStart(64, "0");
        if (!/^0x[0-9a-f]{40}$/.test(quoteToken) || !/^0x[0-9a-f]{40}$/.test(oracle)) throw new Error("永续报价资产或 Oracle 地址无效");
        const expectedData = `0x723219d3${encodeAddressWord(tokenAddress)}${encodeAddressWord(quoteToken)}${encodeAddressWord(oracle)}${encodeUintWord(prepared.maxLeverage)}${encodeUintWord(prepared.minLiquidityRaw)}`;
        if (!Array.isArray(transactions) || transactions.length < 1 || transactions.length > 3) {
          throw new Error("市场创建交易步骤无效，已阻止签名");
        }
        let transaction = transactions.at(-1);
        const approvalData = `0x095ea7b3${encodeAddressWord(contractAtStart)}${encodeUintWord(prepared.minLiquidityRaw)}`;
        const resetApprovalData = `0x095ea7b3${encodeAddressWord(contractAtStart)}${encodeUintWord(0)}`;
        const approvals = transactions.slice(0, -1);
        const approvalsValid = approvals.every((approval, index) => String(approval?.to || "").toLowerCase() === quoteToken
          && normalizeChainId(approval.chainId || approval.chain_id || "") === "0x38"
          && BigInt(approval.value || "0x0") === 0n
          && String(approval.data || "").toLowerCase() === (approvals.length === 2 && index === 0 ? resetApprovalData : approvalData));
        if (!approvalsValid
          || String(prepared.tokenAddress || "").toLowerCase() !== tokenAddress
          || String(transaction.to || "").toLowerCase() !== contractAtStart
          || normalizeChainId(transaction.chainId || transaction.chain_id || "") !== "0x38"
          || BigInt(transaction.value || "0") !== 0n
          || String(transaction.data || "").toLowerCase() !== expectedData) {
          throw new Error("市场创建交易与链上安全模板不一致，已阻止签名");
        }
        for (const approval of approvals) {
          await sendVaultTransaction(approval, approval.label || "授权永续 Quote LP", undefined, undefined, assertCurrent);
        }
        // Wallet approval can take longer than the Keeper demand lease. Refresh
        // readiness and the exact creation transaction before requesting a new
        // wallet signature; never reuse the pre-approval creation snapshot.
        const refreshed = await api("v1/pump/perpetual/prepare-market", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress: account, tokenAddress }),
        });
        assertCurrent();
        const freshTransaction = refreshed?.transactions?.[0];
        if (refreshed?.existingMarketId != null
          || String(refreshed?.tokenAddress || "").toLowerCase() !== tokenAddress
          || String(refreshed?.quoteTokenAddress || "").toLowerCase() !== quoteToken
          || String(refreshed?.oracleAddress || "").toLowerCase() !== oracle
          || String(refreshed?.minLiquidityRaw) !== String(prepared.minLiquidityRaw)
          || String(refreshed?.maxLeverage) !== String(prepared.maxLeverage)
          || refreshed?.transactions?.length !== 1
          || String(freshTransaction?.to || "").toLowerCase() !== contractAtStart
          || normalizeChainId(freshTransaction?.chainId || freshTransaction?.chain_id || "") !== "0x38"
          || BigInt(freshTransaction?.value || "0") !== 0n
          || String(freshTransaction?.data || "").toLowerCase() !== expectedData) {
          throw new Error("授权后市场参数或运维状态已变化，已阻止创建签名；不会重复授权，请重试");
        }
        transaction = freshTransaction;
        txHash = await sendVaultTransaction(
          transaction,
          transaction.label || "创建永续市场并存入最低 Quote LP",
          (hash) => {
            writeLocalPreference(recoveryKey, hash);
            if (readLocalPreference(recoveryKey) !== hash) {
              throw new Error("市场创建交易已广播，但浏览器无法保存恢复记录；请核对钱包交易且不要重复创建");
            }
          },
          undefined,
          assertCurrent,
        );
      }
      assertCurrent();
      const confirmed = await api("v1/pump/perpetual/market-created", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: account, tokenAddress, txHash }),
      });
      assertCurrent();
      const confirmedMarketId = parsePerpMarketId(confirmed?.marketId);
      if (confirmedMarketId == null
        || String(confirmed?.tokenAddress || "").toLowerCase() !== tokenAddress) {
        throw new Error("市场创建确认结果与当前代币不匹配，请勿重复创建并联系客服核验");
      }
      writeLocalPreference(recoveryKey, "");
      await continueToPool(confirmedMarketId, txHash);
    } finally {
      state.perpServiceBusy = false;
      renderPerpetualServices();
    }
  };
  const submitPerpetualService = async (requestType) => {
    if (requestType === "add_contract") return createPermissionlessPerpetualMarket();
    if (state.perpServiceBusy) return;
    if (!state.account) await connectWallet();
    if (!isBscFeatureChain()) throw new Error("永续服务当前仅在 BNB Smart Chain 开放");
    if (requestType !== "create_pool") throw new Error("不支持的永续服务类型");
    const boundTarget = state.perpPoolTarget;
    const marketIdValue = String(boundTarget?.marketId ?? $("#perps-pool-market")?.value ?? "").trim();
    if (!marketIdValue) throw new Error("请选择有效的永续市场");
    if (!/^(0|[1-9][0-9]*)$/.test(marketIdValue)) throw new Error("请选择有效的永续市场");
    const marketId = Number(marketIdValue);
    if (!Number.isSafeInteger(marketId)) throw new Error("请选择有效的永续市场");
    const market = state.perpMarkets.find((item) => Number(item.marketId) === marketId);
    if (!market) throw new Error("请选择有效的永续市场");
    const marketTokenAddress = String(market.tokenAddress || "").toLowerCase();
    const boundTokenAddress = String(boundTarget?.tokenAddress || "").toLowerCase();
    if (!isNonZeroPerpTokenAddress(marketTokenAddress)
      || (boundTarget && (!isNonZeroPerpTokenAddress(boundTokenAddress) || marketTokenAddress !== boundTokenAddress))) {
      throw new Error("创建流程绑定的代币与永续市场不一致，已停止提交，请重新进入创建流程");
    }
    const amount = String($("#perps-pool-amount")?.value || "").trim();
    const amountRaw = parseUnits(amount, Number(market.quoteDecimals || 18)).toString();
    const payload = { tokenAddress: market.tokenAddress, marketId, amount, amountRaw };
    state.perpServiceBusy = true;
    renderPerpetualServices();
    try {
      const prepared = await api("v1/pump/perpetual/service-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: state.account, requestType, payload }) });
      const transaction = prepared?.transaction;
      const expectedRecipient = String(state.perpConfig?.serviceFeeRecipient || "").toLowerCase();
      if (!transaction || String(transaction.to || "").toLowerCase() !== expectedRecipient || String(transaction.data || "").toLowerCase() !== "0x" || BigInt(transaction.value || "0") !== BigInt(prepared.feeAmountWei || "0")) throw new Error("平台服务费交易参数与配置不一致");
      const txHash = await sendVaultTransaction(transaction, "对手池创建服务费");
      const confirmed = await api("v1/pump/perpetual/service-requests/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: state.account, requestId: prepared.requestId, txHash }) });
      state.perpServiceRequests = [confirmed, ...state.perpServiceRequests.filter((item) => item.requestId !== confirmed.requestId)];
      await completePaidPoolRequest(confirmed);
    } finally {
      state.perpServiceBusy = false;
      renderPerpetualServices();
    }
  };
  const toggleFavorite = async () => {
    if (!state.selected) throw new Error("请先选择代币");
    const token = state.selected;
    const address = tokenAddress(token).toLowerCase();
    const favorite = state.favorites.some((item) => String(item.contract_address || "").toLowerCase() === address);
    const requestSequence = ++userDataRequestSequence;
    await api("v1/market/favorites", {
      method: favorite ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId(),
        symbol: token.symbol || token.token_name,
        chain_id: state.selectedChain,
        contract_address: tokenAddress(token),
      }),
    });
    if (requestSequence !== userDataRequestSequence) return;
    state.favorites = favorite
      ? state.favorites.filter((item) => String(item.contract_address || "").toLowerCase() !== address)
      : [
          ...state.favorites,
          {
            symbol: token.symbol,
            chain_id: state.selectedChain,
            contract_address: tokenAddress(token),
          },
        ];
    renderMyPanels();
    renderSelected();
    toast(favorite ? "已取消收藏" : "已加入自选");
  };
  const prepareV13ApiPanels = () => {
    if (root.dataset.uiPreview !== "v13") return;
    root.querySelector(".project-placements")?.remove();
    root.querySelectorAll('[data-panel="activity"] [data-list-filter="activity"]').forEach((button) => {
      const values = { all: "all", buy: "pump_buy", sell: "pump_sell", create: "launch" };
      button.dataset.historyFilter = values[button.dataset.filterValue] || "all";
      button.removeAttribute("data-list-filter");
      button.removeAttribute("data-filter-value");
    });
    root.querySelectorAll('[data-panel="my-launches"] [data-list-filter="launches"]').forEach((button) => {
      const values = { all: "all", curve: "curve", dex: "migrated", draft: "curve" };
      button.dataset.launchFilter = values[button.dataset.filterValue] || "all";
      button.removeAttribute("data-list-filter");
      button.removeAttribute("data-filter-value");
    });
    const marketStrip = root.querySelector("[data-panel='discover'] .market-strip");
    const marketStats = marketStrip?.querySelectorAll(":scope > div") || [];
    if (marketStats[1]) marketStats[1].innerHTML = '<span>24H LAUNCHES</span><strong data-market-launches>—</strong>';
    if (marketStats[2]) marketStats[2].innerHTML = '<span>24H TRADES</span><strong data-market-trades>—</strong>';
    const heroProof = root.querySelectorAll("[data-panel='discover'] .hero-proof > div");
    if (heroProof[0]) heroProof[0].innerHTML = '<strong data-market-trades>—</strong><span>24H 成交笔数</span>';
    if (heroProof[1]) heroProof[1].innerHTML = '<strong data-market-total>—</strong><span>真实项目</span>';
    if (heroProof[2]) heroProof[2].innerHTML = '<strong>2</strong><span>已配置主网</span>';

    const profile = root.querySelector("[data-panel='profile']");
    if (profile) {
      profile.setAttribute("data-reference-profile", "");
      const profileConnect = profile.querySelector(".profile-connect-card");
      profileConnect?.classList.add("connect");
      profileConnect?.querySelector(".profile-connect-copy strong")?.setAttribute("data-wallet-copy", "");
      const revenueFoot = profile.querySelector(".revenue-tool .tool-foot > span");
      if (revenueFoot) revenueFoot.textContent = "以真实奖励账本为准";
      const growthStats = profile.querySelectorAll(".growth-spotlight .growth-stats strong");
      if (growthStats[0]) growthStats[0].textContent = "—";
      if (growthStats[1]) { growthStats[1].textContent = "—"; growthStats[1].setAttribute("data-referral-activated", ""); }
      const securityScore = profile.querySelector(".security-summary .security-score-copy > strong");
      if (securityScore) securityScore.textContent = "—";
      const quickRows = profile.querySelectorAll(".profile-quick-grid > button");
      const announcementCopy = quickRows[0]?.querySelector("small");
      const announcementCount = quickRows[0]?.querySelector(".notice-count");
      if (announcementCopy) announcementCopy.innerHTML = '<span data-announcement-unread>0</span> 条未读';
      if (announcementCount) announcementCount.setAttribute("data-announcement-unread", "");
      const alertCopy = quickRows[1]?.querySelector("small");
      if (alertCopy) alertCopy.innerHTML = '<span data-alert-total>0</span> 条开启';
      profile.querySelector(".profile-support")?.remove();
      const footer = profile.querySelector(":scope > .footer-note");
      if (footer) footer.textContent = "BitBT Pump 是非托管、无需许可的发射与交易界面，不构成投资建议。";
    }

    const keepHeading = (panel) => [...panel.children].filter((node) => node.matches(".appbar,.page-title"));
    const income = root.querySelector("[data-panel='income-center']");
    if (income) {
      income.replaceChildren(...keepHeading(income));
      income.insertAdjacentHTML("beforeend", `<div class="account-metric-grid"><article><span>奖励账本</span><strong>API</strong><small>当前钱包真实记录</small></article><article><span>Split Vault</span><strong data-vault-count>0</strong><small data-vault-feature-status>读取配置中</small></article><article><span>自动分配</span><strong data-vault-keeper-status>读取配置中</strong><small>阈值 <span data-vault-keeper-threshold>—</span></small></article></div><div class="account-tabs"><button class="active" data-account-tab="income-overview">真实收入</button><button data-account-tab="income-split">Split Vault</button><button data-account-tab="income-records">说明</button></div><div class="account-panel active" data-account-panel="income-overview"><div data-unified-revenue-list><p class="footer-note">连接钱包后读取真实奖励账本。</p></div></div><div class="account-panel" data-account-panel="income-split"><div data-vault-list><p class="footer-note">连接并验证钱包后读取链上 Vault。</p></div></div><div class="account-panel" data-account-panel="income-records"><div class="account-card"><p class="footer-note">这里只展示 API 或链上已确认的数据；没有确认回执的金额不会显示为已到账。</p><button class="secondary" data-income-show-vaults>查看 Vault 与领取回执</button></div></div>`);
    }

    const developer = root.querySelector("[data-panel='developer-tools']");
    if (developer) {
      developer.replaceChildren(...keepHeading(developer));
      developer.insertAdjacentHTML("beforeend", `<div class="account-card"><div class="card-heading"><div><h3>生产集成状态</h3><p>来自服务端状态接口，不展示演示密钥。</p></div><span class="tag" data-integration-status>CHECKING</span></div><div class="review-row"><span>API / 数据库</span><strong data-integration-api>读取中</strong></div><div class="review-row"><span>Webhook / Vault</span><strong data-integration-services>读取中</strong></div><div class="review-row"><span>合作方密钥</span><strong data-integration-partner-keys>读取中</strong></div></div><div class="account-card"><div class="card-heading"><div><h3>Webhook</h3><p>创建和删除均绑定当前 SIWE 钱包。</p></div><span class="tag" data-webhook-status>连接钱包后管理</span></div><label class="profile-field"><span>HTTPS 回调地址</span><input id="webhook-endpoint" placeholder="https://example.com/bitbt/events" aria-label="Webhook 回调地址"></label><div class="filter-row" data-webhook-events><button class="active" type="button" data-webhook-event="token.created">Token</button><button class="active" type="button" data-webhook-event="trade.buy">Buy</button><button class="active" type="button" data-webhook-event="trade.sell">Sell</button><button class="active" type="button" data-webhook-event="token.migrated">Migrated</button></div><button class="primary" type="button" data-webhook-create>创建 Webhook</button><div class="risk-note" data-webhook-secret hidden></div></div><div class="section-title"><h3>已创建 Webhook</h3><span class="tag" data-webhook-count>0</span></div><div data-webhook-list><p class="footer-note">连接钱包后读取。</p></div>`);
    }

    const invite = root.querySelector("[data-panel='invite-center']");
    if (invite) {
      invite.replaceChildren(...keepHeading(invite));
      invite.insertAdjacentHTML("beforeend", `<div class="invite-reward-hero"><div class="invite-hero-copy"><span class="eyebrow">INVITE & EARN</span><h1>邀请与 KOL 数据</h1><p>邀请码、活动与 KOL 申请均绑定当前 SIWE 钱包。</p><div class="invite-code-line"><span><small>我的邀请码</small><strong data-referral-code>—</strong></span><button data-referral-copy-code>复制</button></div><div class="invite-share-row"><button class="primary" data-referral-create>生成我的邀请码</button><button class="secondary" data-referral-share="telegram">Telegram</button><button class="secondary" data-referral-share="twitter">X / Twitter</button></div></div><div class="rebate-card"><span>真实邀请数据</span><strong data-referral-counts>—</strong><div><span>累计邀请 / 已激活</span><span>奖励以真实账本为准</span></div></div></div><div class="invite-metric-grid"><article><span>累计邀请</span><strong data-referral-invited>—</strong><small>API 实时读取</small></article><article><span>已激活用户</span><strong data-referral-activated>—</strong><small>完成有效行为</small></article><article><span>上级邀请码</span><strong data-referrer-address>未绑定</strong><small>绑定后不可修改</small></article><article><span>KOL 状态</span><strong data-kol-status>未提交</strong><small>审核结果以 API 为准</small></article></div><div class="invite-content-grid"><article class="invite-card"><div class="card-heading"><div><h3>绑定邀请码</h3><p>仅在尚未绑定时提交。</p></div></div><label class="profile-field"><span>邀请码</span><input id="referral-code-input" maxlength="24"></label><button class="secondary" data-referral-bind>确认绑定</button></article><article class="invite-card"><div class="card-heading"><div><h3>KOL 申请</h3><p>提交或更新真实申请资料。</p></div></div><label class="profile-field"><span>社交主页</span><input id="kol-social-url" type="url"></label><label class="profile-field"><span>受众数量</span><input id="kol-audience-size" inputmode="numeric"></label><label class="profile-field"><span>备注</span><input id="kol-note"></label><button class="primary" data-kol-submit>提交 / 更新申请</button></article></div><div class="section-title"><h3>当前活动</h3><span>API</span></div><div data-campaign-list><p class="footer-note">连接钱包后读取。</p></div>`);
    }

    const alerts = root.querySelector("[data-panel='alert-center']");
    if (alerts) {
      alerts.replaceChildren(...keepHeading(alerts));
      const alertTag = alerts.querySelector(".appbar > .tag");
      if (alertTag) alertTag.innerHTML = '<span data-alert-total>0</span> 条开启';
      alerts.insertAdjacentHTML("beforeend", `<div class="account-card"><div class="card-heading"><div><h3>新建提醒</h3><p>代币与类型均来自真实市场和提醒 API。</p></div></div><div class="alert-composer"><select id="alert-token-select" aria-label="选择提醒代币"><option value="">请选择代币</option></select><select id="alert-kind-select" aria-label="选择提醒类型"><option value="curve_80">联合曲线达到 80%</option><option value="curve_90">联合曲线达到 90%</option><option value="migrated">迁移完成</option></select><div><input id="alert-threshold-display" disabled value="80" aria-label="提醒阈值"><span>%</span></div></div><button class="primary" data-alert-create>创建提醒</button></div><div class="section-title"><h3>我的提醒</h3><span data-alert-record-count>0 条</span></div><div class="profile-menu-group" data-alert-list><p class="footer-note">连接钱包后显示真实提醒。</p></div>`);
    }
  };
  const clearPrototype = () => {
    prepareV13ApiPanels();
    charts.forEach(({ chart }) => chart.remove?.());
    charts.clear();
    $$(".token-grid").forEach((node) => {
      node.innerHTML = `<p class="footer-note">正在读取真实 Pump 项目…</p>`;
    });
    const livePanel = $('[data-panel="live"]');
    if (livePanel) [...livePanel.querySelectorAll(".live-row")].forEach((node) => node.remove());
    const rankPanel = $('[data-panel="rank"]');
    if (rankPanel) [...rankPanel.querySelectorAll(".rank-row")].forEach((node) => node.remove());
    ["[data-panel='live'] .live-row", "[data-panel='rank'] .rank-row", "[data-panel='activity'] .activity-card", "[data-panel='announcements'] .announcement-card", "[data-panel='announcements'] .announcement-detail:not([data-live-announcement-detail])", "[data-panel='detail'] [data-detail-panel='trades'] .live-row", "[data-panel='detail'] [data-detail-panel='holders'] .data-table", "[data-panel='success']:not([data-live-launch-result]) .launch-card", "[data-panel='success']:not([data-live-launch-result]) .review-block", "[data-panel='create-review'] .review-block:not(.launch-review-block)", "[data-panel='my-launches'] .summary-hero", "[data-panel='my-launches'] .launch-card", "[data-panel='profile'] [data-profile-summary]", "[data-panel='watchlist'] .token-card"].forEach((selector) => $$(selector).forEach((node) => node.remove()));
    ["[data-active-symbol]", "[data-active-quote]", "[data-active-address]", "[data-active-price]", "[data-active-market]", "[data-active-rank]", "[data-active-change]", "[data-active-curve]", "[data-holding-amount]", "[data-holding-short]", "[data-holding-value]", "[data-holding-cost]", "[data-holding-pnl]", "[data-holding-return]", "[data-holding-share]", "[data-quote-output]", "[data-quote-min]", "[data-quote-route]", "[data-quote-fee]", "[data-token-tax]", "[data-price-impact]", "[data-slippage-value]", "[data-order-unit]", "[data-order-balance]"].forEach((selector) => text(selector, "—"));
    $$("[data-active-curve-bar], [data-holding-bar]").forEach((node) => {
      node.style.width = "0%";
    });
    $$("[data-panel='detail'] .curve-panel .between span, [data-panel='detail'] .curve-panel .between strong, [data-panel='detail'] [data-detail-panel='trades'] .section-title a, [data-panel='trade'] .holding-metrics strong, [data-panel='trade'] .holding-share strong, [data-panel='trade'] .quote strong, [data-panel='trade'] .curve-side-card strong").forEach((node) => {
      node.textContent = "—";
    });
    $$("[data-panel='trade'] #trade-amount").forEach((node) => {
      node.value = "";
    });
    const projectSummary = $("[data-token-project-summary]");
    if (projectSummary) projectSummary.hidden = true;
    const projectDescription = $("[data-token-description]");
    if (projectDescription) {
      projectDescription.hidden = true;
      projectDescription.textContent = "";
    }
    $("[data-token-socials]")?.replaceChildren();
    $$("[data-panel^='create-'] input").forEach((node) => {
      node.value = "";
    });
    if (ui20260911) {
      $('[data-market-panel="perps"] .token-grid')?.replaceChildren();
      $$('[data-panel="perps"] .perps-pairs, [data-panel="perps"] [data-perps-panel="orders"], [data-panel="perps"] [data-perps-panel="triggers"], [data-panel="perps"] [data-perps-panel="onchain"], [data-panel="perps"] .perps-search-results, [data-panel="rank"] .curve-panel').forEach((node) => node.replaceChildren());
      const perpsSearch = $('#perps-market-search');
      if (perpsSearch) {
        perpsSearch.value = '';
        perpsSearch.disabled = true;
        perpsSearch.placeholder = '正在读取真实永续市场…';
      }
      text('[data-perps-symbol], [data-perps-price], [data-perps-change], [data-perps-mark], [data-perps-volume], [data-perps-oi], [data-perps-funding], [data-perps-position], [data-perps-entry], [data-perps-liq], [data-perps-notional], [data-perps-est-liq]', '—');
      $$('[data-panel="perps"] .perps-pnl strong, [data-panel="perps"] .perps-pnl small, [data-panel="perps"] .perps-position-grid strong, [data-panel="perps"] .account-equity strong, [data-panel="perps"] .order-label strong').forEach((node) => { node.textContent = '—'; });
      const perpsSubmit = $('#perps-submit');
      if (perpsSubmit) {
        perpsSubmit.disabled = true;
        perpsSubmit.textContent = '正在读取永续市场状态…';
        perpsSubmit.removeAttribute('data-toast');
      }
      // Preserve original form shells; initialize safe data slots before reveal.
      renderPerpetualServices();
      $$('.chart').forEach((node) => node.replaceChildren());
      // The supplied design file contains visual-only sample names and amounts
      // outside the API-bound containers. Remove them before revealing the UI.
      const prototypePattern = /CASHCAT|MOONBUN|1,284|\$18\.6M|\$721K|2,840\.62 USDT/g;
      $$('*').forEach((node) => {
        [...node.childNodes].filter((child) => child.nodeType === 3 && prototypePattern.test(child.textContent || '')).forEach((child) => {
          prototypePattern.lastIndex = 0;
          child.textContent = String(child.textContent || '').replace(prototypePattern, '—');
        });
        prototypePattern.lastIndex = 0;
      });
      // The delivered v13 artwork describes capabilities beyond the deployed
      // V11 contract. Remove those claims before the preview is revealed; real
      // limits are written back later from the API response.
      const unsupportedClaims = [
        [/最高\s*100×/g, uiCopy('杠杆以市场参数为准', 'Leverage follows market parameters')],
        [/1[–-]100×/g, uiCopy('杠杆以市场参数为准', 'Leverage follows market parameters')],
        [/仅限双链/g, uiCopy('当前仅限 BNB Chain', 'BNB Chain only')],
      ];
      $$('*').forEach((node) => {
        [...node.childNodes].filter((child) => child.nodeType === 3).forEach((child) => {
          let value = String(child.textContent || '');
          unsupportedClaims.forEach(([pattern, replacement]) => { value = value.replace(pattern, replacement); });
          child.textContent = value;
        });
      });
      const ticker = $('.trend-ticker');
      if (ticker) ticker.innerHTML = uiCopy('<span class="trend-label"><i></i>真实市场数据</span><span class="trend-live"><i></i>正在连接数据流…</span>', '<span class="trend-label"><i></i>LIVE MARKET DATA</span><span class="trend-live"><i></i>Connecting…</span>');
    }
    $$("#launch-kline, #trade-kline").forEach((node) => {
      node.replaceChildren();
    });
  };
  const parseUnits = (value, decimals = 18) => {
    const clean = String(value || "").trim();
    if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("请输入有效数量");
    const [whole, fraction = ""] = clean.split(".");
    if (fraction.length > decimals) throw new Error("数量精度超出限制");
    const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
    if (result <= 0n) throw new Error("数量必须大于零");
    return result;
  };
  const amountFromApi = (value) => {
    const clean = String(value || "");
    return /^\d+$/.test(clean) ? BigInt(clean) : parseUnits(clean);
  };
  const word = (value) => value.toString(16).padStart(64, "0");
  const addressWord = (value) => String(value).replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const formatUnits = (value, decimals = 18, digits = 6) => {
    const scale = 10n ** BigInt(decimals);
    const whole = value / scale;
    const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
  };
  // GW remains here only so already-issued GW-denominated projects can still
  // resolve balances and trade. New-token creation does not expose GW.
  const quoteAddress = (symbol) => {
    const key = String(symbol || "").toUpperCase();
    const configured = state.launchOptions?.quotes?.find((item) => String(item.symbol || "").toUpperCase() === key)?.address;
    if (configured) return configured.toLowerCase() === ZERO_ADDRESS ? null : configured;
    return {
      BNB: null,
      USDT: "0x55d398326f99059fF775485246999027B3197955",
      USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      USD1: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
    }[key];
  };
  const launchQuoteTokens = () => new Set((state.launchOptions?.quotes || [{ symbol: "BNB" }, { symbol: "USDT" }, { symbol: "USDC" }, { symbol: "USD1" }]).map((item) => String(item.symbol || "").toUpperCase()));
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const wrappedNativeAddress = () => selectedNetwork().wrappedNative;
  const USER_SLIPPAGE_BPS = 200;
  const BSC_PRIORITY_FEE_WEI = 50_000_000n;
  const getFeePolicy = async (provider = selectedProvider()) => {
    const network = selectedNetwork();
    try {
      const [latestResult, gasPriceResult] = await Promise.allSettled([
        provider.request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
        provider.request({ method: "eth_gasPrice" }),
      ]);
      const latest = latestResult.status === "fulfilled" ? latestResult.value : null;
      const gasPriceRaw = gasPriceResult.status === "fulfilled" ? gasPriceResult.value : latest?.baseFeePerGas;
      if (gasPriceRaw == null) throw new Error("Gas price unavailable");
      const gasPrice = BigInt(gasPriceRaw);
      if (gasPrice <= 0n || gasPrice > network.maxGasPriceWei) throw new Error(`当前 Gas 报价超出 ${network.shortName} 安全上限，请稍后重试`);
      const baseFee = latest?.baseFeePerGas ? BigInt(latest.baseFeePerGas) : gasPrice;
      const priority = network.id === "bsc" ? BSC_PRIORITY_FEE_WEI : 0n;
      const maxFee = (baseFee * 120n) / 100n + priority;
      if (maxFee > network.maxGasPriceWei) throw new Error(`当前 Gas 报价超出 ${network.shortName} 安全上限，请稍后重试`);
      return {
        maxPriorityFeePerGas: priority,
        maxFeePerGas: maxFee,
      };
    } catch (error) {
      if (/安全上限/.test(String(error?.message || ""))) throw error;
      throw new Error("无法读取当前 Gas 报价，已停止交易以避免支付异常网络费");
    }
  };
  const normalizeChainId = (value) => {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    if (normalized === "0x38" || normalized === "56" || normalized === "bsc" || normalized === "bnb") return "0x38";
    if (normalized === "0x1237" || normalized === "4663" || normalized === "robinhood") return "0x1237";
    if (normalized === "0xb626" || normalized === "46630" || normalized === "robinhood-testnet") return "0xb626";
    return "";
  };
  const ensureSelectedChain = async (provider) => {
    const network = selectedNetwork();
    let chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
    if (chainId !== network.chainIdHex) {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: network.chainIdHex }] });
      } catch (error) {
        if (Number(error?.code) !== 4902 && !/unrecognized chain|unknown chain/i.test(String(error?.message || ""))) throw error;
        await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: network.chainIdHex, chainName: network.name, nativeCurrency: { name: network.native, symbol: network.native, decimals: 18 }, rpcUrls: network.rpcUrls, blockExplorerUrls: [network.explorer] }] });
      }
      chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
    }
    if (chainId !== network.chainIdHex) throw new Error(`钱包未切换到 ${network.name}`);
    state.chainId = chainId;
  };
  const rpc = (to, data, provider = selectedProvider()) => provider.request({ method: "eth_call", params: [{ to, data }, "latest"] }).then((value) => BigInt(value));
  const walletNativeBalance = (account = state.account, provider = selectedProvider()) => provider.request({ method: "eth_getBalance", params: [account, "latest"] }).then((value) => BigInt(value));
  const walletTokenBalance = (token, account = state.account, provider = selectedProvider()) => rpc(token, `0x70a08231${addressWord(account)}`, provider);
  const allowance = (token, owner, spender, provider = selectedProvider()) => rpc(token, `0xdd62ed3e${addressWord(owner)}${addressWord(spender)}`, provider);
  const send = async (tx, provider = selectedProvider()) => {
    const fee = tx.fee || (await getFeePolicy(provider));
    tx.assertContext?.();
    tx.onSubmitting?.();
    return provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: tx.from,
          to: tx.to,
          ...(tx.data ? { data: tx.data } : {}),
          ...(tx.value ? { value: `0x${tx.value.toString(16)}` } : {}),
          gas: `0x${tx.gas.toString(16)}`,
          maxPriorityFeePerGas: `0x${fee.maxPriorityFeePerGas.toString(16)}`,
          maxFeePerGas: `0x${fee.maxFeePerGas.toString(16)}`,
        },
      ],
    });
  };
  const receiptHasStatus = (receipt) => receipt != null && receipt.status !== undefined && receipt.status !== null;
  const receiptSucceeded = (receipt) => receiptHasStatus(receipt) && [true, 1, "1", "0x1", "0x01"].includes(receipt.status);
  const waitReceipt = async (hash, provider = selectedProvider()) => {
    for (let i = 0; i < 24; i += 1) {
      try {
        const receipt = await provider.request({
          method: "eth_getTransactionReceipt",
          params: [hash],
        });
        if (receiptHasStatus(receipt)) return receipt;
      } catch {}
      if (i < 23) await new Promise((resolve) => window.setTimeout(resolve, 5000));
    }
    const error = new Error("交易已广播，但链上确认较慢，请稍后在交易记录或 BscScan 查看");
    error.code = "TX_CONFIRMATION_PENDING";
    throw error;
  };
  const report = (body) =>
    api("v1/wallet/tx/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  const invalidateQuote = () => {
    quoteRequestSequence += 1;
    state.quote = null;
    state.quoteKey = "";
    text("[data-quote-output], [data-quote-min], [data-quote-route]", "—");
    text("[data-quote-fee], [data-protocol-fee]", uiCopy("等待报价", "Awaiting quote"));
    text("[data-price-impact]", uiCopy("等待报价", "Awaiting quote"));
  };
  const renderLaunchDraftPreview = () => {
    const name = $("#token-name")?.value?.trim() || "—";
    const symbol = $("#token-symbol")?.value?.trim().toUpperCase() || "—";
    text("[data-preview-name]", name);
    text("[data-preview-ticker]", symbol);
    text("[data-preview-symbol]", symbol.slice(0, 2));
  };
  const clearLaunchReview = () => {
    text("[data-preview-name], [data-preview-ticker], [data-launch-review-chain], [data-launch-review-name], [data-launch-review-mode], [data-launch-review-quote], [data-launch-review-quote-address], [data-launch-review-curve], [data-launch-review-threshold], [data-launch-review-fee], [data-launch-review-initial-buy], [data-launch-review-recipient], [data-launch-review-factory], [data-launch-review-id], [data-launch-review-salt], [data-launch-review-predicted], [data-launch-review-description]", "—");
    // The draft header is not the signed launch snapshot. Keep the user's
    // entered name visible while invalidating every prepared transaction field.
    renderLaunchDraftPreview();
    const publishButton = $("[data-launch-publish]");
    if (publishButton) {
      publishButton.disabled = true;
      publishButton.setAttribute("disabled", "");
      publishButton.textContent = state.launchTerminal ? "发币流程已结束" : "正在自动准备发币参数…";
    }
  };
  const invalidateLaunchSnapshot = (force = false) => {
    if (state.launchBusy && !force) return;
    state.launchSnapshot = null;
    clearLaunchReview();
    text("[data-launch-review-tax]", "—");
  };
  const setLaunchTerminal = (message) => {
    state.launchSnapshot = null;
    state.launchTerminal = true;
    clearLaunchReview();
    const publishButton = $("[data-launch-publish]");
    if (publishButton) publishButton.textContent = message;
  };
  const resetLaunchFlow = () => {
    if (state.launchConfirmation) {
      toast("已有链上成功的发币结果等待保存，请先完成确认");
      return;
    }
    state.launchSnapshot = null;
    state.launchLogoUrl = "";
    document.documentElement.dataset.launchLogoUrl = "";
    state.launchTerminal = false;
    clearLaunchReview();
    const art = $("#create-art");
    if (art) {
      art.textContent = "MB";
      art.style.backgroundImage = "";
    }
    const fileName = $("[data-launch-file-name]");
    if (fileName) fileName.textContent = "尚未选择文件";
    const input = $("#token-logo-file");
    if (input) input.value = "";
    window.dispatchEvent(new CustomEvent("bitbt:launch-reset"));
  };
  const renderLaunchReview = (fee, prepared, description) => {
    text("[data-preview-name], [data-launch-review-name]", prepared.launch.token_name);
    text("[data-preview-ticker]", prepared.launch.symbol);
    text("[data-launch-review-quote]", prepared.launch.quote_token);
    text("[data-preview-symbol]", prepared.launch.symbol.slice(0, 2).toUpperCase());
    text("[data-launch-review-chain]", `${selectedNetwork().name} · ${prepared.launch.quote_token}`);
    text("[data-launch-review-network]", selectedNetwork().name);
    text("[data-launch-review-description]", description);
    text("[data-launch-review-mode]", `${state.launchMode === "community" ? uiCopy("社区收益 · ", "Community rewards · ") : ""}${state.curveMode === "custom" ? uiCopy("自定义线性曲线", "Custom linear curve") : uiCopy("标准线性曲线", "Standard linear curve")}`);
    text("[data-launch-review-quote-address]", prepared.quote_token_address);
    text("[data-launch-review-curve]", prepared.curve_address);
    text("[data-launch-review-threshold]", `${formatUnits(BigInt(prepared.migration_threshold_wei))} ${prepared.launch.quote_token}`);
    text("[data-launch-review-dex]", state.launchOptions?.dex_profiles?.find((profile) => profile.id === prepared.dex_profile)?.name || prepared.dex_profile || "PancakeSwap V2");
    text("[data-launch-review-initial-buy]", BigInt(prepared.initial_buy_wei || 0) > 0n ? uiMarkup`${formatUnits(BigInt(prepared.initial_buy_wei))} ${prepared.launch.quote_token} · 原子执行` : uiCopy("0 · 无初始买入", "0 · No initial buy"));
    text("[data-launch-review-fee]", `${formatUnits(BigInt(fee.fee_wei))} ${fee.native_symbol || selectedNetwork().native}`);
    text("[data-launch-review-recipient]", prepared.fee_recipient);
    text("[data-launch-review-factory]", prepared.factory_address);
    text("[data-launch-review-id]", prepared.launch.id);
    text("[data-launch-review-salt]", prepared.salt);
    text("[data-launch-review-predicted]", prepared.predicted_token_address);
    const publishButton = $("[data-launch-publish]");
    if (publishButton) {
      publishButton.disabled = false;
      publishButton.removeAttribute("disabled");
      publishButton.textContent = uiCopy("确认以上快照并发布代币", "Confirm snapshot and launch token");
    }
  };
  const renderLaunchTaxReview = (tax) => text("[data-launch-review-tax]", tax ? uiMarkup`买 ${tax.buy_tax_rate}% · 卖 ${tax.sell_tax_rate}% · ${tax.tax_duration_days === "0" ? uiCopy("永久", "Permanent") : uiMarkup`${tax.tax_duration_days} 天`} · 资金/销毁/分红/流动性 ${tax.funds_recipient_pct}/${tax.burn_pct}/${tax.holders_pct}/${tax.liquidity_pct}%` : uiCopy("标准代币 · 无转账税", "Standard token · no transfer tax"));
  const resetProviderState = (message = "钱包状态已变化，请重新连接") => {
    state.lastLaunchResult = null;
    renderLaunchResult();
    walletSessionEpoch += 1;
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_ADDRESS_KEY);
    sessionStorage.removeItem(PROVIDER_KIND_KEY);
    userDataRequestSequence += 1;
    balanceRequestSequence += 1;
    state.account = "";
    state.chainId = "";
    state.sessionExpiresAt = 0;
    state.balances = { quote: null, token: null, gas: null };
    state.myLaunches = [];
    state.history = [];
    state.walletHoldings = [];
    state.walletHoldingsComplete = false;
    state.tradeHistoryComplete = false;
    state.creatorRewards = [];
    state.holderDividends = [];
    state.v3FeeRewards = [];
    state.perpPosition = null;
    state.preparedPerpAction = null;
    state.preparedPerpRequest = null;
    state.perpSubmitting = false;
    state.perpQuoteBalance = null;
    state.perpServiceRequests = [];
    state.perpActivity = [];
    state.perpHistoryCursor = null;
    state.perpHistoryBusy = false;
    state.perpReadErrors = {};
    state.vaults = [];
    state.preparedVault = null;
    state.strategies = [];
    state.preparedStrategy = null;
    state.webhooks = [];
    state.alerts = [];
    state.points = null;
    state.referral = null;
    state.campaigns = [];
    state.kol = null;
    setLaunchAvailability(false);
    invalidateQuote();
    invalidateLaunchSnapshot();
    renderVaultPreview();
    renderVaults();
    renderStrategyStore();
    renderWebhooks();
    renderMyPanels();
    renderComments();
    $$("[data-wallet-label], .connect-global, .connect").forEach((node) => {
      (node.querySelector('[data-wallet-copy]') || node).textContent = "连接钱包";
      node.setAttribute('aria-label', '连接钱包');
      node.removeAttribute('title');
    });
    applySide(state.side === 'sell');
    renderPerpetual();
    if (message) toast(message);
  };
  const renderWalletState = () => {
    $$("[data-wallet-label], .connect-global, .connect").forEach((node) => {
      (node.querySelector('[data-wallet-copy]') || node).textContent = state.account ? short(state.account) : uiCopy("连接钱包", "Connect Wallet");
      node.setAttribute('aria-label', state.account ? uiMarkup`当前钱包 ${state.account}` : uiCopy("连接钱包", "Connect Wallet"));
      if (state.account) node.setAttribute('title', state.account);
      else node.removeAttribute('title');
    });
    const taxRecipient = $("#tax-recipient-wallet");
    if (state.taxEnabled && state.account && taxRecipient && !taxRecipient.value) taxRecipient.value = state.account;
    applySide(state.side === "sell");
    // Child perpetual screens stay mounted while navigation and SIWE restore
    // complete independently. Keep their signing summary on the same account
    // and contract snapshot as the global wallet control instead of leaving
    // the prototype placeholders visible after a successful restore.
    renderPerpetualServices();
  };
  const restoreSessionOnce = async () => {
    const token = sessionStorage.getItem(SESSION_KEY);
    const epoch = walletSessionEpoch;
    if (!token) return false;
    try {
      const session = await api("v1/auth/siwe/session");
      const sessionAddress = String(session.address || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(sessionAddress)) throw new Error("SIWE session address is invalid");
      if (sessionStorage.getItem(PROVIDER_KIND_KEY) === "walletconnect") {
        state.provider = await getWalletConnectProvider();
      }
      const provider = selectedProvider();
      if (provider) bindSelectedProviderEvents(provider);
      const accounts = provider ? await provider.request({ method: "eth_accounts" }) : [];
      const chainId = provider ? await provider.request({ method: "eth_chainId" }) : "";
      const providerAddress = String(accounts?.[0] || "").toLowerCase();
      const normalizedChain = normalizeChainId(chainId);
      if (epoch !== walletSessionEpoch || token !== sessionStorage.getItem(SESSION_KEY)) return false;
      if (providerAddress && providerAddress !== sessionAddress) {
        resetProviderState("钱包账户已变化，请重新连接");
        return false;
      }
      if (providerAddress && normalizedChain !== selectedNetwork().chainIdHex) {
        resetProviderState(`网络已变化，请重新连接 ${selectedNetwork().name} 钱包`);
        return false;
      }
      if (state.account !== (providerAddress || sessionAddress)) walletSessionEpoch += 1;
      state.account = providerAddress || sessionAddress;
      state.chainId = normalizedChain || selectedNetwork().chainIdHex;
      state.sessionExpiresAt = Date.now() + Number(session.expires_in || 0) * 1000;
      sessionStorage.setItem(SESSION_ADDRESS_KEY, sessionAddress);
      setLaunchAvailability(Boolean(providerAddress && normalizedChain === selectedNetwork().chainIdHex && launchEnabledForSelectedChain()));
      renderWalletState();
      await loadUserPanels().catch(() => undefined);
      if (state.selected && providerAddress) await refreshBalances().catch(() => undefined);
      return true;
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED" || error?.message?.includes("SIWE session")) resetProviderState("登录已过期，请重新连接钱包");
      return false;
    }
  };
  const restoreSession = () => {
    if (!sessionRestorePromise)
      sessionRestorePromise = restoreSessionOnce().finally(() => {
        sessionRestorePromise = null;
      });
    return sessionRestorePromise;
  };
  const assertProviderState = async () => {
    const provider = selectedProvider();
    if (!provider || !state.account) throw new Error("请先连接并验证钱包");
    const [accounts, chainId] = await Promise.all([provider.request({ method: "eth_accounts" }), provider.request({ method: "eth_chainId" })]);
    const account = String(accounts?.[0] || "").toLowerCase();
    const normalizedChain = normalizeChainId(chainId);
    if (account !== state.account || normalizedChain !== selectedNetwork().chainIdHex) {
      resetProviderState();
      throw new Error(`钱包账户或网络已变化，请重新连接 ${selectedNetwork().name} 钱包`);
    }
    state.chainId = normalizedChain;
    return { account, chainId: state.chainId };
  };
  const revalidateSessionOnce = async () => {
    if (!state.account || !sessionStorage.getItem(SESSION_KEY)) return;
    if (state.sessionExpiresAt && Date.now() >= state.sessionExpiresAt) {
      resetProviderState("登录已过期，请重新连接钱包");
      return;
    }
    try {
      const session = await api("v1/auth/siwe/session");
      const address = String(session.address || "").toLowerCase();
      if (address !== state.account) {
        resetProviderState("钱包账户已变化，请重新连接");
        return;
      }
      state.sessionExpiresAt = Date.now() + Number(session.expires_in || 0) * 1000;
      await assertProviderState();
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED") return;
      if (error?.message?.includes("钱包账户或网络已变化")) return;
    }
  };
  const revalidateSession = () => {
    if (sessionRestorePromise) return sessionRestorePromise;
    if (!sessionRevalidationPromise)
      sessionRevalidationPromise = revalidateSessionOnce().finally(() => {
        sessionRevalidationPromise = null;
      });
    return sessionRevalidationPromise;
  };
  const scheduleSessionRevalidation = () => {
    window.clearTimeout(sessionRevalidationTimer);
    sessionRevalidationTimer = window.setTimeout(() => {
      void revalidateSession();
    }, 200);
  };
  const bindSelectedProviderEvents = (provider) => {
    if (!provider?.on || boundProviders.has(provider)) return;
    boundProviders.add(provider);
    provider.on("accountsChanged", (accounts) => {
      if (provider !== state.provider) return;
      const next = String(accounts?.[0] || "").toLowerCase();
      if (!next) {
        if (provider.isWalletConnect) {
          resetProviderState("WalletConnect 已断开，请重新连接");
          return;
        }
        window.setTimeout(() => {
          if (provider === state.provider) void restoreSession();
        }, 350);
        return;
      }
      if (state.account && next === state.account) return;
      resetProviderState();
    });
    provider.on("chainChanged", (value) => {
      if (provider !== state.provider) return;
      const chainId = normalizeChainId(value);
      if (chainId === selectedNetwork().chainIdHex) {
        state.chainId = chainId;
        if (state.account && sessionStorage.getItem(SESSION_KEY)) {
          setLaunchAvailability(launchEnabledForSelectedChain());
          renderWalletState();
        }
        return;
      }
      resetProviderState(`网络已变化，请重新连接 ${selectedNetwork().name}`);
    });
    provider.on("disconnect", () => {
      if (provider !== state.provider) return;
      state.provider = null;
      resetProviderState("钱包连接已断开，请重新连接");
    });
  };
  const bindProviderEvents = () => {
    const provider = selectedProvider();
    if (provider) bindSelectedProviderEvents(provider);
    window.addEventListener("focus", scheduleSessionRevalidation);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleSessionRevalidation();
    });
  };
  const connectWalletOnce = async () => {
    const provider = await waitForProvider();
    state.provider = provider;
    bindSelectedProviderEvents(provider);
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const address = accounts?.[0];
    if (!address) throw new Error("钱包未返回账户");
    await ensureSelectedChain(provider);
    const noncePayload = await api("v1/auth/siwe/nonce");
    const domain = String(noncePayload.domain || "").toLowerCase();
    if (domain !== "bitbt.fun") throw new Error("SIWE domain 不受信任");
    const message = `bitbt.fun wants you to sign in with your Ethereum account:\n${address}\n\nSign in to BitBT PUMP.\n\nURI: https://bitbt.fun\nVersion: 1\nChain ID: ${selectedNetwork().chainId}\nNonce: ${noncePayload.nonce}\nIssued At: ${new Date().toISOString()}`;
    const signature = await provider.request({
      method: "personal_sign",
      params: [message, address],
    });
    const verified = await api("v1/auth/siwe/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    sessionStorage.setItem(SESSION_KEY, verified.token);
    walletSessionEpoch += 1;
    sessionStorage.setItem(PROVIDER_KIND_KEY, provider.isWalletConnect ? "walletconnect" : "injected");
    state.account = String(verified.address || address).toLowerCase();
    sessionStorage.setItem(SESSION_ADDRESS_KEY, state.account);
    state.chainId = selectedNetwork().chainIdHex;
    state.sessionExpiresAt = Date.now() + Number(verified.expires_in || 3600) * 1000;
    setLaunchAvailability(launchEnabledForSelectedChain());
    invalidateQuote();
    renderWalletState();
    await assertProviderState();
    await refreshBalances();
    await loadUserPanels().catch(() => undefined);
    toast("钱包已连接");
    return state.account;
  };
  const connectWallet = async () => {
    if (!walletConnectionPromise) walletConnectionPromise = connectWalletOnce();
    try {
      return await walletConnectionPromise;
    } finally {
      walletConnectionPromise = null;
    }
  };
  const walletPosition = (address, balanceRaw, token, detail) => {
    const key = String(address || "").toLowerCase();
    const rows = state.history.filter((entry) => String(entry?.token_address || "").toLowerCase() === key && ["buy", "sell"].includes(String(entry?.activity_type || "").toLowerCase()) && ["success", "confirmed"].includes(String(entry?.status || "").toLowerCase())).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    let indexedQuantity = 0;
    let averageCost = 0;
    rows.forEach((entry) => {
      const quantity = number(entry.token_amount);
      const quoteAmount = number(entry.quote_amount);
      if (!(quantity > 0) || !(quoteAmount >= 0)) return;
      if (String(entry.activity_type).toLowerCase() === "buy") {
        const next = indexedQuantity + quantity;
        averageCost = next > 0 ? (indexedQuantity * averageCost + quoteAmount) / next : 0;
        indexedQuantity = next;
      } else {
        indexedQuantity = Math.max(0, indexedQuantity - quantity);
        if (!indexedQuantity) averageCost = 0;
      }
    });
    const actualQuantity = balanceRaw == null ? indexedQuantity : number(formatUnits(balanceRaw, 18, 18));
    const quote = String(detail?.quote_token || token?.quote_token || "BNB").toUpperCase();
    const quotePrice = number(detail?.current_price_quote ?? detail?.current_price_bnb ?? token?.current_price_quote ?? token?.current_price_bnb);
    const usdPrice = number(token?.current_price_usd);
    const quoteUsdPrice = number(token?.quote_price_usd ?? detail?.quote_price_usd);
    const price = usdPrice > 0 ? usdPrice : quotePrice;
    const unit = usdPrice > 0 ? "USD" : quote;
    const value = actualQuantity > 0 && price > 0 ? actualQuantity * price : 0;
    const averageCostInUnit = unit === "USD" && quoteUsdPrice > 0 ? averageCost * quoteUsdPrice : averageCost;
    const cost = actualQuantity > 0 && averageCostInUnit > 0 ? actualQuantity * averageCostInUnit : 0;
    const pnl = value && cost ? value - cost : null;
    const returnPercent = pnl != null && cost > 0 ? (pnl * 100) / cost : null;
    const complete = state.tradeHistoryComplete && Math.abs(actualQuantity - indexedQuantity) <= Math.max(0.00000001, actualQuantity * 0.000001);
    if (!complete)
      return {
        actualQuantity,
        indexedQuantity,
        averageCost,
        value,
        cost: null,
        pnl: null,
        returnPercent: null,
        unit,
        quote,
        complete,
      };
    return {
      actualQuantity,
      indexedQuantity,
      averageCost,
      value,
      cost,
      pnl,
      returnPercent,
      unit,
      quote,
      complete,
    };
  };
  const renderWalletPosition = () => {
    if (!state.selected || !state.detail || state.balances.token == null) return;
    const position = walletPosition(tokenAddress(state.selected), state.balances.token, state.selected, state.detail);
    const amountLabel = (value) => (position.unit === "USD" ? usd(value) : `${decimal(value)} ${position.unit}`);
    text("[data-holding-value]", position.value > 0 ? amountLabel(position.value) : "—");
    text("[data-holding-cost]", position.averageCost > 0 ? `${decimal(position.averageCost)} ${position.quote}${position.complete ? "" : " · 部分成本"}` : "—");
    text("[data-holding-pnl]", position.pnl == null ? "—" : `${position.pnl >= 0 ? "+" : ""}${amountLabel(position.pnl)}`);
    text("[data-holding-return]", position.returnPercent == null ? "—" : `${position.returnPercent >= 0 ? "+" : ""}${position.returnPercent.toFixed(2)}%${position.complete ? "" : " · 部分成本"}`);
    let portfolioComplete = state.walletHoldingsComplete;
    const indexedPortfolioValue = state.walletHoldings.reduce((sum, holding) => {
      const address = String(holding.token_address || "").toLowerCase();
      const item = state.tokens.find((token) => tokenAddress(token).toLowerCase() === address);
      const price = number(item?.current_price_usd);
      const quantity = number(formatUnits(BigInt(holding.balance_raw || "0"), 18, 18));
      if (!(price > 0)) {
        portfolioComplete = false;
        return sum;
      }
      return sum + quantity * price;
    }, 0);
    const selectedIndexed = state.walletHoldings.find((holding) => String(holding.token_address || "").toLowerCase() === tokenAddress(state.selected).toLowerCase());
    const selectedIndexedValue = selectedIndexed ? number(formatUnits(BigInt(selectedIndexed.balance_raw || "0"), 18, 18)) * number(state.selected.current_price_usd) : 0;
    const portfolioValue = indexedPortfolioValue - selectedIndexedValue + (position.unit === "USD" ? position.value : 0);
    const share = portfolioComplete && position.unit === "USD" && position.value > 0 && portfolioValue > 0 ? Math.min(100, (position.value * 100) / portfolioValue) : null;
    text("[data-holding-share]", share == null ? "—" : `${share.toFixed(2)}%`);
    const bar = $("[data-holding-bar]");
    if (bar) bar.style.width = `${share || 0}%`;
  };
  const refreshBalances = async () => {
    const account = state.account;
    const provider = selectedProvider();
    const address = tokenAddress(state.selected).toLowerCase();
    if (!account || !state.detail || !provider || !/^0x[0-9a-f]{40}$/.test(address)) return;
    const requestSequence = ++balanceRequestSequence;
    const quote = state.detail.quote_token_address || quoteAddress(state.detail.quote_token);
    const gasPromise = walletNativeBalance(account, provider);
    const [gas, token, quoteBalance] = await Promise.all([gasPromise, walletTokenBalance(address, account, provider), quote ? walletTokenBalance(quote, account, provider) : gasPromise]);
    if (requestSequence !== balanceRequestSequence || state.account !== account || tokenAddress(state.selected).toLowerCase() !== address || selectedProvider() !== provider) return;
    state.balances = { gas, token, quote: quoteBalance };
    applySide(state.side === "sell");
    text("[data-holding-amount]", formatUnits(token));
    text("[data-holding-short]", formatUnits(token, 18, 4));
    renderWalletPosition();
  };
  const fetchCandles = (address, interval = state.chartInterval) => api(`v1/pump/candles?token_address=${encodeURIComponent(address)}&interval=${interval}&limit=1000`);
  const reloadCandles = async () => {
    const address = tokenAddress(state.selected).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return;
    const sequence = ++candleRequestSequence;
    const interval = state.chartInterval;
    const candles = await fetchCandles(address, interval);
    if (sequence !== candleRequestSequence || tokenAddress(state.selected).toLowerCase() !== address || state.chartInterval !== interval) return;
    state.candles = candles;
    drawCharts();
  };
  const loadDetail = async (token, { refreshBalance = true, forceDetail = false, refreshTrades = true, isCurrent = () => true } = {}) => {
    if (!tokenAddress(token)) return;
    const requestSequence = ++detailRequestSequence;
    state.selected = token;
    const address = tokenAddress(token).toLowerCase();
    const detailPromise = !forceDetail && state.details[address] ? Promise.resolve(state.details[address]) : api(`v1/pump/detail?address=${encodeURIComponent(tokenAddress(token))}`);
    const migratedKnown = token?.migrated === true || status(token) === "migrated";
    const [detail, trades, candles, knownProof] = await Promise.all([detailPromise, refreshTrades ? api(`v1/pump/trades?token_address=${encodeURIComponent(tokenAddress(token))}`) : Promise.resolve(state.trades), fetchCandles(address).catch(() => []), migratedKnown ? api(`v1/pump/migration-proof?token_address=${encodeURIComponent(address)}`).catch(() => null) : Promise.resolve(null)]);
    const proof = knownProof || (!migratedKnown && detail?.migrated === true ? await api(`v1/pump/migration-proof?token_address=${encodeURIComponent(address)}`).catch(() => null) : null);
    if (!isCurrent() || requestSequence !== detailRequestSequence || tokenAddress(state.selected).toLowerCase() !== address) return false;
    state.detail = detail;
    state.details[address] = detail;
    state.trades = trades;
    state.candles = candles;
    state.migrationProof = proof;
    selectedDetailAddress = address;
    if (refreshBalance) state.balances = { quote: null, token: null, gas: null };
    renderSelected();
    renderTradeConfig();
    renderLiveRows();
    drawCharts();
    if (state.account && refreshBalance) await refreshBalances();
    return true;
  };
  const activateDetail = () => {
    const detailPanel = $('[data-panel="detail"]');
    if (!detailPanel) return;
    $$("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel === detailPanel));
    applyScreenChrome('detail');
    detailPanel.scrollTop = 0;
  };
  const openToken = async (token, { historyMode = "push", fallbackDetail = null, isCurrent = null } = {}) => {
    const navigation = isCurrent ? navigationEpoch : ++navigationEpoch;
    const current = () => navigationEpoch === navigation && (!isCurrent || isCurrent());
    if (!current()) return false;
    try {
      if ((await loadDetail(token, { isCurrent: current })) === false) return false;
    } catch (error) {
      if (!current()) return false;
      if (!fallbackDetail) throw error;
      const address = tokenAddress(token).toLowerCase();
      if (tokenAddress(state.selected).toLowerCase() !== address) return;
      state.selected = token;
      state.detail = fallbackDetail;
      state.details[address] = fallbackDetail;
      state.trades = [];
      state.candles = [];
      state.migrationProof = null;
      selectedDetailAddress = address;
      renderSelected();
      renderTradeConfig();
      renderLiveRows();
      drawCharts();
    }
    if (!current()) return false;
    activateDetail();
    if (historyMode) setTokenPath(tokenAddress(token), historyMode);
    return true;
  };
  const openTokenAddress = async (address, options = {}) => {
    const normalized = String(address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error("代币地址无效");
    let token = state.tokens.find((item) => tokenAddress(item).toLowerCase() === normalized);
    if (!token && state.details[normalized]) token = { ...state.details[normalized], contract_address: normalized };
    if (!token) {
      const detail = await api(`v1/pump/detail?address=${encodeURIComponent(normalized)}`);
      state.details[normalized] = detail;
      token = { ...detail, contract_address: normalized };
      state.tokens.unshift(token);
      renderTokens();
    }
    await openToken(token, options);
  };
  const drawCharts = () => {
    if (!window.LightweightCharts) return;
    const setChartEmpty = (message, empty) =>
      $$("[data-chart-empty]").forEach((node) => {
        node.textContent = message;
        node.hidden = !empty;
      });
    if (!state.candles.length) {
      ["#launch-kline", "#trade-kline"].forEach((selector) => {
        const entry = charts.get(selector);
        entry?.chart.remove?.();
        charts.delete(selector);
        $(selector)?.replaceChildren();
      });
      setChartEmpty(uiCopy("暂无真实成交，完成首笔交易后生成 K 线。", "No trades yet. Candles appear after the first trade."), true);
      return;
    }
    const candles = state.candles
      .map((candle) => ({
        time: Number(candle.open_time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume_quote),
      }))
      .filter((candle) => Number.isFinite(candle.time) && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0);
    if (!candles.length) {
      setChartEmpty("成交数据暂时无法生成有效 K 线。", true);
      return;
    }
    setChartEmpty("", false);
    const selected = new Set(state.chartIndicators);
    const smallestPrice = Math.min(...candles.map((candle) => candle.low));
    const pricePrecision = smallestPrice >= 1 ? 4 : Math.min(14, Math.max(6, Math.ceil(-Math.log10(smallestPrice)) + 4));
    const chartPriceFormat = { type: 'price', precision: pricePrecision, minMove: 10 ** -pricePrecision };
    const subIndicators = ["VOL", "MACD", "KDJ", "RSI"].filter((name) => selected.has(name));
    const viewportWidth = Number(globalThis.innerWidth || 1200);
    const baseHeight = viewportWidth >= 1440 ? 390 : viewportWidth <= 440 ? 250 : viewportWidth <= 760 ? 280 : viewportWidth <= 1100 ? 320 : 260;
    const chartHeight = Math.min(520, baseHeight + Math.max(0, subIndicators.length - 1) * 82);
    ["#launch-kline", "#trade-kline"].forEach((selector) => {
      const host = $(selector);
      if (!host || !candles.length) return;
      const wrap = host.parentElement;
      wrap?.classList.toggle("has-sub-indicator", subIndicators.length > 1);
      if (wrap) wrap.style.height = chartHeight + "px";
      let entry = charts.get(selector);
      let created = false;
      if (!entry || entry.host !== host) {
        entry?.chart.remove?.();
        host.replaceChildren();
        const chart = window.LightweightCharts.createChart(host, {
          localization: chartLocalization(),
          width: host.clientWidth || 640,
          height: chartHeight,
          layout: {
            background: { type: "solid", color: "#0a0b0c" },
            textColor: "#777c78",
          },
          grid: {
            vertLines: { color: "#1d2021" },
            horzLines: { color: "#1d2021" },
          },
          rightPriceScale: {
            borderColor: "#303334",
            scaleMargins: { top: 0.08, bottom: 0.25 },
          },
          timeScale: { borderColor: "#303334", timeVisible: true, tickMarkFormatter: chartTick },
        });
        const series = chart.addCandlestickSeries({
          upColor: "#32cf7c",
          downColor: "#ff5c73",
          borderUpColor: "#32cf7c",
          borderDownColor: "#ff5c73",
          wickUpColor: "#32cf7c",
          wickDownColor: "#ff5c73",
          priceFormat: chartPriceFormat,
        });
        const volumeSeries = chart.addHistogramSeries({
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          lastValueVisible: false,
          priceLineVisible: false,
        });
        entry = { host, chart, series, volumeSeries, indicatorSeries: [], renderKey: "", dataKey: "" };
        charts.set(selector, entry);
        created = true;
      }
      const newest = candles[candles.length - 1];
      const dataKey = [tokenAddress(state.selected), state.chartInterval, state.chartIndicators.join(','), candles.length, newest.time, newest.open, newest.high, newest.low, newest.close, newest.volume].join(':');
      if (!created && entry.dataKey === dataKey) {
        entry.chart.applyOptions?.({ width: host.clientWidth || 640, height: chartHeight });
        return;
      }
      entry.dataKey = dataKey;
      entry.indicatorSeries.forEach((series) => { try { entry.chart.removeSeries(series); } catch {} });
      entry.indicatorSeries = [];
      const addLine = (data, color, priceScaleId = "right") => {
        const series = entry.chart.addLineSeries({ color, lineWidth: 1, priceScaleId, priceFormat: priceScaleId === 'right' ? chartPriceFormat : { type: 'price', precision: 6, minMove: 0.000001 }, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        series.setData(data);
        entry.indicatorSeries.push(series);
      };
      const legend = [];
      const addLegend = (name, data, css = "") => {
        const value = lastKlineValue(data);
        if (Number.isFinite(value)) legend.push('<b class="' + css + '">' + name + " " + escapeHtml(formatPerpPrice(value)) + "</b>");
      };
      entry.series.applyOptions({ priceFormat: chartPriceFormat });
      entry.series.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      if (selected.has("VOL")) {
        entry.volumeSeries.setData(candles.map((candle) => ({ time: candle.time, value: Number.isFinite(candle.volume) ? candle.volume : 0, color: candle.close >= candle.open ? "rgba(50,207,124,.45)" : "rgba(255,92,115,.45)" })));
      } else entry.volumeSeries.setData([]);
      if (selected.has("MA")) {
        [[5, "#e5f453", "lime"], [10, "#47c7ff", "cyan"], [20, "#b58cff", "violet"]].forEach(([period, color, css]) => { const data = klineLine(candles, period, (candle) => candle.close); addLine(data, color); addLegend("MA" + period, data, css); });
      }
      if (selected.has("EMA")) {
        [[12, "#47c7ff", "cyan"], [26, "#ffad5c", "orange"]].forEach(([period, color, css]) => { const data = klineEma(candles, period); addLine(data, color); addLegend("EMA" + period, data, css); });
      }
      if (selected.has("BOLL")) {
        const boll = klineBoll(candles); addLine(boll.middle, "#e5f453"); addLine(boll.upper, "#47c7ff"); addLine(boll.lower, "#b58cff"); addLegend("BOLL", boll.middle, "lime"); addLegend("UP", boll.upper, "cyan"); addLegend("LOW", boll.lower, "violet");
      }
      if (selected.has("ST")) { const trend = klineSuperTrend(candles); addLine(trend, "#ffad5c"); addLegend("ST(14,3)", trend, "orange"); }
      const lowerHeight = subIndicators.length ? Math.min(0.18, 0.58 / subIndicators.length) : 0;
      let lowerBottom = 0.04;
      [...subIndicators].reverse().forEach((name) => {
        const scaleId = name === "VOL" ? "volume" : name.toLowerCase();
        entry.chart.priceScale(scaleId).applyOptions({ visible: true, borderColor: "#303334", scaleMargins: { top: 1 - lowerBottom - lowerHeight, bottom: lowerBottom } });
        lowerBottom += lowerHeight;
      });
      if (!selected.has("VOL")) entry.chart.priceScale("volume").applyOptions({ visible: false, scaleMargins: { top: 1, bottom: 0 } });
      if (selected.has("MACD")) {
        const macd = klineMacd(candles); const histogram = entry.chart.addHistogramSeries({ priceScaleId: "macd", lastValueVisible: false, priceLineVisible: false }); histogram.setData(macd.histogram); entry.indicatorSeries.push(histogram); addLine(macd.dif, "#47c7ff", "macd"); addLine(macd.signal, "#ffad5c", "macd"); addLegend("DIF", macd.dif, "cyan"); addLegend("DEA", macd.signal, "orange");
      }
      if (selected.has("KDJ")) {
        const kdj = klineKdj(candles); addLine(kdj.k, "#e5f453", "kdj"); addLine(kdj.d, "#47c7ff", "kdj"); addLine(kdj.j, "#b58cff", "kdj"); addLegend("K", kdj.k, "lime"); addLegend("D", kdj.d, "cyan"); addLegend("J", kdj.j, "violet");
      }
      if (selected.has("RSI")) { const rsi = klineRsi(candles); addLine(rsi, "#b58cff", "rsi"); addLegend("RSI14", rsi, "violet"); }
      entry.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: Math.min(0.7, lowerBottom + 0.02) } });
      const legendHost = wrap?.previousElementSibling?.matches?.('[data-chart-legend]') ? wrap.previousElementSibling : null;
      if (legendHost) legendHost.innerHTML = "<b>O " + escapeHtml(formatPerpPrice(newest.open)) + "</b><b>H " + escapeHtml(formatPerpPrice(newest.high)) + "</b><b>L " + escapeHtml(formatPerpPrice(newest.low)) + "</b><b>C " + escapeHtml(formatPerpPrice(newest.close)) + "</b>" + legend.join("");
      entry.chart.applyOptions?.({ width: host.clientWidth || 640, height: chartHeight });
      const renderKey = tokenAddress(state.selected) + ":" + state.chartInterval;
      if (created || entry.renderKey !== renderKey) entry.chart.timeScale().fitContent();
      entry.renderKey = renderKey;
    });
  };
  const renderProjectSummary = (detail) => {
    const container = $("[data-token-project-summary]");
    const description = $("[data-token-description]");
    const links = $("[data-token-socials]");
    if (!container || !description || !links) return;
    const descriptionText = String(detail?.description || "").trim();
    description.textContent = descriptionText;
    description.hidden = !descriptionText;
    links.replaceChildren();
    [
      [uiCopy("官网", "Website"), detail?.website],
      ["X", detail?.twitter],
      ["Telegram", detail?.telegram],
      ["Discord", detail?.discord],
    ].forEach(([label, rawUrl]) => {
      const href = safeExternalUrl(rawUrl);
      if (!href) return;
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = label;
      links.append(anchor);
    });
    container.hidden = !descriptionText && !links.childElementCount;
  };
  const renderSelected = ({ refreshQuote = true } = {}) => {
    const token = state.selected;
    const detail = state.detail;
    if (!token || !detail) return;
    const progress = Math.max(0, Math.min(100, number(detail.progress_percent)));
    const address = tokenAddress(token);
    const quote = String(detail.quote_token || token.quote_token || "BNB").toUpperCase();
    const raised = detail.total_raised_quote ?? detail.total_raised_bnb;
    const sold = detail.tokens_sold;
    const dayStart = Date.now() - 86400000;
    const recentTrades = state.trades.filter((trade) => Number(trade.timestamp) * (Number(trade.timestamp) > 1e12 ? 1 : 1000) >= dayStart);
    const volume = Number(recentTrades.reduce((sum, trade) => sum + number(trade.quote_amount || trade.bnb_amount), 0).toFixed(12));
    const selectedStatus = status(detail) || status(token) || "deployed";
    const priceQuote = detail.current_price_quote ?? detail.current_price_bnb ?? token.current_price_quote ?? token.current_price_bnb;
    const priceDisplay = hasNumber(token.current_price_usd) ? usd(token.current_price_usd, false) : `${displayPrice(priceQuote, decimal(priceQuote))} ${quote}`;
    const marketCapDisplay = hasNumber(token.market_cap_usd) ? usd(token.market_cap_usd) : hasNumber(token.market_cap_quote) ? `${decimal(token.market_cap_quote)} ${quote}` : "—";
    const fdvDisplay = hasNumber(token.fdv_usd) ? usd(token.fdv_usd) : hasNumber(token.fdv_quote) ? `${decimal(token.fdv_quote)} ${quote}` : "—";
    const v3Position = state.migrationProof?.position_token_id;
    const liquidityDisplay = detail.migrated ? (v3Position ? `V3 Position #${v3Position}` : state.migrationProof?.reserve_verified ? `${decimal(state.migrationProof.estimated_liquidity_quote)} ${quote}` : uiCopy("待链上验证", "Pending on-chain verification")) : `${decimal(raised)} ${quote}`;
    const volumeDisplay = hasNumber(token.volume_usd_24h) ? usd(token.volume_usd_24h) : token.volume_quote_24h != null ? `${decimal(token.volume_quote_24h)} ${quote}` : recentTrades.length ? `${decimal(volume)} ${quote}` : "—";
    const netFlowDisplay = hasNumber(token.net_flow_usd_24h) ? usd(token.net_flow_usd_24h) : hasNumber(token.net_flow_quote_24h) ? `${decimal(token.net_flow_quote_24h)} ${quote}` : "—";
    const buyVolumeDisplay = hasNumber(token.buy_volume_usd_24h) ? usd(token.buy_volume_usd_24h) : hasNumber(token.buy_volume_quote_24h) ? `${decimal(token.buy_volume_quote_24h)} ${quote}` : "—";
    const sellVolumeDisplay = hasNumber(token.sell_volume_usd_24h) ? usd(token.sell_volume_usd_24h) : hasNumber(token.sell_volume_quote_24h) ? `${decimal(token.sell_volume_quote_24h)} ${quote}` : "—";
    const buyRatioDisplay = hasNumber(token.buy_ratio_24h_percent) ? `${number(token.buy_ratio_24h_percent).toFixed(1)}%` : "—";
    const buyTax = number(detail.buy_tax_percent ?? token.buy_tax_percent);
    const sellTax = number(detail.sell_tax_percent ?? token.sell_tax_percent);
    const taxLabel = detail.tax_enabled || token.tax_enabled ? uiMarkup`买 ${buyTax}% / 卖 ${sellTax}%` : "0% / 0%";
    renderProjectSummary(detail);
    text("[data-active-symbol]", detail.symbol || token.symbol);
    text("[data-active-quote]", quote);
    text("[data-active-status]", selectedStatus.toUpperCase());
    text("[data-active-address]", `${short(address)} · ${selectedNetwork().shortName.toUpperCase()}`);
    text("[data-active-price-label]", hasNumber(token.current_price_usd) ? "PRICE / USD" : `PRICE / ${quote}`);
    text("[data-active-price]", priceDisplay);
    text("[data-active-market]", marketCapDisplay);
    text("[data-active-fdv]", fdvDisplay);
    text("[data-active-liquidity]", liquidityDisplay);
    text("[data-active-rank]", selectedStatus);
    text("[data-active-curve]", `${progress.toFixed(2)}%`);
    text("[data-active-volume]", volumeDisplay);
    text("[data-active-net-flow], [data-chain-net-flow]", netFlowDisplay);
    text("[data-active-buy-ratio]", buyRatioDisplay);
    text("[data-chain-buy-sell]", `${buyVolumeDisplay} / ${sellVolumeDisplay}`);
    text("[data-active-raised]", `${decimal(raised)} ${quote}`);
    text("[data-active-trade-count]", token.trade_count_24h ?? state.trades.length);
    text("[data-trade-count-label]", uiMarkup`共 ${state.trades.length} 笔`);
    text("[data-active-sold]", sold == null ? "—" : `${decimal(sold)} ${detail.symbol || token.symbol}`);
    text("[data-active-reserve]", detail.migrated ? (v3Position ? uiMarkup`PancakeSwap V3 NFT #${v3Position} · 流动性 ${state.migrationProof?.position_liquidity_raw || "—"}` : state.migrationProof?.reserve_verified ? uiMarkup`DEX 流动性 ≈ ${decimal(state.migrationProof.estimated_liquidity_quote)} ${quote}` : "DEX 储备待链上验证") : uiMarkup`曲线储备 ${decimal(raised)} ${quote}`);
    text("[data-active-remaining]", detail.migrated ? (state.migrationProof?.diagnostic === "verified" ? uiMarkup`${detail.dex_profile || "DEX V2"} 迁移与储备已验证` : uiMarkup`迁移诊断：${state.migrationProof?.diagnostic || "读取中"}`) : uiCopy("迁移剩余由链上进度决定", "Remaining migration amount follows on-chain progress"));
    text("[data-chain-contract]", address);
    text("[data-chain-curve]", detail.curve_address || "—");
    text("[data-chain-created]", formatDate(detail.submitted_at || token.submitted_at));
    text("[data-chain-creator]", detail.creator || token.creator_address || "—");
    text("[data-chain-status]", selectedStatus);
    text("[data-token-tax-detail], [data-token-tax]", taxLabel);
    text("[data-migration-router]", state.migrationProof?.router_verified ? uiMarkup`${short(state.migrationProof.router_address)} · 已验证` : state.migrationProof?.router_address ? uiMarkup`${short(state.migrationProof.router_address)} · 未验证` : "尚未读取");
    text("[data-migration-pair]", v3Position ? `V3 Position #${v3Position} · Fee ${state.migrationProof?.position_fee_tier || "—"}` : state.migrationProof?.pair_address || (detail.migrated ? "迁移证明暂不可用" : uiCopy("尚未迁移", "Not migrated")));
    text("[data-migration-lp]", state.migrationProof?.lp_assignment_verified ? (v3Position ? uiMarkup`手续费分配器 ${short(state.migrationProof.lp_receiver_address)} · 已验证` : `${formatUnits(BigInt(state.migrationProof.lp_burned_balance_raw || "0"), 18, 6)} LP · ${state.migrationProof.lp_burn_verified ? "已销毁" : uiMarkup`已分配 ${short(state.migrationProof.lp_receiver_address)}`}`) : detail.migrated ? uiCopy("未验证", "Not verified") : uiCopy("尚未迁移", "Not migrated"));
    text("[data-holding-amount]", state.balances.token == null ? "—" : formatUnits(state.balances.token));
    text("[data-holding-short]", state.balances.token == null ? "—" : formatUnits(state.balances.token, 18, 4));
    renderWalletPosition();
    text("[data-active-change]", Number.isFinite(Number(token.price_change_24h_percent)) ? `${Number(token.price_change_24h_percent) >= 0 ? "+" : ""}${Number(token.price_change_24h_percent).toFixed(2)}%` : "—");
    $$("[data-active-image]").forEach((node) => {
      node.src = assetImage({ ...token, ...detail });
    });
    $$("[data-active-curve-bar]").forEach((node) => {
      node.style.width = `${progress}%`;
    });
    $$("[data-copy-token-address]").forEach((node) => {
      node.dataset.tokenAddress = address;
      node.title = uiMarkup`复制完整地址 ${address}`;
    });
    const favorite = state.favorites.some((item) => String(item.contract_address || "").toLowerCase() === address.toLowerCase());
    $$("[data-favorite-token]").forEach((node) => {
      node.classList.toggle("active", favorite);
      node.title = favorite ? uiCopy("取消自选", "Remove from watchlist") : uiCopy("加入自选", "Add to watchlist");
    });
    const holderPayload = state.holders[address.toLowerCase()];
    text('[data-detail-holder-total]', hasNumber(holderPayload?.holders_count ?? token.holders_count) ? String(holderPayload?.holders_count ?? token.holders_count) : '—');
    const topTen = holderPayload?.top_holders?.slice(0, 10);
    text('[data-detail-top-ten]', holderPayload?.available !== false && topTen?.length && topTen.every(holder => hasNumber(holder.percentage)) ? `${topTen.reduce((sum, holder) => sum + Number(holder.percentage), 0).toFixed(2)}%` : '—');
    if (holderPayload) renderHolders(address, holderPayload);
    else {
      text("[data-holder-count]", uiCopy("点击持有人页加载", "Open Holders to load"));
      const holderList = $("[data-holder-list]");
      if (holderList) holderList.innerHTML = uiMarkup`<p class="footer-note">打开本页后按需读取真实持有人数据。</p>`;
    }
    const liveRows = state.trades
      .slice(0, 20)
      .map((trade) => `<div class="live-row"><span class="trade-type ${String(trade.trade_type).toLowerCase() === "buy" ? "buy" : "sell"}">${escapeHtml(String(trade.trade_type || "TRADE").toUpperCase())}</span><div><p><b>${escapeHtml(short(trade.trader))}</b></p><small>${escapeHtml(decimal(trade.quote_amount || trade.bnb_amount))} ${escapeHtml(quote)} · ${escapeHtml(decimal(trade.token_amount))} ${escapeHtml(detail.symbol)}</small></div><small>${escapeHtml(age(new Date(trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000).toISOString()))}</small></div>`)
      .join("");
    const tradePanel = $('[data-panel="detail"] [data-detail-panel="trades"]');
    if (tradePanel) {
      [...tradePanel.querySelectorAll(".live-row, .footer-note")].forEach((node) => node.remove());
      tradePanel.querySelector(".section-title")?.insertAdjacentHTML("afterend", liveRows || uiMarkup`<p class="footer-note">暂无真实成交记录。</p>`);
    }
    renderComments(address.toLowerCase());
    renderAlertButtons();
    applySide(state.side === "sell", { refreshQuote });
  };
  const quoteBinding = (response, address, amount) => {
    const output = state.side === "buy" ? response?.tokens_out : response?.quote_out_raw || response?.quote_out || response?.bnb_out;
    const quoteAddressValue = String(response?.quote_token_address || "").toLowerCase();
    const expiry = Number(response?.expires_at) * (Number(response?.expires_at) < 1e12 ? 1000 : 1);
    const detailQuote = String(state.detail?.quote_token_address || ZERO_ADDRESS).toLowerCase();
    const quoteToken = String(response?.quote_token || "").toUpperCase();
    const quoteKind = quoteAddressValue === ZERO_ADDRESS ? "native" : "erc20";
    const routeType = String(response?.route_type || "bonding_curve").toLowerCase();
    const routerAddress = String(response?.router_address || "").toLowerCase();
    const pairAddress = String(response?.pair_address || "").toLowerCase();
    const dexKind = String(response?.dex_kind || (routeType === "bonding_curve" ? "" : "v2")).toLowerCase();
    const executionTarget = String(response?.execution_target || routerAddress).toLowerCase();
    const executionData = String(response?.execution_data || "").toLowerCase();
    const approvalSpender = String(response?.approval_spender || executionTarget).toLowerCase();
    const migratedRoute = routeType !== "bonding_curve";
    const outputRaw = String(output || "");
    const minOutRaw = String(response?.min_out || "");
    const slippageBps = Number(response?.slippage_bps);
    let minOutValid = false;
    if (/^\d+$/.test(outputRaw) && /^\d+$/.test(minOutRaw) && Number.isInteger(slippageBps) && slippageBps === USER_SLIPPAGE_BPS) {
      const outputBig = BigInt(outputRaw);
      const minOut = BigInt(minOutRaw);
      minOutValid = minOut > 0n && minOut === (outputBig * BigInt(10000 - slippageBps)) / 10000n;
    }
    const chainId = normalizeChainId(response?.chain_id);
    const addressKindValid = quoteKind === "native" ? quoteAddressValue === ZERO_ADDRESS && detailQuote === ZERO_ADDRESS : /^0x[0-9a-fA-F]{40}$/.test(quoteAddressValue) && quoteAddressValue !== ZERO_ADDRESS && quoteAddressValue === detailQuote;
    const v2RouteValid = dexKind === "v2" && /^0x[0-9a-f]{40}$/.test(pairAddress) && pairAddress !== ZERO_ADDRESS && (!state.migrationProof?.pair_address || pairAddress === String(state.migrationProof.pair_address).toLowerCase()) && executionTarget === routerAddress && !executionData;
    const expectedV3Selector = state.side === "buy" ? (quoteKind === "native" ? "0xd29d34e3" : "0x68080507") : quoteKind === "native" ? "0x438698ac" : "0xb9b74f5d";
    const v3RouteValid = dexKind === "v3" && !pairAddress && state.migrationProof?.v3_trade_adapter_verified === true && state.migrationProof?.v3_quoter_verified === true && executionTarget === String(state.migrationProof?.v3_trade_adapter || "").toLowerCase() && approvalSpender === executionTarget && /^0x[0-9a-f]+$/.test(executionData) && executionData.startsWith(expectedV3Selector);
    const routeValid = migratedRoute ? state.detail?.migrated === true && routeType === String(state.detail?.dex_profile || "pancakeswap_v2").toLowerCase() && routerAddress === String(state.detail?.dex_router || "").toLowerCase() && state.migrationProof?.router_verified === true && state.migrationProof?.factory_verified === true && state.migrationProof?.wrapped_native_verified === true && state.migrationProof?.pair_init_hash_verified === true && (v2RouteValid || v3RouteValid) : routeType === "bonding_curve" && state.detail?.migrated !== true && !routerAddress && !pairAddress && !executionData;
    if (!response || !/^0x[0-9a-fA-F]{40}$/.test(response.token_address || "") || response.token_address.toLowerCase() !== address.toLowerCase() || !/^0x[0-9a-fA-F]{40}$/.test(response.curve_address || "") || response.curve_address.toLowerCase() !== String(state.detail.curve_address || "").toLowerCase() || !addressKindValid || !routeValid || chainId !== selectedNetwork().chainIdHex || !response.quote_id || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 35000 || !response.quote_token || quoteToken !== String(state.detail.quote_token).toUpperCase() || !/^\d+$/.test(outputRaw) || !minOutValid) throw new Error("报价缺少有效且完整的链、代币、路由、计价币或滑点保护");
    return {
      response,
      quoteId: String(response.quote_id),
      quoteKind,
      routeType,
      routerAddress,
      pairAddress,
      dexKind,
      executionTarget,
      executionData,
      approvalSpender,
      tokenAddress: address.toLowerCase(),
      curveAddress: response.curve_address.toLowerCase(),
      quoteTokenAddress: quoteAddressValue,
      quoteToken,
      account: (state.account || "").toLowerCase(),
      chainId,
      side: state.side,
      amount,
      output: outputRaw,
      minOut: BigInt(minOutRaw),
      slippageBps,
      expiresAt: expiry,
    };
  };
  const assertQuoteBinding = async () => {
    if (!state.quote || Date.now() >= state.quote.expiresAt) {
      invalidateQuote();
      throw new Error("报价已过期，请重新获取");
    }
    const provider = await assertProviderState();
    const address = tokenAddress(state.selected).toLowerCase();
    const detailCurve = String(state.detail?.curve_address || "").toLowerCase();
    const detailQuote = String(state.detail?.quote_token_address || ZERO_ADDRESS).toLowerCase();
    const currentQuoteKind = detailQuote === ZERO_ADDRESS ? "native" : "erc20";
    const currentRoute = state.detail?.migrated === true ? String(state.detail?.dex_profile || "pancakeswap_v2").toLowerCase() : "bonding_curve";
    const expectedMin = state.quote.output ? (BigInt(state.quote.output) * BigInt(10000 - USER_SLIPPAGE_BPS)) / 10000n : 0n;
    if (!state.quote.quoteId || state.quote.tokenAddress !== address || state.quote.curveAddress !== detailCurve || state.quote.quoteTokenAddress !== detailQuote || state.quote.quoteKind !== currentQuoteKind || state.quote.routeType !== currentRoute || (currentRoute !== "bonding_curve" && state.quote.routerAddress !== String(state.detail?.dex_router || "").toLowerCase()) || (state.quote.dexKind === "v3" && (state.quote.executionTarget !== String(state.migrationProof?.v3_trade_adapter || "").toLowerCase() || state.quote.approvalSpender !== state.quote.executionTarget)) || state.quote.account !== provider.account || state.quote.chainId !== provider.chainId || state.quote.side !== state.side || state.quote.amount !== $("#trade-amount")?.value?.trim() || state.quote.quoteToken !== String(state.detail.quote_token).toUpperCase() || state.quote.slippageBps !== USER_SLIPPAGE_BPS || state.quote.minOut <= 0n || state.quote.minOut !== expectedMin) {
      invalidateQuote();
      throw new Error("报价与当前代币、路由、钱包、网络或滑点政策不匹配");
    }
    return state.quote;
  };
  const updateQuote = async () => {
    if (!state.selected || !state.detail) return;
    const input = $("#trade-amount");
    const amount = input?.value?.trim();
    if (!amount || number(amount) <= 0) {
      invalidateQuote();
      return;
    }
    const requestSequence = ++quoteRequestSequence;
    const address = tokenAddress(state.selected);
    const side = state.side;
    const response = side === "buy" ? await api(`v1/pump/buy-quote?token_address=${encodeURIComponent(address)}&quote_amount=${encodeURIComponent(amount)}`) : await api(`v1/pump/sell-quote?token_address=${encodeURIComponent(address)}&token_amount=${encodeURIComponent(amount)}`);
    if (requestSequence !== quoteRequestSequence || side !== state.side || address.toLowerCase() !== tokenAddress(state.selected).toLowerCase() || amount !== $("#trade-amount")?.value?.trim()) return;
    state.quote = quoteBinding(response, address, amount);
    state.quoteKey = `${side}:${address}:${amount}:${state.account}:${state.chainId}`;
    const outputUnit = side === "buy" ? state.detail.symbol : state.detail.quote_token;
    const isDex = state.quote.routeType !== "bonding_curve";
    const feeRate = String(response.fee_rate_percent || "").trim();
    const feeAmount = decimal(response.fee_quote ?? response.fee_bnb);
    text("[data-quote-output]", `${baseUnits(state.quote.output, 8)} ${outputUnit}`);
    text("[data-quote-min]", `${baseUnits(state.quote.minOut.toString(), 8)} ${outputUnit}`);
    text("[data-quote-route]", isDex ? `${state.detail.quote_token} / ${state.detail.dex_profile === "pancakeswap_v2" ? "PancakeSwap V2" : state.detail.dex_profile} / ${state.detail.symbol}` : side === "buy" ? `${state.detail.quote_token} / 联合曲线` : `联合曲线 / ${state.detail.quote_token}`);
    text("[data-quote-fee]", isDex ? "PancakeSwap 池费已计入报价" : feeRate ? `${feeRate} · ${feeAmount} ${state.detail.quote_token}` : `${feeAmount} ${state.detail.quote_token}`);
    text("[data-protocol-fee]", isDex ? "DEX 池费 + 代币税（如有）" : feeRate || "以实时报价为准");
    text("[data-slippage-value], [data-slippage-label]", `${(state.quote.slippageBps / 100).toFixed(0)}% · 固定`);
    text("[data-price-impact]", priceImpactLabel(response.price_impact_percent));
  };
  const applySideBase = (sell, { refreshQuote = true } = {}) => {
    state.side = sell ? "sell" : "buy";
    $$("[data-trade-side]").forEach((node) => node.classList.toggle("active", (node.dataset.tradeSide === "sell") === sell));
    const token = state.selected;
    const detail = state.detail;
    const submit = $("#trade-submit");
    if (!token || !detail) {
      if (submit) {
        submit.disabled = true;
        submit.textContent = state.account ? uiCopy("请先选择代币", "Select a token first") : uiCopy("请先连接钱包并选择代币", "Connect wallet and select a token");
      }
      return;
    }
    const balance = sell ? state.balances.token : state.balances.quote;
    const unit = sell ? detail.symbol : detail.quote_token;
    text("[data-order-label]", sell ? uiCopy("卖出数量", "Sell amount") : uiCopy("支付", "You pay"));
    text("[data-order-unit]", unit);
    text("[data-order-balance]", balance == null ? uiCopy("钱包余额 —", "Wallet balance —") : uiMarkup`钱包余额 ${formatUnits(balance)} ${unit}`);
    if (!sell) text("[data-fixed-buy-balance]", balance == null ? uiMarkup`余额 — ${unit}` : uiMarkup`余额 ${formatUnits(balance)} ${unit}`);
    if (submit) {
      submit.disabled = state.busy || !state.account;
      submit.textContent = state.account ? `${sell ? uiCopy("卖出", "Sell") : uiCopy("买入", "Buy")} ${sell ? detail.symbol : token.symbol || detail.symbol}` : uiMarkup`连接钱包并${sell ? uiCopy("卖出", "Sell") : uiCopy("买入", "Buy")}`;
      submit.classList.toggle("red", sell);
    }
    if (refreshQuote) updateQuote().catch((error) => toastError(error, "报价获取失败，请稍后重试"));
  };
  const applySide = (sell, options) => {
    applySideBase(sell, options);
    const rate = sell ? state.detail?.sell_tax_percent : state.detail?.buy_tax_percent;
    text("[data-token-tax]", state.detail?.tax_enabled && Number.isFinite(Number(rate)) ? `${Number(rate)}%` : "0%");
  };
  const abiAddressArray = (addresses) => `${word(BigInt(addresses.length))}${addresses.map((address) => addressWord(address)).join("")}`;
  const pancakeSwapData = ({ side, quoteAddress, token, account, amountIn, minOut }) => {
    const routeQuote = quoteAddress || wrappedNativeAddress();
    const path = side === "buy" ? [routeQuote, token] : [token, routeQuote];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
    const pathData = abiAddressArray(path);
    if (side === "buy" && !quoteAddress) return `0xb6f9de95${word(minOut)}${word(128n)}${addressWord(account)}${word(deadline)}${pathData}`;
    const selector = side === "sell" && !quoteAddress ? "0x791ac947" : "0x5c11d795";
    return `${selector}${word(amountIn)}${word(minOut)}${word(160n)}${addressWord(account)}${word(deadline)}${pathData}`;
  };
  const executeTradeSingleFlight = async () => {
    if (!state.account) await connectWallet();
    if (!state.selected || !state.detail) throw new Error("请先选择代币");
    const amount = $("#trade-amount")?.value?.trim();
    if (!amount) throw new Error("请输入交易数量");
    const expectedKey = `${state.side}:${tokenAddress(state.selected)}:${amount}:${state.account}:${state.chainId}`;
    if (!state.quote || state.quoteKey !== expectedKey) {
      await updateQuote();
      if (!state.quote) throw new Error("报价尚未准备好");
    }
    const quoteBindingState = await assertQuoteBinding();
    const curve = quoteBindingState.curveAddress;
    const quote = quoteBindingState.quoteTokenAddress === ZERO_ADDRESS ? null : quoteBindingState.quoteTokenAddress;
    const amountWei = parseUnits(amount);
    const output = amountFromApi(quoteBindingState.output);
    const minOut = quoteBindingState.minOut;
    const provider = selectedProvider();
    if (!provider) throw new Error("请先连接并验证钱包");
    const isDex = quoteBindingState.routeType !== "bonding_curve";
    const executionTarget = isDex ? quoteBindingState.executionTarget : curve;
    if (!/^0x[0-9a-f]{40}$/.test(executionTarget) || executionTarget === ZERO_ADDRESS) throw new Error("交易执行地址无效");
    const tradeContext = {
      account: quoteBindingState.account,
      side: quoteBindingState.side,
      tokenAddress: quoteBindingState.tokenAddress,
      tokenSymbol: String(state.detail.symbol || state.selected.symbol || "TOKEN"),
      quoteSymbol: quoteBindingState.quoteToken,
      curve,
      routeType: quoteBindingState.routeType,
      routerAddress: quoteBindingState.routerAddress,
      pairAddress: quoteBindingState.pairAddress,
      dexKind: quoteBindingState.dexKind,
      executionData: quoteBindingState.executionData,
      approvalSpender: quoteBindingState.approvalSpender,
      executionTarget,
      provider,
    };
    const selector = tradeContext.side === "buy" ? (quote ? "0x6818735c" : "0xd96a094a") : quote ? "0x5969261f" : "0xd79875eb";
    const txType = tradeContext.side === "buy" ? "pump_buy" : "pump_sell";
    const fromToken = tradeContext.side === "buy" ? tradeContext.quoteSymbol : tradeContext.tokenSymbol;
    const toToken = tradeContext.side === "buy" ? tradeContext.tokenSymbol : tradeContext.quoteSymbol;
    let hash;
    let mainStatusReported = false;
    state.busy = true;
    try {
      if ((tradeContext.side === "buy" && quote) || tradeContext.side === "sell") {
        await assertQuoteBinding();
        const asset = tradeContext.side === "buy" ? quote : tradeContext.tokenAddress;
        const currentAllowance = await allowance(asset, tradeContext.account, tradeContext.approvalSpender, tradeContext.provider);
        if (currentAllowance < amountWei) {
          let approval;
          try {
            approval = await send(
              {
                from: tradeContext.account,
                to: asset,
                data: `0x095ea7b3${addressWord(tradeContext.approvalSpender)}${word(amountWei)}`,
                gas: 100000n,
              },
              tradeContext.provider,
            );
            await report({
              user_address: tradeContext.account,
              tx_hash: approval,
              chain_id: state.selectedChain,
              tx_type: "approve",
              from_token: fromToken,
              status: "pending",
              metadata: {
                spender: tradeContext.approvalSpender,
                token_address: tradeContext.tokenAddress,
                route_type: tradeContext.routeType,
              },
            });
            toast("授权交易已发送");
            const receipt = await waitReceipt(approval, tradeContext.provider);
            const ok = receiptSucceeded(receipt);
            await report({
              user_address: tradeContext.account,
              tx_hash: approval,
              chain_id: state.selectedChain,
              tx_type: "approve",
              from_token: fromToken,
              status: ok ? "success" : "failed",
              metadata: {
                spender: tradeContext.approvalSpender,
                token_address: tradeContext.tokenAddress,
                route_type: tradeContext.routeType,
              },
            });
            if (!ok) throw new Error("授权失败");
          } catch (error) {
            if (approval)
              await report({
                user_address: tradeContext.account,
                tx_hash: approval,
                chain_id: state.selectedChain,
                tx_type: "approve",
                from_token: fromToken,
                status: "failed",
                metadata: {
                  spender: tradeContext.approvalSpender,
                  token_address: tradeContext.tokenAddress,
                  route_type: tradeContext.routeType,
                  error: error.message,
                },
              });
            throw error;
          }
          await assertQuoteBinding();
        }
      }
      const data = isDex
        ? tradeContext.dexKind === "v3"
          ? tradeContext.executionData
          : pancakeSwapData({
            side: tradeContext.side,
            quoteAddress: quote,
            token: tradeContext.tokenAddress,
            account: tradeContext.account,
            amountIn: amountWei,
            minOut,
          })
        : tradeContext.side === "buy"
          ? quote
            ? `${selector}${word(amountWei)}`
            : `${selector}${word(minOut)}`
          : `${selector}${word(amountWei)}${word(minOut)}`;
      hash = await send(
        {
          from: tradeContext.account,
          to: executionTarget,
          data,
          value: tradeContext.side === "buy" && !quote ? amountWei : 0n,
          gas: isDex ? 600000n : 350000n,
        },
        tradeContext.provider,
      );
      const tradeMetadata = {
        token_address: tradeContext.tokenAddress,
        curve_address: curve,
        route_type: tradeContext.routeType,
        router_address: tradeContext.routerAddress || undefined,
        pair_address: tradeContext.pairAddress || undefined,
      };
      await report({
        user_address: tradeContext.account,
        tx_hash: hash,
        chain_id: state.selectedChain,
        tx_type: txType,
        from_token: fromToken,
        to_token: toToken,
        from_amount: amount,
        to_amount: formatUnits(output),
        status: "pending",
        metadata: tradeMetadata,
      });
      toast("交易已广播，等待回执…");
      const receipt = await waitReceipt(hash, tradeContext.provider);
      const ok = receiptSucceeded(receipt);
      await report({
        user_address: tradeContext.account,
        tx_hash: hash,
        chain_id: state.selectedChain,
        tx_type: txType,
        from_token: fromToken,
        to_token: toToken,
        from_amount: amount,
        to_amount: formatUnits(output),
        status: ok ? "success" : "failed",
        metadata: tradeMetadata,
      });
      mainStatusReported = true;
      if (!ok) throw new Error("交易回执失败");
      toast("交易已确认");
      const refreshes = [loadUserPanels()];
      if (tokenAddress(state.selected).toLowerCase() === tradeContext.tokenAddress) refreshes.push(loadDetail(state.selected));
      await Promise.all(refreshes);
    } catch (error) {
      if (hash && !mainStatusReported && error?.code !== "TX_CONFIRMATION_PENDING")
        await report({
          user_address: tradeContext.account,
          tx_hash: hash,
          chain_id: state.selectedChain,
          tx_type: txType,
          from_token: fromToken,
          to_token: toToken,
          status: "failed",
          metadata: {
            token_address: tradeContext.tokenAddress,
            curve_address: curve,
            route_type: tradeContext.routeType,
            router_address: tradeContext.routerAddress || undefined,
            pair_address: tradeContext.pairAddress || undefined,
            error: error.message,
          },
        });
      if (hash) await loadUserPanels().catch(() => undefined);
      throw error;
    } finally {
      state.busy = false;
    }
  };
  const executeTrade = async () => {
    if (state.busy) throw new Error("交易正在处理中，请等待当前交易完成");
    const submit = $("#trade-submit");
    state.busy = true;
    if (submit) submit.disabled = true;
    try {
      return await executeTradeSingleFlight();
    } finally {
      state.busy = false;
      if (submit) submit.disabled = false;
    }
  };
  const launchWord = (value) => value.toString(16).padStart(64, "0");
  const launchAddressWord = (value) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("发币地址绑定无效");
    return value.slice(2).toLowerCase().padStart(64, "0");
  };
  const abiString = (value) => {
    const bytes = Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${launchWord(BigInt(bytes.length / 2))}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")}`;
  };
  const launchTaxConfig = () => {
    if (!state.taxEnabled) return null;
    const read = (id) => Number($(id)?.value);
    const buy = read("#buy-tax-rate"),
      sell = read("#sell-tax-rate"),
      funds = read("#funds-recipient-pct"),
      burn = read("#burn-pct"),
      holders = read("#holders-pct"),
      liquidity = read("#liquidity-pct"),
      minimum = String($("#min-dividend-balance")?.value || "0").trim(),
      recipient = String($("#tax-recipient-wallet")?.value || "").trim(),
      taxDays = read("#tax-duration-days"),
      antiMinutes = read("#anti-bot-duration-minutes"),
      extraTax = read("#anti-bot-extra-tax-rate"),
      maxWallet = read("#max-wallet-pct"),
      cooldown = read("#sell-cooldown-seconds");
    if (![buy, sell].every((v) => Number.isFinite(v) && v >= 1 && v <= 10)) throw new Error("买入和卖出税率必须在 1%–10% 之间");
    if (![funds, burn, holders, liquidity].every((v) => Number.isFinite(v) && v >= 0) || Math.abs(funds + burn + holders + liquidity - 100) > 0.001) throw new Error("税费分配比例合计必须为 100%");
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error("请输入有效的税费接收钱包");
    parseUnits(minimum);
    if (!Number.isInteger(taxDays) || taxDays < 0 || taxDays > 3650 || !Number.isInteger(antiMinutes) || antiMinutes < 0 || antiMinutes > 60 || !Number.isFinite(extraTax) || extraTax < 0 || extraTax > 20 || !Number.isFinite(maxWallet) || maxWallet < 0 || maxWallet > 100 || (maxWallet > 0 && maxWallet < 0.5) || !Number.isInteger(cooldown) || cooldown < 0 || cooldown > 3600) throw new Error("税费生命周期或反机器人参数超出允许范围");
    return {
      buy_tax_rate: String(buy),
      sell_tax_rate: String(sell),
      funds_recipient_pct: String(funds),
      burn_pct: String(burn),
      holders_pct: String(holders),
      liquidity_pct: String(liquidity),
      min_dividend_balance: minimum,
      recipient_wallet: recipient,
      tax_duration_days: String(taxDays),
      anti_bot_duration_minutes: String(antiMinutes),
      anti_bot_extra_tax_rate: String(extraTax),
      max_wallet_pct: String(maxWallet),
      sell_cooldown_seconds: String(cooldown),
      buyBps: BigInt(Math.round(buy * 100)),
      sellBps: BigInt(Math.round(sell * 100)),
      fundsBps: BigInt(Math.round(funds * 100)),
      burnBps: BigInt(Math.round(burn * 100)),
      holdersBps: BigInt(Math.round(holders * 100)),
      liquidityBps: BigInt(Math.round(liquidity * 100)),
      minimumWei: parseUnits(minimum),
      recipient,
      taxDurationSeconds: BigInt(taxDays * 86400),
      antiBotDurationSeconds: BigInt(antiMinutes * 60),
      antiBotExtraTaxBps: BigInt(Math.round(extraTax * 100)),
      maxWalletBps: BigInt(Math.round(maxWallet * 100)),
      sellCooldownSeconds: BigInt(cooldown),
    };
  };
  const launchInitialBuy = () => {
    const value = String($("#initial-buy-quote")?.value || "0").trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) throw new Error("请输入有效的创建者初始买入金额");
    return { value, wei: value === "0" ? 0n : parseUnits(value) };
  };
  const launchCurveTarget = () => {
    if (state.curveMode !== "custom") return null;
    const value = String($("#migration-threshold-quote")?.value || "").trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) || BigInt(parseUnits(value)) <= 0n) throw new Error("请输入有效的 DEX 迁移目标");
    return value;
  };
  const encodeLaunch = (prepared, tax) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(prepared.salt)) throw new Error("发币准备参数绑定无效");
    const name = abiString(prepared.launch.token_name),
      symbol = abiString(prepared.launch.symbol),
      initial = BigInt(prepared.initial_buy_wei || 0),
      minimum = BigInt(prepared.initial_buy_min_tokens_out || 0),
      base = `${launchWord(BigInt(prepared.migration_threshold_wei))}${prepared.salt.slice(2).toLowerCase()}${launchAddressWord(prepared.quote_token_address)}`;
    const profileLaunch = prepared.dex_profile && prepared.dex_profile !== "pancakeswap_v2";
    if (profileLaunch) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(prepared.dex_profile_id) || !/^0x[0-9a-fA-F]{40}$/.test(prepared.launch.creator_address)) throw new Error("DEX Profile 发币绑定无效");
      const profile = prepared.dex_profile_id.slice(2).toLowerCase(),
        creator = launchAddressWord(prepared.launch.creator_address);
      if (!tax) {
        if (prepared.method !== "launchTokenWithDexProfilePaid((string,string,address,uint256,bytes32,address,bytes32,uint256,uint256))") throw new Error("DEX Profile 发币准备方法无效");
        const nameOffset = 288n,
          symbolOffset = nameOffset + BigInt(name.length / 2);
        return `0xcc0caa90${launchWord(32n)}${launchWord(nameOffset)}${launchWord(symbolOffset)}${creator}${base}${profile}${launchWord(initial)}${launchWord(minimum)}${name}${symbol}`;
      }
      const lifecycle = prepared.tax_lifecycle;
      if (!lifecycle) throw new Error("税费生命周期绑定缺失");
      const taxWords = `${launchWord(tax.buyBps)}${launchWord(tax.sellBps)}${launchWord(tax.fundsBps)}${launchWord(tax.burnBps)}${launchWord(tax.holdersBps)}${launchWord(tax.liquidityBps)}${launchWord(tax.minimumWei)}${launchAddressWord(tax.recipient)}`;
      const lifecycleWords = `${launchWord(BigInt(lifecycle.tax_duration_seconds))}${launchWord(BigInt(lifecycle.anti_bot_duration_seconds))}${launchWord(BigInt(lifecycle.anti_bot_extra_tax_bps))}${launchWord(BigInt(lifecycle.max_wallet_bps))}${launchWord(BigInt(lifecycle.sell_cooldown_seconds))}`;
      if (prepared.method !== "launchTaxTokenV2WithDexProfilePaid((string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32),bytes32,address,uint256,uint256))") throw new Error("税费 DEX Profile 发币准备方法无效");
      const nameOffset = 704n,
        symbolOffset = nameOffset + BigInt(name.length / 2);
      return `0x639b75a9${launchWord(32n)}${launchWord(nameOffset)}${launchWord(symbolOffset)}${base}${taxWords}${lifecycleWords}${profile}${creator}${launchWord(initial)}${launchWord(minimum)}${name}${symbol}`;
    }
    if (!tax) {
      if (initial === 0n) {
        if (prepared.method !== "launchTokenWithQuotePaid(string,string,uint256,bytes32,address)") throw new Error("发币准备方法无效");
        const nameOffset = 160n,
          symbolOffset = nameOffset + BigInt(name.length / 2);
        return `0x187fdf81${launchWord(nameOffset)}${launchWord(symbolOffset)}${base}${name}${symbol}`;
      }
      if (prepared.method !== "launchTokenWithQuotePaidAndBuy(string,string,uint256,bytes32,address,uint256,uint256)") throw new Error("首购发币准备方法无效");
      const nameOffset = 224n,
        symbolOffset = nameOffset + BigInt(name.length / 2);
      return `0x6f37f005${launchWord(nameOffset)}${launchWord(symbolOffset)}${base}${launchWord(initial)}${launchWord(minimum)}${name}${symbol}`;
    }
    const lifecycle = prepared.tax_lifecycle;
    if (!lifecycle) throw new Error("税费生命周期绑定缺失");
    const taxWords = `${launchWord(tax.buyBps)}${launchWord(tax.sellBps)}${launchWord(tax.fundsBps)}${launchWord(tax.burnBps)}${launchWord(tax.holdersBps)}${launchWord(tax.liquidityBps)}${launchWord(tax.minimumWei)}${launchAddressWord(tax.recipient)}`;
    const lifecycleWords = `${launchWord(BigInt(lifecycle.tax_duration_seconds))}${launchWord(BigInt(lifecycle.anti_bot_duration_seconds))}${launchWord(BigInt(lifecycle.anti_bot_extra_tax_bps))}${launchWord(BigInt(lifecycle.max_wallet_bps))}${launchWord(BigInt(lifecycle.sell_cooldown_seconds))}`;
    if (initial === 0n) {
      if (prepared.method !== "launchTaxTokenV2WithQuotePaid(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32))") throw new Error("税费代币发币方法无效");
      const nameOffset = 576n,
        symbolOffset = nameOffset + BigInt(name.length / 2);
      return `0xb6d56503${launchWord(nameOffset)}${launchWord(symbolOffset)}${base}${taxWords}${lifecycleWords}${name}${symbol}`;
    }
    if (prepared.method !== "launchTaxTokenV2WithQuotePaidAndBuy(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32),uint256,uint256)") throw new Error("税费首购发币方法无效");
    const nameOffset = 640n,
      symbolOffset = nameOffset + BigInt(name.length / 2);
    return `0xe7754a3e${launchWord(nameOffset)}${launchWord(symbolOffset)}${base}${taxWords}${lifecycleWords}${launchWord(initial)}${launchWord(minimum)}${name}${symbol}`;
  };
  const launchPreflight = async ({ from, to, data, value }) => {
    const native = selectedNetwork().native;
    const balance = await walletNativeBalance();
    if (balance < value) {
      const missing = value - balance;
      throw new Error(`${native} 余额不足：当前 ${formatUnits(balance)} ${native}，发射费为 ${formatUnits(value)} ${native}（另需 Gas），至少还差 ${formatUnits(missing)} ${native}`);
    }
    const fee = await getFeePolicy();
    const estimateTx = {
      from,
      to,
      data,
      value: `0x${value.toString(16)}`,
      maxPriorityFeePerGas: `0x${fee.maxPriorityFeePerGas.toString(16)}`,
      maxFeePerGas: `0x${fee.maxFeePerGas.toString(16)}`,
    };
    let estimatedGas;
    try {
      estimatedGas = BigInt(
        await selectedProvider().request({
          method: "eth_estimateGas",
          params: [estimateTx],
        }),
      );
    } catch (error) {
      const message = String(error?.message || error?.data?.message || error?.data?.originalError?.message || "");
      if (/Address must end with 8888|CREATE2 failed/i.test(message)) throw new Error("发币参数与链上 Factory 不一致，请重新加载发币参数");
      if (/insufficient funds/i.test(message)) throw new Error(`${native} 余额不足：当前 ${formatUnits(balance)} ${native}，请补充发射费和 Gas 后重试`);
      throw error;
    }
    const gas = (estimatedGas * 120n + 99n) / 100n;
    const required = value + gas * fee.maxFeePerGas;
    if (balance < required) {
      throw new Error(`${native} 余额不足：当前 ${formatUnits(balance)} ${native}，发射费和预估 Gas 至少需要 ${formatUnits(required)} ${native}，还差 ${formatUnits(required - balance)} ${native}`);
    }
    return { fee, gas, balance, required };
  };
  const assertLaunchBinding = (fee, prepared, address, name, symbol, quote, tax, initial) => {
    const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
    const isNonZeroAddress = (value) => isAddress(value) && String(value).toLowerCase() !== ZERO_ADDRESS;
    const isUint = (value) => /^\d+$/.test(String(value || ""));
    const normalizedFeeChain = normalizeChainId(fee?.chain_id);
    const normalizedPreparedChain = normalizeChainId(prepared?.chain_id);
    const expectedQuote = quoteAddress(quote) || ZERO_ADDRESS;
    if (!prepared?.launch?.id || !isNonZeroAddress(address) || !isNonZeroAddress(fee?.factory_address) || !isNonZeroAddress(prepared?.factory_address) || prepared.factory_address.toLowerCase() !== fee.factory_address.toLowerCase()) throw new Error("发币准备工厂绑定无效");
    if (!isNonZeroAddress(fee.receive_address) || !isNonZeroAddress(prepared.fee_recipient) || prepared.fee_recipient.toLowerCase() !== fee.receive_address.toLowerCase()) throw new Error("发币手续费接收地址绑定无效");
    if (normalizedFeeChain !== selectedNetwork().chainIdHex || normalizedPreparedChain !== selectedNetwork().chainIdHex) throw new Error("发币准备网络无效");
    if (!isUint(fee.fee_wei) || !isUint(prepared.fee_wei) || fee.fee_wei !== prepared.fee_wei || BigInt(prepared.fee_wei) <= 0n || !isUint(prepared.migration_threshold_wei) || BigInt(prepared.migration_threshold_wei) <= 0n || !isUint(prepared.initial_buy_wei) || !isUint(prepared.initial_buy_min_tokens_out) || !isUint(prepared.transaction_value_wei) || BigInt(prepared.initial_buy_wei) !== initial.wei) throw new Error("发币准备金额无效");
    const allowedMethods = ["launchTokenWithQuotePaid(string,string,uint256,bytes32,address)", "launchTokenWithQuotePaidAndBuy(string,string,uint256,bytes32,address,uint256,uint256)", "launchTaxTokenV2WithQuotePaid(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32))", "launchTaxTokenV2WithQuotePaidAndBuy(string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32),uint256,uint256)", "launchTokenWithDexProfilePaid((string,string,address,uint256,bytes32,address,bytes32,uint256,uint256))", "launchTaxTokenV2WithDexProfilePaid((string,string,uint256,bytes32,address,(uint16,uint16,uint16,uint16,uint16,uint16,uint256,address),(uint32,uint32,uint16,uint16,uint32),bytes32,address,uint256,uint256))"];
    if (!allowedMethods.includes(prepared.method) || !/^0x[0-9a-fA-F]{64}$/.test(String(prepared.salt || ""))) throw new Error("发币准备方法或随机盐无效");
    const expectedValue = BigInt(fee.fee_wei) + (quote === selectedNetwork().native ? initial.wei : 0n);
    if (BigInt(prepared.transaction_value_wei) !== expectedValue) throw new Error("发币交易金额绑定无效");
    if (!isAddress(prepared.predicted_token_address) || prepared.predicted_token_address.toLowerCase() === ZERO_ADDRESS || !isAddress(prepared.curve_address) || prepared.curve_address.toLowerCase() === ZERO_ADDRESS || !isAddress(prepared.quote_token_address) || prepared.quote_token_address.toLowerCase() !== expectedQuote.toLowerCase() || prepared.curve_address.toLowerCase() === prepared.predicted_token_address.toLowerCase()) throw new Error("发币准备资产地址绑定无效");
    if (prepared.launch.creator_address?.toLowerCase() !== address.toLowerCase() || prepared.launch.token_name !== name || prepared.launch.symbol !== symbol || prepared.launch.quote_token?.toUpperCase() !== quote) throw new Error("发币准备参数与钱包或表单不匹配");
    const expectedTaxMethod = Boolean(tax),
      profileLaunch = state.launchDexProfile !== "pancakeswap_v2";
    if (prepared.method.startsWith("launchTaxTokenV2") !== expectedTaxMethod || Boolean(prepared.method.includes("DexProfile")) !== profileLaunch || (!profileLaunch && prepared.method.includes("AndBuy") !== initial.wei > 0n)) throw new Error("发币准备方法与税费、首购或 DEX 模式不匹配");
    const rawSettings = prepared.launch.launch_settings;
    const settings = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
    if (String(settings?.curve_mode || "standard") !== state.curveMode) throw new Error("发币准备曲线模式不匹配");
    if (String(settings?.dex_profile || "pancakeswap_v2") !== state.launchDexProfile || prepared.dex_profile !== state.launchDexProfile || !/^0x[0-9a-fA-F]{64}$/.test(String(prepared.dex_profile_id || "")) || !/^0x[0-9a-fA-F]{40}$/.test(String(prepared.dex_router || ""))) throw new Error("发币准备 DEX Profile 不匹配");
    if (Boolean(settings?.enable_tax) !== expectedTaxMethod) throw new Error("发币准备税费配置不匹配");
    if (tax) {
      for (const key of ["buy_tax_rate", "sell_tax_rate", "funds_recipient_pct", "burn_pct", "holders_pct", "liquidity_pct", "min_dividend_balance"]) {
        if (String(settings?.[key]) !== String(tax[key])) throw new Error("发币准备税费配置已变化，请重新加载");
      }
      if (String(settings?.recipient_wallet || "").toLowerCase() !== tax.recipient.toLowerCase()) throw new Error("发币准备税费钱包不匹配");
      const lifecycle = prepared.tax_lifecycle;
      if (!lifecycle || BigInt(lifecycle.tax_duration_seconds) !== tax.taxDurationSeconds || BigInt(lifecycle.anti_bot_duration_seconds) !== tax.antiBotDurationSeconds || BigInt(lifecycle.anti_bot_extra_tax_bps) !== tax.antiBotExtraTaxBps || BigInt(lifecycle.max_wallet_bps) !== tax.maxWalletBps || BigInt(lifecycle.sell_cooldown_seconds) !== tax.sellCooldownSeconds) throw new Error("税费生命周期绑定已变化，请重新加载");
    }
    return prepared;
  };
  const launchFormKey = () =>
    `${window.bitbtLaunchLogoSelectionKey?.() || document.documentElement.dataset.launchLogoSelection || ""}|` +
    $$('[data-panel="create-basic"] input, [data-panel="create-basic"] textarea, [data-panel="create-basic"] select, [data-panel="create-economics"] input, [data-panel="create-economics"] textarea, [data-panel="create-economics"] select, [data-panel="create-tax"] input, [data-panel="create-tax"] textarea, [data-panel="create-tax"] select, [data-panel="create-economics"] .active, [data-panel="create-tax"] .active')
      .map((node) => `${node.id || node.name || node.className}:${node.value || node.textContent || ""}`)
      .join("|");
  const waitForLaunchFinality = async (launchId, initial, chain, current = () => true) => {
    let result = initial;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!current()) return result;
      if (["deployed", "migrated"].includes(result?.status)) return result;
      if (result?.status === "rejected") throw new Error(result.rejection_reason || "发币已被拒绝");
      if (!["prepared", "pending_review", "approved", "deploying", "deploy_failed"].includes(result?.status)) throw new Error(result?.rejection_reason || `发币状态为 ${result?.status || "未知"}`);
      result = await api(`v1/token/status?id=${encodeURIComponent(launchId)}&chain_id=${encodeURIComponent(chain)}`);
      if (["deployed", "migrated"].includes(result?.status)) return result;
      if (attempt < 9) await new Promise((resolve) => window.setTimeout(resolve, 3000));
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
    if (publishButton) {
      publishButton.disabled = false;
      publishButton.removeAttribute("disabled");
      publishButton.textContent = "重试保存发币结果";
      publishButton.title = message;
    }
  };
  const rememberLaunchConfirmation = (pending, message) => {
    pending.chain = pending.prepared.chain_id;
    pending.account = String(pending.prepared.launch.creator_address || "").toLowerCase();
    state.launchConfirmation = pending;
    persistLaunchConfirmation();
    if (pending.chain === state.selectedChain && pending.account === state.account?.toLowerCase()) renderLaunchConfirmationRetry(message);
  };
  const restoreLaunchConfirmation = () => {
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_LAUNCH_CONFIRMATION_KEY) || "null");
      if (!pending || !/^0x[0-9a-fA-F]{64}$/.test(String(pending.hash || "")) || !pending.prepared?.launch?.id || !/^0x[0-9a-fA-F]{40}$/.test(String(pending.prepared?.predicted_token_address || ""))) throw new Error("invalid pending launch");
      // Older records carry the binding in the immutable prepared launch.
      pending.chain = pending.prepared.chain_id;
      pending.account = String(pending.prepared.launch.creator_address || "").toLowerCase();
      state.launchConfirmation = pending;
      persistLaunchConfirmation();
      renderLaunchConfirmationRetry("检测到链上成功但尚未保存的发币结果");
      toast("检测到待确认的发币结果，请点击重试保存", 7000);
    } catch {
      sessionStorage.removeItem(PENDING_LAUNCH_CONFIRMATION_KEY);
    }
  };
  const clearLaunchConfirmation = () => {
    state.launchConfirmation = null;
    persistLaunchConfirmation();
  };
  const confirmSuccessfulLaunch = async () => {
    const pending = state.launchConfirmation;
    if (!pending) throw new Error("没有待确认的发币结果");
    const { prepared, hash, name, symbol, quote } = pending;
    const chain = prepared.chain_id;
    const account = String(prepared.launch.creator_address || "").toLowerCase();
    if (!NETWORKS[chain] || !/^0x[0-9a-f]{40}$/.test(account)) throw new Error("发币确认记录缺少原链或创建者信息，请核对原交易");
    if (state.selectedChain !== chain || state.account?.toLowerCase() !== account) throw new Error(`请切回 ${NETWORKS[chain].name} 并连接原创建者钱包后重试保存发币结果`);
    const epoch = walletSessionEpoch, navigation = navigationEpoch, provider = selectedProvider();
    const current = () => state.launchConfirmation === pending && walletSessionEpoch === epoch
      && navigationEpoch === navigation && selectedProvider() === provider
      && state.selectedChain === chain && state.account?.toLowerCase() === account;
    if (pending.logoRequired && !pending.confirmedLogoUrl) {
      const selectionKey = window.bitbtLaunchLogoSelectionKey?.() || document.documentElement.dataset.launchLogoSelection || "";
      if (!selectionKey) {
        renderLaunchConfirmationRetry("链上发币已成功，请重新选择 Logo 后重试");
        throw new Error("代币已创建，请重新选择 Logo 后点击重试保存");
      }
      try {
        pending.confirmedLogoUrl = (await window.bitbtUploadSelectedLaunchLogo?.()) || "";
        if (!pending.confirmedLogoUrl) throw new Error("Logo 上传未返回有效地址");
        if (state.launchConfirmation === pending) persistLaunchConfirmation();
      } catch (error) {
        if (!current()) return;
        renderLaunchConfirmationRetry("链上发币已成功，Logo 上传失败可重试");
        throw error;
      }
    }
    if (!current()) return;
    let result;
    try {
      result = await api(`v1/token/launch?chain_id=${encodeURIComponent(chain)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launch_id: prepared.launch.id,
          deploy_tx_hash: hash,
          logo_url: pending.confirmedLogoUrl || undefined,
        }),
      });
      if (!current()) return result;
      if (!["deployed", "migrated"].includes(result.status)) result = await waitForLaunchFinality(prepared.launch.id, result, chain, current);
    } catch (error) {
      if (!current()) return;
      renderLaunchConfirmationRetry(`链上交易 ${hash.slice(0, 10)}… 已成功，后台确认可重试`);
      throw error;
    }
    if (!current()) return result;
    const launchedAddress = result.contract_address || prepared.predicted_token_address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(launchedAddress)) {
      renderLaunchConfirmationRetry("链上发币已成功，返回地址异常可重试");
      throw new Error("发币回执缺少有效代币地址");
    }
    const launchedToken = {
      ...prepared.launch,
      ...result,
      contract_address: launchedAddress,
      token_name: name,
      symbol,
      quote_token: quote,
      status: result.status,
      curve_address: prepared.curve_address,
      quote_token_address: prepared.quote_token_address,
      progress_percent: 0,
      logo_url: result.logo_url || pending.confirmedLogoUrl || null,
    };
    const normalizedLaunchAddress = launchedAddress.toLowerCase();
    state.tokens = [launchedToken, ...state.tokens.filter((token) => tokenAddress(token).toLowerCase() !== normalizedLaunchAddress)];
    state.details[normalizedLaunchAddress] = launchedToken;
    renderTokens();
    await openToken(launchedToken, {
      historyMode: null,
      fallbackDetail: launchedToken,
      isCurrent: current,
    });
    if (!current()) return result;
    state.lastLaunchResult = { token: launchedToken, hash, chain, initial: prepared.initial_buy_wei || '0', account };
    renderLaunchResult();
    clearLaunchConfirmation();
    state.launchTerminal = true;
    setTokenPath(launchedAddress, "push");
    toast(pending.logoRequired ? "发币完成，Logo 已保存" : "发币完成");
    return result;
  };
  const launchTokenSingleFlight = async () => {
    if (state.launchConfirmation) return confirmSuccessfulLaunch();
    if (state.launchTerminal) throw new Error("本次发币流程已结束，请刷新页面开始新的流程");
    const name = $("#token-name")?.value?.trim();
    const symbol = $("#token-symbol")?.value?.trim().toUpperCase();
    if (!name || !symbol) throw new Error("请填写代币名称和符号");
    const address = state.account || (await connectWallet());
    await assertProviderState();
    const quote = state.launchQuote;
    if (!launchEnabledForSelectedChain()) throw new Error(`${selectedNetwork().name} 尚未配置已审核的 Factory，当前不可发币`);
    if (!launchQuoteTokens().has(quote) || (!quoteAddress(quote) && quote !== selectedNetwork().native)) throw new Error("不支持的发币计价资产");
    const description = $("#token-story")?.value?.trim() || "";
    const logoSelectionKey = window.bitbtLaunchLogoSelectionKey?.() || document.documentElement.dataset.launchLogoSelection || "";
    const metadata = {
      classification: $("#token-classification")?.value?.trim() || "Meme",
      twitter: $("#token-twitter")?.value?.trim() || "",
      telegram: $("#token-telegram")?.value?.trim() || "",
      website: $("#token-website")?.value?.trim() || "",
      discord: $("#token-discord")?.value?.trim() || "",
    };
    const tax = launchTaxConfig();
    const initial = launchInitialBuy();
    const formKey = launchFormKey();
    const snapshotKey = `${address}|${name}|${symbol}|${quote}|${state.launchDexProfile}|${description}|${logoSelectionKey}|${formKey}`;
    let snapshot = state.launchSnapshot;
    if (!snapshot || snapshot.key !== snapshotKey) {
      const availability = await api(`v1/pump/name-check?name=${encodeURIComponent(name)}&symbol=${encodeURIComponent(symbol)}`);
      if (!availability?.available) throw new Error("代币名称或符号已被占用或受保护，请更换后重试");
      const fee = await api("v1/token/launch-fee");
      if (!/^0x[0-9a-fA-F]{40}$/.test(fee.factory_address) || !/^\d+$/.test(fee.fee_wei)) throw new Error("发币费用配置无效");
      const curveTarget = launchCurveTarget();
      const launchSettings = tax
        ? {
            antisniper: true,
            enable_tax: true,
            request_platform_lp: false,
            curve_mode: state.curveMode,
            dex_profile: state.launchDexProfile,
            buy_tax_rate: tax.buy_tax_rate,
            sell_tax_rate: tax.sell_tax_rate,
            funds_recipient_pct: tax.funds_recipient_pct,
            burn_pct: tax.burn_pct,
            holders_pct: tax.holders_pct,
            liquidity_pct: tax.liquidity_pct,
            min_dividend_balance: tax.min_dividend_balance,
            recipient_wallet: tax.recipient,
            tax_duration_days: tax.tax_duration_days,
            anti_bot_duration_minutes: tax.anti_bot_duration_minutes,
            anti_bot_extra_tax_rate: tax.anti_bot_extra_tax_rate,
            max_wallet_pct: tax.max_wallet_pct,
            sell_cooldown_seconds: tax.sell_cooldown_seconds,
          }
        : {
            antisniper: true,
            enable_tax: false,
            request_platform_lp: false,
            curve_mode: state.curveMode,
            dex_profile: state.launchDexProfile,
          };
      const prepared = await api("v1/token/prepare-launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creator_address: address,
          token_name: name,
          symbol,
          total_supply: "1000000000",
          decimals: 18,
          mintable: false,
          burnable: false,
          chain_id: state.selectedChain,
          quote_token: quote,
          migration_threshold_quote: curveTarget || undefined,
          initial_buy_quote: initial.wei > 0n ? initial.value : undefined,
          description: description || undefined,
          classification: metadata.classification,
          twitter: metadata.twitter || undefined,
          telegram: metadata.telegram || undefined,
          website: metadata.website || undefined,
          discord: metadata.discord || undefined,
          launch_settings: launchSettings,
        }),
      });
      assertLaunchBinding(fee, prepared, address, name, symbol, quote, tax, initial);
      snapshot = {
        key: snapshotKey,
        fee,
        prepared,
        address,
        name,
        symbol,
        quote,
        description,
        metadata,
        formKey,
        logoSelectionKey,
        tax,
        initial,
      };
      state.launchSnapshot = snapshot;
      renderLaunchReview(fee, prepared, description);
      renderLaunchTaxReview(tax);
      toast("发币参数已自动准备，请核对快照后发布");
      return snapshot;
    }
    const { fee, prepared } = snapshot;
    assertLaunchBinding(fee, prepared, address, name, symbol, quote, tax, initial);
    if (snapshot.name !== name || snapshot.symbol !== symbol || snapshot.quote !== quote || snapshot.address !== address || snapshot.description !== description || snapshot.formKey !== formKey || snapshot.logoSelectionKey !== logoSelectionKey || snapshot.initial?.wei !== initial.wei) {
      invalidateLaunchSnapshot();
      throw new Error("发币确认快照已过期，请重新加载");
    }
    const provider = selectedProvider();
    await ensureSelectedChain(provider);
    await assertProviderState();
    const accounts = await provider.request({ method: "eth_accounts" });
    if (String(accounts?.[0] || "").toLowerCase() !== address.toLowerCase()) throw new Error("钱包账户已变化，请重新连接");
    const launchData = encodeLaunch(prepared, tax);
    const launchValue = BigInt(prepared.transaction_value_wei);
    const initialWei = BigInt(prepared.initial_buy_wei || 0);
    if (initialWei > 0n && quote !== selectedNetwork().native) {
      const asset = prepared.quote_token_address;
      const balance = await walletTokenBalance(asset, address, provider);
      if (balance < initialWei) throw new Error(`${quote} 余额不足：初始买入需要 ${formatUnits(initialWei)} ${quote}`);
      const currentAllowance = await allowance(asset, address, prepared.curve_address, provider);
      if (currentAllowance < initialWei) {
        toast(`请先授权 ${quote} 给预测联合曲线…`);
        const approval = await send(
          {
            from: address,
            to: asset,
            data: `0x095ea7b3${addressWord(prepared.curve_address)}${word(initialWei)}`,
            gas: 100000n,
          },
          provider,
        );
        const approvalReceipt = await waitReceipt(approval, provider);
        if (!receiptSucceeded(approvalReceipt)) throw new Error(`${quote} 初始买入授权失败`);
      }
    }
    let preflight;
    try {
      preflight = await launchPreflight({
        from: address,
        to: prepared.factory_address,
        data: launchData,
        value: launchValue,
      });
    } catch (error) {
      if (/发币参数与链上 Factory 不一致/.test(String(error?.message || ""))) {
        invalidateLaunchSnapshot(true);
        await launchTokenSingleFlight();
        toast("链上 Factory 状态已变化，参数已自动更新，请重新核对后发布");
        return;
      }
      throw error;
    }
    let hash;
    try {
      hash = await send({
        from: address,
        to: prepared.factory_address,
        data: launchData,
        value: launchValue,
        gas: preflight.gas,
        fee: preflight.fee,
      });
    } catch (error) {
      const code = Number(error?.code ?? error?.data?.originalError?.code);
      if (code === 4001) {
        state.launchTerminal = false;
        renderLaunchReview(fee, prepared, description);
        toast("钱包取消了交易，可以重新确认");
      } else setLaunchTerminal("交易状态未知，请先核对链上状态后再继续");
      throw error;
    }
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]+$/.test(hash)) {
      setLaunchTerminal("交易状态未知，请先核对链上状态后再继续");
      throw new Error("钱包未返回可验证的发币交易哈希");
    }
    setLaunchTerminal(`已广播 ${hash.slice(0, 10)}…，等待回执`);
    toast("发币交易已广播，等待回执…");
    let receipt;
    try {
      receipt = await waitReceipt(hash);
    } catch (error) {
      setLaunchTerminal(`交易 ${hash.slice(0, 10)}… 未完成，请核对链上状态`);
      throw error;
    }
    if (!receiptSucceeded(receipt)) {
      setLaunchTerminal(`交易 ${hash.slice(0, 10)}… 回执失败`);
      throw new Error("发币交易回执失败");
    }

    rememberLaunchConfirmation(
      {
        prepared,
        hash,
        name,
        symbol,
        quote,
        logoRequired: Boolean(logoSelectionKey),
        confirmedLogoUrl: "",
      },
      "链上发币成功，正在保存 Logo 与项目信息",
    );
    return confirmSuccessfulLaunch();
  };
  const launchToken = async () => {
    if (state.launchBusy) throw new Error("发币正在处理中，请等待当前操作完成");
    state.launchBusy = true;
    try {
      return await launchTokenSingleFlight();
    } finally {
      state.launchBusy = false;
    }
  };
  const bindLiveTokenSelection = () =>
    $$("[data-live-token]").forEach((node) => {
      if (node.dataset.liveBound) return;
      node.dataset.liveBound = "1";
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const token = state.tokens.find((item) => tokenAddress(item).toLowerCase() === String(node.dataset.liveToken || "").toLowerCase());
          if (token) openToken(token).catch((error) => toastError(error, "代币详情加载失败，请稍后重试"));
        },
        true,
      );
    });
  const setCurveMode = (mode) => {
    state.curveMode = mode === "custom" ? "custom" : "standard";
    $$("[data-curve-mode]").forEach((choice) => choice.classList.toggle("active", choice.dataset.curveMode === state.curveMode));
    $$("[data-custom-curve-fields]").forEach((group) => {
      group.hidden = state.curveMode !== "custom";
    });
    const unit = $("[data-migration-threshold-unit]");
    if (unit) unit.textContent = state.launchQuote;
    const input = $("#migration-threshold-quote");
    if (input && state.curveMode === "custom" && !input.value) input.value = state.launchQuote === selectedNetwork().native ? "115" : "69000";
    invalidateLaunchSnapshot();
  };
  const applyTaxDefaults = () => {
    if (!state.taxEnabled) return;
    const defaults = {
      "#buy-tax-rate": "5",
      "#sell-tax-rate": "5",
      "#funds-recipient-pct": "40",
      "#burn-pct": "20",
      "#holders-pct": "20",
      "#liquidity-pct": "20",
      "#min-dividend-balance": "100000",
      "#tax-recipient-wallet": state.account || "",
      "#tax-duration-days": "0",
      "#anti-bot-duration-minutes": "5",
      "#anti-bot-extra-tax-rate": "2",
      "#max-wallet-pct": "2",
      "#sell-cooldown-seconds": "30",
    };
    Object.entries(defaults).forEach(([selector, value]) => {
      const input = $(selector);
      if (input && !input.value && value) input.value = value;
    });
  };
  const setTaxMode = (enabled) => {
    state.taxEnabled = Boolean(enabled);
    $$("[data-tax-mode]").forEach((choice) => choice.classList.toggle("active", (choice.dataset.taxMode === "tax") === state.taxEnabled));
    $$("[data-tax-fields]").forEach((group) => {
      group.hidden = !state.taxEnabled;
    });
    applyTaxDefaults();
    renderTaxChoices();
    invalidateLaunchSnapshot();
  };
  const renderTaxChoices = () => {
    const buy = Number($('#buy-tax-rate')?.value), sell = Number($('#sell-tax-rate')?.value);
    $$('[data-tax-preset]').forEach(button => {
      const rate = Number(button.dataset.taxPreset);
      button.classList.toggle('active', state.taxEnabled ? rate > 0 && rate === buy && rate === sell : rate === 0);
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    });
    const parts = ['funds-recipient-pct', 'burn-pct', 'holders-pct', 'liquidity-pct'].map(id => Number($('#' + id)?.value));
    const plan = !state.taxEnabled ? 'standard' : parts.every((value, index) => value === (index === 0 ? 100 : 0)) ? 'creator' : parts.every((value, index) => value === (index === 2 ? 100 : 0)) ? 'holders' : '';
    $$('[data-tax-plan]').forEach(button => {
      button.classList.toggle('active', button.dataset.taxPlan === plan);
      button.setAttribute('aria-pressed', String(button.dataset.taxPlan === plan));
    });
  };
  const applyLaunchMode = (mode) => {
    state.launchMode = ["custom", "community"].includes(mode) ? mode : "fair";
    setCurveMode(state.launchMode === "custom" ? "custom" : "standard");
    setTaxMode(state.launchMode === "community");
  };
  const autoPrepareLaunch = async () => {
    if (state.launchSnapshot || state.launchConfirmation || state.launchTerminal || state.launchBusy) return;
    const publishButton = $("[data-launch-publish]");
    if (publishButton) {
      publishButton.disabled = true;
      publishButton.setAttribute("disabled", "");
      publishButton.textContent = "正在自动准备发币参数…";
    }
    try {
      await launchToken();
    } catch (error) {
      if (publishButton) {
        publishButton.disabled = true;
        publishButton.setAttribute("disabled", "");
        publishButton.textContent = uiCopy("参数准备失败，请返回修改后重试", "Parameter preparation failed. Go back, adjust and retry.");
      }
      toastError(error, "发币参数自动准备失败，请返回修改后重试");
    }
  };
  const renderLaunchResult = () => {
    const receipt = state.lastLaunchResult;
    const token = receipt?.token;
    text('[data-launch-result-heading]', token ? uiMarkup`${token.token_name} 已上线。` : uiCopy("暂无本次发布回执。", "No launch receipt for this session."));
    text('[data-launch-result-copy]', token ? uiCopy("链上交易与后台确认已完成，可打开代币页面继续交易。", "Confirmed on-chain and by the backend. Open the token page to trade.") : uiCopy("只有链上交易与后台确认完成后，才显示真实发布结果。", "Launch results appear only after on-chain and backend confirmation."));
    text('[data-launch-result-name]', token ? `${token.token_name} · ${token.symbol}` : '—');
    text('[data-launch-result-address]', token ? tokenAddress(token) : '—');
    text('[data-launch-result-status]', token ? uiCopy("已确认", "Confirmed") : uiCopy("待确认", "Pending confirmation"));
    text('[data-launch-result-network]', receipt ? NETWORKS[receipt.chain]?.name || receipt.chain : '—');
    text('[data-launch-result-hash]', receipt?.hash || '—');
    text('[data-launch-result-initial]', receipt ? `${formatUnits(BigInt(receipt.initial))} ${token.quote_token}` : '—');
    text('[data-launch-result-curve]', token ? `${number(token.progress_percent)}%` : '—');
    text('[data-launch-result-cap]', token && hasNumber(token.market_cap_usd) ? usd(token.market_cap_usd) : '—');
    const image = $('[data-launch-result-image]');
    if (image) image.src = token?.logo_url || './assets/tokens/generic.svg';
    const progress = $('[data-launch-result-progress]');
    if (progress) progress.style.width = `${Math.min(100, Math.max(0, number(token?.progress_percent)))}%`;
    $$('[data-launch-result-share], [data-launch-result-open]').forEach(button => { button.disabled = !token; });
  };
  let actionBackScreen = 'profile';
  // Keep the mobile tab bar available on every destination represented by a
  // production bottom-nav item. v13 uses `live` where the legacy shell uses
  // `perps`, so both are primary destinations for the shared adapter.
  const mainScreens = ['discover', 'live', 'perps', 'rank', 'create-mode', 'profile'];
  const setGlobalMenuOpen = (open) => {
    root.classList.toggle('navigation-open', open);
    $('[data-global-menu-toggle]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    const contacts = $('.official-contact-footer');
    if (open) contacts?.removeAttribute('hidden');
    else contacts?.toggleAttribute('hidden', $('[data-panel="detail"]')?.classList.contains('active'));
  };
  const applyScreenChrome = (name) => {
    $$('[data-panel]').forEach(panel => panel.classList.toggle('has-bottom-nav', panel.dataset.panel === name && mainScreens.includes(name)));
    $('.bottom-nav')?.classList.toggle('visible', mainScreens.includes(name));
    $('.official-contact-footer')?.toggleAttribute('hidden', name === 'detail');
  };
  const show = (name) => {
    name = resolveScreenName(name);
    if (name === 'action-center') actionBackScreen = $('[data-panel].active')?.dataset.panel || 'profile';
    if (name === 'success') renderLaunchResult();
    const routeName = name;
    const target = root.querySelector(`[data-panel="${CSS.escape(name)}"]`);
    if (!target) return;
    navigationEpoch += 1;
    invalidateQuote();
    if (name === "create-mode" || (name === "create-basic" && state.launchTerminal)) resetLaunchFlow();
    else if (!state.launchSnapshot || name !== "create-review") invalidateLaunchSnapshot();
    $$(`[data-panel]`).forEach((panel) => panel.classList.toggle("active", panel === target));
    $$(".screen-switcher [data-open]").forEach((button) =>
      button.setAttribute("aria-pressed", button.dataset.open === name ? "true" : "false"),
    );
    const activeMenuButton = $('.screen-switcher [data-open][aria-pressed="true"]');
    text('[data-global-menu-label]', activeMenuButton?.textContent?.trim() || uiCopy('页面', 'Menu'));
    $$('[data-nav]').forEach((button) => button.classList.toggle("active", button.dataset.nav === name));
    applyScreenChrome(name);
    target.scrollTop = 0;
    renderWalletState();
    routeHistory()?.replaceState?.(null, "", `${pumpBasePath()}?screen=${encodeURIComponent(routeName)}`);
    if (name === "create-review") void autoPrepareLaunch();
    if (name === "announcements") {
      renderAnnouncements();
      if (!state.announcements.length) void loadAnnouncements().catch((error) => toastError(error, "公告加载失败，请稍后重试"));
    }
    if (name === "perps-onchain") void loadPerpetualActivity().catch((error) => toastError(error, "链上记录加载失败"));
    if (["perpetual", "perps", "perps-add-contract", "perps-create-pool", "perps-pool"].includes(name)) void loadPerpetual().catch((error) => toastError(error, "永续市场加载失败"));
    if ((name === "alerts" || name === "alert-center") && state.account) void loadUserPanels().catch((error) => toastError(error, "提醒加载失败"));
    if (name === "revenue-center" || name === "income-center") {
      renderVaults();
      if (state.account) void loadVaults().catch((error) => toastError(error, "Vault 数据读取失败"));
    }
    if (name === "vault-store") {
      renderStrategyStore();
      if (state.account) void loadStrategies().catch((error) => toastError(error, "策略 Vault 读取失败"));
    }
  };
  const bindNavigation = () => {
    $$('[data-perps-size]').forEach(button => button.addEventListener('click', () => {
      const market = selectedPerpMarket();
      const percent = Number(button.dataset.perpsSize);
      if (!market || !state.account || state.perpQuoteBalance == null || ![25, 50, 75, 100].includes(percent) || state.perpSubmitting) return;
      const input = $('#perps-size');
      if (input) input.value = formatUnits(BigInt(state.perpQuoteBalance) * BigInt(percent) / 100n, Number(market.quoteDecimals || 18), 18);
      state.preparedPerpAction = null;
      state.preparedPerpRequest = null;
      renderPerpetual();
    }));
    $('[data-action-back]')?.addEventListener('click', () => show(actionBackScreen === 'action-center' ? 'profile' : actionBackScreen));
    $('[data-launch-result-open]')?.addEventListener('click', () => {
      if (state.lastLaunchResult?.token) void openToken(state.lastLaunchResult.token).catch(error => toastError(error, '代币页面打开失败'));
    });
    $('[data-launch-result-share]')?.addEventListener('click', () => {
      if (state.lastLaunchResult?.token) void copyText(`${location.origin}${pumpBasePath()}/${tokenAddress(state.lastLaunchResult.token)}`).then(() => toast('代币链接已复制')).catch(error => toastError(error, '复制失败'));
    });
    // data-open is delegated from root because the latest UI redraws child pages.
    $$("[data-nav]").forEach((node) => node.addEventListener("click", () => show(node.dataset.nav)));
    $$("[data-detail-tab]").forEach((node) =>
      node.addEventListener("click", () => {
        $$("[data-detail-tab]").forEach((tab) => tab.classList.toggle("active", tab === node));
        $$("[data-detail-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.detailPanel === node.dataset.detailTab));
        if (node.dataset.detailTab === "holders") void loadHolders();
        if (node.dataset.detailTab === "comments") void loadComments().catch((error) => toastError(error, "评论加载失败"));
      }),
    );
    $$("[data-amount]").forEach((node) =>
      node.addEventListener("click", () => {
        const input = $("#trade-amount");
        if (input) input.value = node.dataset.amount === "MAX" ? "" : node.dataset.amount;
        invalidateQuote();
      }),
    );
    $$("[data-lang-toggle], [data-set-language]").forEach((node) =>
      node.addEventListener("click", () => {
        const target = node.dataset.setLanguage || (pumpLocale() === "zh" ? "en" : "zh");
        try {
          window.localStorage?.setItem(LOCALE_KEY, target);
        } catch {}
        document.documentElement.lang = target === "zh" ? "zh-CN" : "en";
        text("[data-lang-current]", target === "zh" ? "简体中文" : "English");
        text("[data-lang-label]", target === "zh" ? "中文 / EN" : "EN / 中文");
        $$('[data-set-language]').forEach(button => button.classList.toggle('active', button.dataset.setLanguage === target));
        window.bitbtUiLocale?.apply(target);
        if (operationDialogCopy && !$('[data-operation-error]')?.hidden) showOperationDialog(operationDialogCopy.message, operationDialogCopy);
        renderChainMenu();
        if (state.marketActivityReady) renderMarketSummary();
        redrawDisplay();
        toast(target === "zh" ? "语言偏好已保存" : "Language preference saved");
      }),
    );
    const motionButton = $('[data-reduce-motion]');
    const applyMotion = (reduced) => {
      document.documentElement.classList.toggle('reduce-motion', reduced);
      motionButton?.classList.toggle('active', reduced);
      motionButton?.setAttribute('aria-pressed', String(reduced));
    };
    applyMotion(readLocalPreference('bitbt_reduce_motion') === 'true');
    motionButton?.addEventListener('click', () => {
      const reduced = motionButton.getAttribute('aria-pressed') !== 'true';
      writeLocalPreference('bitbt_reduce_motion', String(reduced));
      applyMotion(reduced);
    });
    const redrawDisplay = () => {
      // Redraw cached data only: changing display preferences must not send RPC,
      // reset input fields, invalidate signed snapshots or request authentication.
      renderTokens(); renderRank(); renderLiveRows(); renderMyPanels();
      if (state.selected && state.detail) renderSelected({ refreshQuote: false });
      renderPerpetual(); renderAnnouncements();
      for (const entry of charts.values()) entry.chart.applyOptions({localization: chartLocalization(),timeScale:{tickMarkFormatter:chartTick}});
    };
    for (const [selector, key, allowed] of [
      ['[data-display-timezone]', 'bitbt_time_zone', ['', 'Asia/Shanghai', 'UTC', 'America/New_York']],
      ['[data-display-precision]', 'bitbt_price_precision', ['', '6', '8']],
    ]) {
      const select = $(selector);
      if (!select) continue;
      const saved = readLocalPreference(key);
      select.value = allowed.includes(saved) ? saved : '';
      select.addEventListener('change', () => {
        if (!allowed.includes(select.value)) return;
        writeLocalPreference(key, select.value);
        redrawDisplay();
      });
    }
    $('[data-save-display]')?.addEventListener('click', () => toast(uiCopy('语言、时区、价格精度与动态效果偏好已保存', 'Language, time zone, price precision and motion preferences saved')));
    const contacts = ['https://bitbt.com', 'mailto:support@bitbt.com', 'https://t.me/BitBTVentures', 'https://x.com/0xcryptolin'];
    $$('.profile-support button').forEach((button, index) => {
      button.removeAttribute('data-action-confirm');
      button.addEventListener('click', () => {
        if (contacts[index]) window.open(contacts[index], '_blank', 'noopener,noreferrer');
      });
    });
  };
  const bind = () => {
    $("[data-perp-refresh]")?.addEventListener("click", () => loadPerpetual().catch((error) => toastError(error, "永续市场刷新失败")));
    $("#perp-market")?.addEventListener("change", () => {
      state.preparedPerpAction = null;
      state.preparedPerpRequest = null;
      state.perpPosition = null;
      renderPerpetual();
      void loadPerpetualPosition().catch((error) => toastError(error, "永续仓位读取失败"));
    });
    $("#perp-action")?.addEventListener("change", () => {
      state.preparedPerpAction = null;
      state.preparedPerpRequest = null;
      renderPerpetual();
    });
    $$('[data-panel="perpetual"] input, [data-panel="perpetual"] select, [data-panel="perps"] input, [data-panel="perps"] select').forEach((node) => node.addEventListener("input", () => {
      if (node.id === 'perps-price-limit') node.dataset.userEdited = 'true';
      state.preparedPerpAction = null;
      state.preparedPerpRequest = null;
      renderPerpetual();
    }));
    $("[data-perp-submit]")?.addEventListener("click", () => handlePerpetualSubmit().catch((error) => toastError(error, "永续操作失败")));
    $("#perps-submit")?.addEventListener("click", (event) => {
      event.preventDefault();
      const closing = state.perpModernAction === 'close_position';
      handlePerpetualSubmit().catch((error) => toastError(error, closing
        ? "平仓暂未完成，后台可能仍在准备；请稍等片刻后再试"
        : "开仓暂未完成，后台可能仍在准备；请稍等片刻后再试"));
    });
    const scrollToPerpetualOrderForm = () => {
      const scroll = () => $('[data-panel="perps"] .perps-order-column')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
      else window.setTimeout(scroll, 0);
    };
    root.addEventListener("click", (event) => {
      const menuToggle = event.target.closest('[data-global-menu-toggle]');
      if (menuToggle) {
        event.preventDefault();
        setGlobalMenuOpen(!root.classList.contains('navigation-open'));
        return;
      }
      if (event.target.closest('[data-global-menu-close]')) {
        event.preventDefault();
        setGlobalMenuOpen(false);
        return;
      }
      if (root.classList.contains('navigation-open') && !event.target.closest('.screen-switcher, .official-contact-footer')) {
        setGlobalMenuOpen(false);
      }
      const shortcut = event.target.closest('[data-perp-shortcut]');
      if (shortcut) {
        event.preventDefault();
        const action = shortcut.dataset.perpShortcut;
        if (!['deposit_liquidity', 'withdraw_liquidity'].includes(action)) return;
        state.preparedPerpAction = null;
        state.preparedPerpRequest = null;
        const field = $('#perp-action');
        if (field) field.value = action;
        show('perpetual');
        renderPerpetual();
        return;
      }
      if (event.target.closest('[data-perp-pool-share]')) {
        event.preventDefault();
        const market = selectedPerpMarket();
        if (market) void copyText(`BitBT Pump · ${selectedNetwork().name}\n永续市场 #${market.marketId}\n代币地址：${market.tokenAddress}\n${location.origin}${pumpBasePath()}?screen=perps`).then(() => toast('池子信息已复制')).catch(error => toastError(error, '复制失败'));
        return;
      }
      const openButton = event.target.closest("[data-open]");
      if (openButton && !openButton.dataset.liveToken) {
        event.preventDefault();
        if (openButton.dataset.perpMarketId != null) {
          state.selectedPerpMarketId = Number(openButton.dataset.perpMarketId);
          state.perpPosition = null;
          state.perpQuoteBalance = null;
          state.perpCandles = [];
          state.preparedPerpAction = null;
          state.preparedPerpRequest = null;
        }
        if (openButton.dataset.launchMode) applyLaunchMode(openButton.dataset.launchMode);
        if (openButton.dataset.openPerpsSide) {
          state.perpModernAction = 'open_position';
          state.preparedPerpAction = null;
          state.preparedPerpRequest = null;
          $$('[data-perps-side]').forEach(button => button.classList.toggle('active', button.dataset.perpsSide === openButton.dataset.openPerpsSide));
        }
        show(openButton.dataset.open);
        if (openButton.closest('.screen-switcher')) setGlobalMenuOpen(false);
        if (openButton.dataset.side) applySide(openButton.dataset.side === "sell");
        if (openButton.dataset.perpMarketId != null) {
          void Promise.all([loadPerpetualPosition(), loadPerpetualWalletBalance(), loadPerpetualCandles()]).catch((error) => toastError(error, "永续市场读取失败"));
          scrollToPerpetualOrderForm();
        }
        return;
      }
      const serviceButton = event.target.closest("[data-perp-service-submit]");
      if (serviceButton) {
        event.preventDefault();
        submitPerpetualService(serviceButton.dataset.perpServiceSubmit).catch((error) => toastError(error, "永续服务提交失败"));
        return;
      }
      const resumePoolButton = event.target.closest("[data-perp-pool-resume]");
      if (resumePoolButton) {
        event.preventDefault();
        if (state.perpServiceBusy) return;
        const request = state.perpServiceRequests.find((item) => item.requestId === resumePoolButton.dataset.perpPoolResume);
        state.perpServiceBusy = true;
        renderPerpetualServices();
        completePaidPoolRequest(request)
          .catch((error) => toastError(error, "对手池注资失败"))
          .finally(() => {
            state.perpServiceBusy = false;
            renderPerpetualServices();
          });
        return;
      }
      const closePositionButton = event.target.closest("[data-perp-close-market]");
      if (closePositionButton) {
        event.preventDefault();
        const marketId = parsePerpMarketId(closePositionButton.dataset.perpCloseMarket);
        if (marketId == null || !state.perpMarkets.some((market) => Number(market.marketId) === marketId)) {
          toastError(new Error("找不到该持仓对应的真实市场"), "无法进入平仓");
          return;
        }
        state.selectedPerpMarketId = marketId;
        state.perpModernAction = "close_position";
        state.perpPosition = null;
        state.perpQuoteBalance = null;
        state.perpCandles = [];
        state.preparedPerpAction = null;
        state.preparedPerpRequest = null;
        show("perps");
        renderPerpetual();
        void Promise.all([loadPerpetualPosition(), loadPerpetualWalletBalance(), loadPerpetualCandles()])
          .catch((error) => toastError(error, "平仓页数据读取失败"));
        return;
      }
      if (event.target.closest("[data-perp-activity-refresh]")) {
        event.preventDefault();
        loadPerpetualActivity().catch((error) => toastError(error, "链上记录刷新失败"));
        return;
      }
      const activityFilter = event.target.closest("[data-perp-activity-filter]");
      if (activityFilter) {
        event.preventDefault();
        if (activityFilter.disabled) return;
        state.perpActivityFilter = activityFilter.dataset.perpActivityFilter || "all";
        renderPerpetualServices();
        return;
      }
      if (event.target.closest("[data-perp-history-more]")) {
        event.preventDefault();
        void loadPerpetualActivity(true).catch((error) => toastError(error, '交易记录加载失败'));
        return;
      }
      if (event.target.closest("[data-perp-activity-export]")) {
        event.preventDefault();
        const exportedActivity = filteredPerpetualActivity();
        const rows = [["market_id", "trader", "event_type", "tx_hash", "block_number", "log_index", "indexed_at"], ...exportedActivity.map((item) => [item.marketId, item.traderAddress, item.eventType, item.lastTxHash || "", item.blockNumber, item.logIndex, item.updatedAt])];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `bitbt-perpetual-activity-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const marketButton = event.target.closest("[data-real-perp-market]");
      if (marketButton) {
        event.preventDefault();
        state.selectedPerpMarketId = Number(marketButton.dataset.realPerpMarket);
        const legacySelect = $("#perp-market");
        if (legacySelect) legacySelect.value = String(state.selectedPerpMarketId);
        state.perpPosition = null;
        state.perpQuoteBalance = null;
        state.preparedPerpAction = null;
        state.preparedPerpRequest = null;
        renderPerpetual();
        void loadPerpetualPosition().catch((error) => toastError(error, "永续仓位读取失败"));
        void loadPerpetualWalletBalance().catch((error) => toastError(error, "保证金余额读取失败"));
        void loadPerpetualCandles().catch((error) => toastError(error, "永续 K 线读取失败"));
        // Market cards are above the chart on mobile. Make the selected card
        // lead to the actual order form, including when it was already active.
        scrollToPerpetualOrderForm();
        return;
      }
      const perpInterval = event.target.closest("[data-perps-chart-interval]");
      if (perpInterval) {
        event.preventDefault();
        state.perpChartInterval = Number(perpInterval.dataset.perpsChartInterval || 300);
        $$('[data-perps-chart-interval]').forEach((node) => node.classList.toggle('active', node === perpInterval));
        state.perpCandles = [];
        renderPerpetualChart();
        void loadPerpetualCandles().catch((error) => toastError(error, "永续 K 线读取失败"));
        return;
      }
      const indicatorButton = event.target.closest('[data-perps-indicator]');
      if (indicatorButton) {
        event.preventDefault();
        const indicator = String(indicatorButton.dataset.perpsIndicator || '').toUpperCase();
        const supported = ['MA', 'EMA', 'BOLL', 'ST', 'VOL', 'MACD', 'KDJ', 'RSI'];
        if (!supported.includes(indicator)) return;
        const active = new Set(state.perpChartIndicators);
        if (active.has(indicator)) active.delete(indicator); else active.add(indicator);
        state.perpChartIndicators = supported.filter((name) => active.has(name));
        $$('[data-perps-indicator]').forEach((node) => node.classList.toggle('active', active.has(String(node.dataset.perpsIndicator || '').toUpperCase())));
        renderPerpetualChart();
        return;
      }
      const sideButton = event.target.closest("[data-perps-side]");
      if (sideButton) {
        state.perpModernAction = "open_position";
        $$('[data-perps-side]').forEach((node) => node.classList.toggle("active", node === sideButton));
        const priceInput = $('#perps-price-limit');
        if (priceInput) priceInput.dataset.userEdited = '';
        state.preparedPerpAction = null;
        state.preparedPerpRequest = null;
        renderPerpetual();
      }
      if (event.target.closest('[data-perps-use-market-price]')) {
        event.preventDefault();
        const priceInput = $('#perps-price-limit');
        const marketPrice = $('[data-perps-market-price]')?.textContent?.trim();
        if (priceInput && marketPrice && marketPrice !== '—') {
          priceInput.value = marketPrice;
          priceInput.dataset.userEdited = 'true';
        }
        state.preparedPerpAction = null;
        state.preparedPerpRequest = null;
        renderPerpetual();
      }
      if (event.target.closest('[data-perps-clear-missing-pending]')) {
        event.preventDefault();
        void (async () => {
          if (!state.account || !state.perpConfig?.contractAddress) throw new Error('请先连接原钱包并加载永续市场');
          const pendingKey = `bitbt_perp_pending:bsc:${state.perpConfig.contractAddress}:${state.account.toLowerCase()}`;
          const hash = readLocalPreference(pendingKey);
          if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('没有可核对的待确认交易哈希');
          const provider = selectedProvider();
          const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
          const transaction = await provider.request({ method: 'eth_getTransactionByHash', params: [hash] });
          if (receipt || transaction) throw new Error('钱包节点仍能查到该交易，不能清除；请等待链上确认');
          if (!window.confirm(`钱包节点查不到交易 ${hash}。请确认你已在区块浏览器核对该哈希不存在；清除旧记录后可重新尝试开仓。`)) return;
          if (readLocalPreference(pendingKey) !== hash) throw new Error('待确认记录已变化，请重新核对');
          writeLocalPreference(pendingKey, '');
          if (readLocalPreference(pendingKey)) throw new Error('浏览器未能清除旧记录，请检查存储权限');
          renderPerpetual();
          toast('旧交易记录已清除，请重新确认价格后开仓', 6000);
        })().catch((error) => toastError(error, '核对旧交易失败'));
        return;
      }
      const viewButton = event.target.closest("[data-perps-view]");
      if (viewButton) {
        const view = viewButton.dataset.perpsView;
        $$('[data-perps-view]').forEach((node) => node.classList.toggle('active', node === viewButton));
        $$('[data-perps-panel]').forEach((node) => node.classList.toggle('active', node.dataset.perpsPanel === view));
        return;
      }
      if (event.target.closest("[data-modern-perp-close]")) {
        state.perpModernAction = "close_position";
        renderPerpetual();
        submitPerpetualAction().catch((error) => toastError(error, "平仓暂未完成，后台可能仍在准备；请稍等片刻后再试"));
      }
    });
    $("#perps-market-search")?.addEventListener("input", (event) => {
      const keyword = String(event.target.value || "").trim().toLowerCase();
      let visible = 0;
      $$('[data-real-perp-search]').forEach((node) => {
        const match = !keyword || String(node.dataset.search || "").includes(keyword);
        node.classList.toggle("hidden", !match);
        if (match) visible += 1;
      });
      $("[data-perps-search-empty]")?.classList.toggle("show", visible === 0);
      $("[data-perps-search-shell]")?.classList.add("open");
    });
    $$('[data-announcement-filter]').forEach((node) => node.addEventListener("click", () => {
      state.announcementFilter = node.dataset.announcementFilter || "all";
      $$('[data-announcement-filter]').forEach((button) => button.classList.toggle("active", button === node));
      state.selectedAnnouncementId = "";
      renderAnnouncements();
    }));
    $("[data-announcements-read-all]")?.addEventListener("click", () => {
      saveReadAnnouncementIds(new Set(state.announcements.map((item) => item.id)));
      renderAnnouncements();
      toast(pumpLocale() === "zh" ? "所有公告已标为已读" : "All notices marked as read");
    });
    $$("[data-wallet-label], .connect-global, .connect").forEach((node) => {
      node.dataset.walletBound = "1";
      node.addEventListener("click", () => connectWallet().catch((error) => toastError(error, "钱包连接失败，请重试")));
    });
    $$('[data-toast]:not([data-wallet-bound="1"])').forEach((node) => node.addEventListener("click", () => toast(node.dataset.toast)));
    $$("[data-copy-token-address]").forEach((node) =>
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          copyTokenAddress().catch((error) => toastError(error, "代币地址复制失败"));
        },
        true,
      ),
    );
    $$("[data-share-token]").forEach((node) =>
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          shareToken().catch((error) => toastError(error, "代币链接复制失败"));
        },
        true,
      ),
    );
    $$("[data-favorite-token]").forEach((node) =>
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          toggleFavorite().catch((error) => toastError(error, "自选更新失败"));
        },
        true,
      ),
    );
    $$("[data-token-alert]").forEach((node) =>
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          setTokenAlert(node.dataset.tokenAlert).catch((error) => toastError(error, "提醒设置失败"));
        },
        true,
      ),
    );
    $("[data-comment-submit]")?.addEventListener("click", (event) => {
      event.preventDefault();
      submitComment().catch((error) => toastError(error, "评论发布失败"));
    });
    $$("[data-chart-interval]").forEach((node) =>
      node.addEventListener("click", () => {
        const interval = Number(node.dataset.chartInterval);
        if (![60, 300, 600, 900, 3600, 7200, 14400, 86400].includes(interval)) return;
        state.chartInterval = interval;
        $$("[data-chart-interval]").forEach((choice) => choice.classList.toggle("active", Number(choice.dataset.chartInterval) === interval));
        void reloadCandles().catch((error) => toastError(error, "K 线加载失败，请稍后重试"));
      }),
    );
    $$("[data-chart-indicator]").forEach((node) =>
      node.addEventListener("click", () => {
        const indicator = String(node.dataset.chartIndicator || '').toUpperCase();
        const supported = ['MA', 'EMA', 'BOLL', 'ST', 'VOL', 'MACD', 'KDJ', 'RSI'];
        if (!supported.includes(indicator)) return;
        const active = new Set(state.chartIndicators);
        if (active.has(indicator)) active.delete(indicator); else active.add(indicator);
        state.chartIndicators = supported.filter((name) => active.has(name));
        $$("[data-chart-indicator]").forEach((choice) => choice.classList.toggle("active", active.has(String(choice.dataset.chartIndicator || '').toUpperCase())));
        drawCharts();
      }),
    );
    $$("[data-kline-more]").forEach((node) =>
      node.addEventListener("click", () => {
        const row = node.closest('.kline-time-row');
        const expanded = !row?.classList.contains('expanded');
        row?.classList.toggle('expanded', expanded);
        node.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        node.textContent = expanded ? uiCopy('收起', 'Less') : uiCopy('更多', 'More');
      }),
    );
    $$("[data-trade-side]").forEach((node) => node.addEventListener("click", () => applySide(node.dataset.tradeSide === "sell")));
    const input = $("#trade-amount");
    input?.addEventListener("input", () => {
      window.clearTimeout(input._quoteTimer);
      input._quoteTimer = window.setTimeout(() => updateQuote().catch((error) => toastError(error, "报价获取失败，请稍后重试")), 350);
    });
    $("#trade-submit")?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        executeTrade().catch((error) => toastError(error, "交易提交失败，请稍后重试"));
      },
      true,
    );
    $$("[data-launch-publish]").forEach((node) => {
      if (node.dataset.launchBound) return;
      node.dataset.launchBound = "1";
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          launchToken().catch((error) => toastError(error, "发币提交失败，请稍后重试"));
        },
        true,
      );
    });
  };
  const applyMarketActivity = (payload) => {
    state.marketActivityReady = true;
    state.marketActivity = Array.isArray(payload?.activity) ? payload.activity : [];
    state.marketSummary = payload?.summary && typeof payload.summary === "object" ? payload.summary : {};
    renderMarketSummary();
    renderLiveRows();
  };
  const renderUnavailable = (error) => {
    state.marketActivityReady = false;
    clearPrototype();
    state.tokens = [];
    state.details = {};
    state.selected = null;
    state.detail = null;
    state.trades = [];
    state.candles = [];
    state.migrationProof = null;
    selectedDetailAddress = "";
    state.marketActivity = [];
    state.marketSummary = {};
    const banner = $("[data-api-status]");
    if (banner) banner.textContent = uiCopy("实时 Pump 数据暂不可用", "Live Pump DataUnavailable");
    text("[data-market-stream-status]", uiMarkup`${selectedNetwork().shortName} 数据流暂不可用`);
    toastError(error, "实时 Pump 数据暂不可用，请稍后重试");
  };
  const applyLaunchOptions = (options) => {
    state.launchOptions = options || null;
    const allowed = launchQuoteTokens();
    $$("[data-launch-quote]").forEach((node) => {
      node.hidden = !allowed.has(String(node.dataset.launchQuote || "").toUpperCase());
    });
    if (!allowed.has(state.launchQuote)) {
      state.launchQuote = selectedNetwork().native;
    }
    $$('[data-launch-quote]').forEach((node) => {
      node.classList.toggle('active', String(node.dataset.launchQuote || '').toUpperCase() === state.launchQuote);
    });
    text('[data-migration-threshold-unit]', state.launchQuote);
    text('[data-initial-buy-unit]', state.launchQuote);
    const select = $("#launch-dex-profile");
    const profiles = (options?.dex_profiles || []).filter((profile) => profile.enabled);
    if (select && profiles.length) {
      select.innerHTML = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} · ${escapeHtml(profile.lp_policy === "burn" ? uiCopy("LP 销毁", "LP burn") : uiCopy("LP 奖励", "LP rewards"))}</option>`).join("");
      state.launchDexProfile = profiles.some((profile) => profile.id === state.launchDexProfile) ? state.launchDexProfile : profiles[0].id;
      select.value = state.launchDexProfile;
    } else if (select) {
      select.innerHTML = `<option value="">${escapeHtml(selectedNetwork().shortName)} · ${uiCopy('暂无可用 DEX', 'No available DEX')}</option>`;
      state.launchDexProfile = "";
    }
    setLaunchAvailability(Boolean(state.account && state.chainId === selectedNetwork().chainIdHex && launchEnabledForSelectedChain()));
  };
  const load = async () => {
    try {
      const [tokens, market, config, launchOptions] = await Promise.all([api("v1/pump/market"), api("v1/pump/market-activity?limit=100").catch(() => null), api("v1/app/config").catch(() => null), api("v1/token/launch-options").catch(() => null)]);
      state.tokens = tokens;
      state.config = config;
      applyLaunchOptions(launchOptions);
      if (market) applyMarketActivity(market);
      else {
        state.marketActivityReady = false;
        renderMarketSummary();
        text("[data-market-stream-status]", "全市场链上动态暂不可用");
        const banner = $("[data-api-status]");
        if (banner) banner.textContent = `Pump 项目数据已连接 · ${state.tokens.length} 个项目 · 全市场动态暂不可用`;
      }
      renderTokens();
      const routedAddress = routeTokenAddress();
      if (routedAddress) await openTokenAddress(routedAddress, { historyMode: "replace" });
      else {
        const first = state.tokens.find((token) => tokenAddress(token));
        if (first) void loadDetail(first).catch((error) => toastError(error, "首个项目详情加载失败"));
      }
    } catch (error) {
      renderUnavailable(error);
    }
  };
  const refreshSelectedTrades = () => {
    if (state.tradesRefreshPromise || !state.selected) return state.tradesRefreshPromise;
    const address = tokenAddress(state.selected).toLowerCase();
    if (selectedDetailAddress !== address) return null;
    state.tradesRefreshPromise = (async () => {
      const [trades, candles] = await Promise.all([api(`v1/pump/trades?token_address=${encodeURIComponent(address)}`), fetchCandles(address)]);
      if (tokenAddress(state.selected).toLowerCase() !== address || selectedDetailAddress !== address) return;
      state.trades = trades;
      state.candles = candles;
      renderSelected();
      drawCharts();
    })()
      .catch((error) => toastError(error, "成交与 K 线刷新失败，请稍后重试"))
      .finally(() => {
        state.tradesRefreshPromise = null;
      });
    return state.tradesRefreshPromise;
  };
  const refreshLive = ({ refreshSelected = true } = {}) => {
    if (state.liveRefreshPromise) return state.liveRefreshPromise;
    state.liveRefreshPromise = (async () => {
      const [tokens, market] = await Promise.all([api("v1/pump/market"), api("v1/pump/market-activity?limit=100").catch(() => null)]);
      state.tokens = tokens;
      if (market) applyMarketActivity(market);
      else text("[data-market-stream-status]", "全市场链上动态暂不可用");
      renderTokens();
      if (refreshSelected && state.selected) {
        const address = tokenAddress(state.selected).toLowerCase();
        const freshToken = state.tokens.find((token) => tokenAddress(token).toLowerCase() === address) || state.selected;
        await loadDetail(freshToken, {
          refreshBalance: false,
          forceDetail: true,
          refreshTrades: false,
        }).catch((error) => toastError(error, "项目详情刷新失败，请稍后重试"));
      }
    })()
      .catch((error) => renderUnavailable(error))
      .finally(() => {
        state.liveRefreshPromise = null;
      });
    return state.liveRefreshPromise;
  };
  const refreshTriggeredAlerts = async () => {
    if (!state.account) return;
    const previous = new Map(state.alerts.map((alert) => [alert.id, alert]));
    const next = await api(`v1/pump/alerts?wallet_address=${encodeURIComponent(state.account)}`);
    const triggered = next.filter((alert) => previous.get(alert.id)?.enabled && !alert.enabled && alert.last_triggered_at);
    state.alerts = next;
    renderAlerts();
    triggered.forEach((alert) => {
      const token = state.tokens.find((item) => tokenAddress(item).toLowerCase() === String(alert.token_address || "").toLowerCase());
      toast(`${token?.symbol || short(alert.token_address)} 提醒已触发`);
    });
  };
  const scheduleMarketRefresh = (selectedChanged) => {
    pendingSelectedMarketChange ||= selectedChanged;
    if (marketRefreshTimer) return;
    const delay = Math.max(350, 5000 - (Date.now() - lastMarketEventRefreshAt));
    marketRefreshTimer = window.setTimeout(() => {
      marketRefreshTimer = null;
      if (document.visibilityState === "hidden") return;
      lastMarketEventRefreshAt = Date.now();
      const refreshSelectedTradesNow = pendingSelectedMarketChange;
      pendingSelectedMarketChange = false;
      void refreshLive({ refreshSelected: !refreshSelectedTradesNow });
      if (refreshSelectedTradesNow) void refreshSelectedTrades();
      if (state.account && Date.now() - lastAlertRefreshAt >= 30000) {
        lastAlertRefreshAt = Date.now();
        window.setTimeout(() => {
          void refreshTriggeredAlerts().catch(() => {});
        }, 500);
      }
    }, delay);
  };
  const handlePumpSocketMessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    const eventToken = String(payload?.token_address || '').toLowerCase();
    if (payload?.type === 'perpetual_kline_updated') {
      if (perpetualPanelActive() && eventToken === String(selectedPerpMarket()?.tokenAddress || '').toLowerCase()) {
        void loadPerpetualCandles().catch(() => {});
        schedulePerpetualPositionStreamRefresh();
      }
      return;
    }
    if (payload?.type !== "pump_trade" || !/^0x[0-9a-fA-F]{40}$/.test(eventToken)) return;
    state.marketActivity = [
      {
        activity_type: payload.side,
        token_address: payload.token_address,
        trader: payload.trader,
        tx_hash: payload.tx_hash,
        quote_token: payload.quote_token,
        quote_amount: payload.quote_amount,
        token_amount: payload.token_amount,
        status: "success",
        timestamp: Math.floor(Date.now() / 1000),
      },
      ...state.marketActivity.filter((item) => item.tx_hash !== payload.tx_hash),
    ].slice(0, 100);
    renderLiveRows();
    const selectedChanged = tokenAddress(state.selected).toLowerCase() === String(payload.token_address).toLowerCase();
    scheduleMarketRefresh(selectedChanged);
  };
  const connectMarketSocket = () => {
    if (typeof WebSocket === "undefined") {
      text("[data-market-stream-status]", "当前浏览器不支持实时连接，已使用定时刷新");
      return;
    }
    if (document.visibilityState === "hidden" || marketSocket?.readyState === WebSocket.OPEN || marketSocket?.readyState === WebSocket.CONNECTING) return;
    window.clearTimeout(marketSocketTimer);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/market?chain_id=${encodeURIComponent(state.selectedChain)}`);
    marketSocket = socket;
    text("[data-market-stream-status]", `正在连接 ${selectedNetwork().shortName} 实时数据流…`);
    socket.addEventListener("open", () => {
      if (marketSocket !== socket) return;
      marketSocketRetry = 0;
      text("[data-market-stream-status]", `${selectedNetwork().shortName} 实时数据流已连接`);
      if (perpetualPanelActive()) {
        void loadPerpetualCandles().catch(() => {});
        schedulePerpetualPositionStreamRefresh();
      }
    });
    socket.addEventListener("message", handlePumpSocketMessage);
    socket.addEventListener("close", () => {
      if (marketSocket !== socket) return;
      marketSocket = null;
      const delay = Math.min(120000, 1000 * 2 ** Math.min(marketSocketRetry++, 7));
      text("[data-market-stream-status]", `实时连接已断开，${Math.ceil(delay / 1000)} 秒后重连`);
      marketSocketTimer = window.setTimeout(connectMarketSocket, delay);
    });
    socket.addEventListener("error", () => socket.close());
  };
  $$("[data-launch-quote]").forEach((node) =>
    node.addEventListener("click", () => {
      state.launchQuote = String(node.dataset.launchQuote || "").toUpperCase();
      const unit = $("[data-migration-threshold-unit]");
      if (unit) unit.textContent = state.launchQuote;
      const initialUnit = $("[data-initial-buy-unit]");
      if (initialUnit) initialUnit.textContent = state.launchQuote;
      const target = $("#migration-threshold-quote");
      if (target && state.curveMode === "custom") target.value = state.launchQuote === selectedNetwork().native ? "115" : "69000";
      invalidateLaunchSnapshot();
      $$("[data-launch-quote]").forEach((choice) => choice.classList.toggle("active", choice === node));
    }),
  );
  $("#launch-dex-profile")?.addEventListener("change", (event) => {
    state.launchDexProfile = String(event.target.value || "pancakeswap_v2");
    invalidateLaunchSnapshot();
  });
  $$("[data-curve-mode]").forEach((node) => node.addEventListener("click", () => setCurveMode(node.dataset.curveMode)));
  $$("[data-tax-mode]").forEach((node) => node.addEventListener("click", () => setTaxMode(node.dataset.taxMode === "tax")));
  $$('[data-tax-preset]').forEach(button => button.addEventListener('click', () => {
    const rate = Number(button.dataset.taxPreset);
    if (![0, 1, 3, 5].includes(rate)) return;
    if (rate > 0) for (const id of ['buy-tax-rate', 'sell-tax-rate']) $('#' + id).value = String(rate);
    setTaxMode(rate > 0);
  }));
  $$('[data-tax-plan]').forEach(button => button.addEventListener('click', () => {
    const plan = button.dataset.taxPlan;
    if (!['standard', 'creator', 'holders'].includes(plan)) return;
    setTaxMode(plan !== 'standard');
    if (plan !== 'standard') {
      for (const id of ['funds-recipient-pct', 'burn-pct', 'holders-pct', 'liquidity-pct']) $('#' + id).value = id === (plan === 'creator' ? 'funds-recipient-pct' : 'holders-pct') ? '100' : '0';
    }
    renderTaxChoices();
    invalidateLaunchSnapshot();
  }));
  $$('[data-panel="create-tax"] input').forEach(input => input.addEventListener('input', renderTaxChoices));
  $$('[data-panel="create-basic"] input, [data-panel="create-basic"] textarea, [data-panel="create-basic"] select, [data-panel="create-economics"] input, [data-panel="create-economics"] textarea, [data-panel="create-economics"] select, [data-panel="create-tax"] input, [data-panel="create-tax"] textarea, [data-panel="create-tax"] select').forEach((node) => {
    node.addEventListener("input", invalidateLaunchSnapshot);
    node.addEventListener("change", invalidateLaunchSnapshot);
  });
  $$('[data-panel="create-economics"] .choice, [data-panel="create-tax"] .choice, [data-panel="create-mode"] [data-launch-mode]').forEach((node) => node.addEventListener("click", invalidateLaunchSnapshot));
  $$("[data-token-filter]").forEach((node) =>
    node.addEventListener("click", () => {
      state.tokenFilter = node.dataset.tokenFilter || "trending";
      $$("[data-token-filter]").forEach((filter) => filter.classList.toggle("active", filter === node));
      renderTokens();
    }),
  );
  const bindMarketSelect = (selector, stateKey) =>
    $(selector)?.addEventListener("change", (event) => {
      state[stateKey] = String(event.target?.value || "all").toLowerCase();
      renderTokens();
    });
  bindMarketSelect("[data-market-quote-filter]", "marketQuoteFilter");
  bindMarketSelect("[data-market-category-filter]", "marketCategoryFilter");
  bindMarketSelect("[data-market-type-filter]", "marketTypeFilter");
  const selectAccountTab = (panel, name) => {
    if (!panel) return;
    panel.querySelectorAll('[data-account-tab]').forEach(node => node.classList.toggle('active', node.dataset.accountTab === name));
    panel.querySelectorAll('[data-account-panel]').forEach(node => node.classList.toggle('active', node.dataset.accountPanel === name));
  };
  $$('[data-account-tab]').forEach(button => button.addEventListener('click', () => selectAccountTab(button.closest('[data-panel]'), button.dataset.accountTab)));
  $('[data-income-show-vaults]')?.addEventListener('click', event => selectAccountTab(event.currentTarget.closest('[data-panel]'), 'income-split'));
  $('[data-alert-create]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const address = $('#alert-token-select')?.value;
    const kind = $('#alert-kind-select')?.value;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address || '') || !['curve_80', 'curve_90', 'migrated'].includes(kind)) {
      toastError(new Error('请选择有效代币和提醒类型'), '提醒未创建'); return;
    }
    if (state.alerts.some(item => item.enabled && item.token_address?.toLowerCase() === address.toLowerCase() && item.alert_type === kind)) {
      toast('该提醒已开启，无需重复创建'); return;
    }
    button.disabled = true;
    try { await setTokenAlert(kind, address); }
    catch (error) { toastError(error, '提醒创建失败'); }
    finally { button.disabled = false; }
  });
  $('#alert-kind-select')?.addEventListener('change', event => {
    const display = $('#alert-threshold-display');
    if (display) display.value = event.target.value === 'curve_80' ? '80' : event.target.value === 'curve_90' ? '90' : '—';
  });
  $$('[data-market-type]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.marketType;
    if (!['spot', 'perps'].includes(view)) return;
    $$('[data-market-type]').forEach(node => node.classList.toggle('active', node.dataset.marketType === view));
    $$('[data-market-panel]').forEach(node => node.classList.toggle('active', node.dataset.marketPanel === view));
    if (view === 'perps' && !state.perpConfig) void loadPerpetual().catch(error => toastError(error, '永续市场读取失败'));
  }));
  $$("[data-token-search-toggle]").forEach((node) =>
    node.addEventListener("click", () => {
      show("discover");
      const input = $("[data-token-search]");
      if (!input) return;
      input.hidden = false;
      input.focus();
    }),
  );
  $("[data-token-search]")?.addEventListener("input", (event) => {
    state.tokenSearch = event.target.value || "";
    renderTokens();
    renderPerpetualMarketCards();
  });
  $$("[data-live-filter]").forEach((node) =>
    node.addEventListener("click", () => {
      state.liveFilter = node.dataset.liveFilter || "all";
      $$("[data-live-filter]").forEach((filter) => filter.classList.toggle("active", filter === node));
      renderLiveRows();
    }),
  );
  $$("[data-rank-filter]").forEach((node) =>
    node.addEventListener("click", () => {
      state.rankFilter = node.dataset.rankFilter || "progress";
      $$("[data-rank-filter]").forEach((filter) => filter.classList.toggle("active", filter === node));
      renderRank();
    }),
  );
  $$("[data-rank-window]").forEach((node) =>
    node.addEventListener("click", () => {
      state.rankWindow = node.dataset.rankWindow || "24h";
      $$("[data-rank-window]").forEach((windowButton) => windowButton.classList.toggle("active", windowButton === node));
      renderRank();
    }),
  );
  $$("[data-launch-filter]").forEach((node) =>
    node.addEventListener("click", () => {
      state.myLaunchFilter = node.dataset.launchFilter || "all";
      $$("[data-launch-filter]").forEach((filter) => filter.classList.toggle("active", filter === node));
      renderMyPanels();
    }),
  );
  $$("[data-history-filter]").forEach((node) =>
    node.addEventListener("click", () => {
      state.historyFilter = node.dataset.historyFilter || "all";
      $$("[data-history-filter]").forEach((filter) => filter.classList.toggle("active", filter === node));
      renderMyPanels();
    }),
  );
  const switchProductChain = async (next) => {
      if (!NETWORKS[next] || next === state.selectedChain) return;
      walletSessionEpoch += 1;
      navigationEpoch += 1;
      state.selectedChain = next;
      userDataRequestSequence += 1;
      state.perpIndexedPositions = [];
      state.perpActivity = [];
      state.perpServiceRequests = [];
      state.perpHistoryCursor = null;
      state.perpHistoryBusy = false;
      state.perpReadErrors = {};
      writeLocalPreference(CHAIN_KEY, next);
      if (marketSocket) {
        const oldSocket = marketSocket;
        marketSocket = null;
        oldSocket.close();
      }
      window.clearTimeout(marketSocketTimer);
      state.tokens = [];
      state.details = {};
      state.selected = null;
      state.detail = null;
      state.marketActivity = [];
      state.marketActivityReady = false;
      state.launchOptions = null;
      state.launchQuote = selectedNetwork().native;
      state.perpConfig = null;
      state.perpMarkets = [];
      state.vaultConfig = null;
      state.vaults = [];
      state.strategyConfig = null;
      state.vaultRegistry = [];
      state.strategies = [];
      invalidateQuote();
      invalidateLaunchSnapshot();
      if (state.account) resetProviderState(`已切换至 ${selectedNetwork().name}，请重新连接钱包`);
      routeHistory()?.replaceState?.(null, "", pumpBasePath());
      renderTokens();
      await load();
      connectMarketSocket();
  };
  const chainSelect = $("[data-chain-select]");
  if (chainSelect) {
    chainSelect.value = state.selectedChain;
    chainSelect.addEventListener("change", (event) => void switchProductChain(String(event.target.value || "bsc")));
  }
  const chainMenu = $("[data-chain-menu]");
  const chainMenuToggle = $("[data-chain-menu-toggle]");
  const renderChainMenu = () => {
    const network = selectedNetwork();
    text("[data-active-network-label]", network.shortName);
    text('[data-launch-chain-name]', network.shortName);
    // Update option labels in place: changing language must not reset a
    // selected migration route or invalidate the user's prepared snapshot.
    $$('#launch-dex-profile option').forEach(option => {
      const profile = state.launchOptions?.dex_profiles?.find(item => item.id === option.value);
      if (profile) option.textContent = `${profile.name} · ${profile.lp_policy === 'burn' ? uiCopy('LP 销毁', 'LP burn') : uiCopy('LP 奖励', 'LP rewards')}`;
      else if (!option.value) option.textContent = `${network.shortName} · ${uiCopy('暂无可用 DEX', 'No available DEX')}`;
    });
    $$('[data-launch-chain]').forEach(node => {
      const active = (node.dataset.launchChain === 'bnb' ? 'bsc' : node.dataset.launchChain) === state.selectedChain;
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', String(active));
      const badge = node.querySelector('.tag');
      if (badge) { badge.textContent = active ? uiCopy("已选择", 'Selected') : uiCopy('切换网络', 'Switch network'); badge.classList.toggle('lime', active); }
    });
    $$('[data-global-chain-logo], [data-active-network-logo]').forEach((logo) => {
      logo.src = state.selectedChain === "bsc" ? "./assets/chains/bnb-chain-brand.png" : "./assets/chains/robinhood-chain-brand.png";
      logo.alt = network.name;
    });
    $$('[data-global-chain-option]').forEach((node) => node.classList.toggle("active", node.dataset.globalChainOption === state.selectedChain));
  };
  renderChainMenu();
  chainMenuToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !chainMenu?.classList.contains("open");
    chainMenu?.classList.toggle("open", open);
    chainMenuToggle.setAttribute("aria-expanded", String(open));
  });
  $$('[data-global-chain-option], [data-launch-chain]').forEach((node) => node.addEventListener("click", async (event) => {
    event.stopPropagation();
    chainMenu?.classList.remove("open");
    chainMenuToggle?.setAttribute("aria-expanded", "false");
    const targetChain = node.dataset.launchChain === 'bnb' ? 'bsc' : node.dataset.launchChain || node.dataset.globalChainOption || 'bsc';
    try {
      await switchProductChain(String(targetChain));
      renderChainMenu();
      if (node.dataset.launchChain && state.selectedChain === targetChain) show('create-basic');
    } catch (error) { toastError(error, '切换发行网络失败'); }
  }));
  document.addEventListener("click", () => {
    chainMenu?.classList.remove("open");
    chainMenuToggle?.setAttribute("aria-expanded", "false");
  });
  routeWindow.addEventListener("popstate", () => {
    const address = routeTokenAddress();
    if (address) {
      void openTokenAddress(address, { historyMode: null }).catch((error) => toastError(error, "代币详情恢复失败"));
      return;
    }
    const screen = routeScreen();
    if (screen) {
      show(screen);
      return;
    }
    const discover = $('[data-panel="discover"]');
    if (discover) {
      $$("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel === discover));
      applyScreenChrome('discover');
      discover.scrollTop = 0;
    }
  });
  const prepare20260911Dom = () => {
    if (!ui20260911) return;
    const intervals = [60, 300, 900, 3600, 14400, 86400];
    $$('[data-panel="detail"] .time-row, [data-panel="trade"] .time-row').forEach((row) => {
      [...row.querySelectorAll('button')].forEach((button, index) => {
        if (intervals[index]) button.dataset.chartInterval = String(intervals[index]);
      });
    });
    $$('[data-panel="detail"] .chart-fallback, [data-panel="trade"] .chart-fallback').forEach((node) => node.setAttribute('data-chart-empty', ''));
  };
  let refreshCycle = 0;
  prepare20260911Dom();
  setLaunchAvailability(false);
  invalidateLaunchSnapshot();
  clearPrototype();
  document.body.classList.remove("runtime-pending");
  renderMyPanels();
  bindProviderEvents();
  bindNavigation();
  const initialScreen = routeScreen();
  if (initialScreen) show(initialScreen);
  bind();
  bindGrowth();
  bindVaults();
  bindDeveloperCenter();
  window.bitbtUiLocale?.apply(pumpLocale());
  text('[data-lang-current]', pumpLocale() === 'zh' ? '简体中文' : 'English');
  $$('[data-set-language]').forEach(button => button.classList.toggle('active', button.dataset.setLanguage === pumpLocale()));
  restoreLaunchConfirmation();
  void loadVaultConfig()
    .then(() => {
      if (state.account) return loadVaults();
    })
    .catch(() => {});
  void loadStrategyConfig()
    .then(() => {
      if (state.account) return loadStrategies();
    })
    .catch(() => {});
  void restoreSession();
  void load();
  void loadAnnouncements().catch(() => {
    text("[data-announcement-unread]", "!");
  });
  void loadFavorites();
  connectMarketSocket();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") connectMarketSocket();
  });
  window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    refreshCycle += 1;
    const socketHealthy = typeof WebSocket !== "undefined" && marketSocket?.readyState === WebSocket.OPEN;
    const refreshMarket = refreshCycle % (socketHealthy ? 4 : 2) === 0;
    const refreshTrades = refreshCycle % 2 === 0;
    if (refreshMarket) void refreshLive({ refreshSelected: !refreshTrades });
    if (refreshTrades) void refreshSelectedTrades();
    const perpetualStatusInterval = state.perpConfig?.operationsState === 'degraded' ? 8 : 4;
    if (ui20260911 && perpetualPanelActive() && refreshCycle % perpetualStatusInterval === 0) void refreshPerpetualStatus().catch(() => {});
  }, 30000);
})();
