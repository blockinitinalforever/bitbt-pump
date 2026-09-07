import EthereumProvider from "@walletconnect/ethereum-provider";

type BitBTWalletConnectBridge = {
  getProvider(projectId: string): Promise<EthereumProvider>;
  disconnect(): Promise<void>;
};

declare global {
  interface Window {
    BitBTWalletConnect?: BitBTWalletConnectBridge;
  }
}

let providerPromise: Promise<EthereumProvider> | null = null;

const createProvider = (projectId: string) => EthereumProvider.init({
  projectId,
  chains: [56],
  optionalChains: [56, 4663, 46630],
  methods: ["personal_sign", "eth_sendTransaction"],
  optionalMethods: [
    "eth_accounts",
    "eth_requestAccounts",
    "eth_estimateGas",
    "eth_call",
    "eth_getBalance",
    "eth_getBlockByNumber",
    "eth_getTransactionReceipt",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
  ],
  events: ["accountsChanged", "chainChanged"],
  optionalEvents: ["connect", "disconnect", "message"],
  rpcMap: {
    56: "https://bsc-dataseed.binance.org",
    4663: "https://rpc.mainnet.chain.robinhood.com",
    46630: "https://rpc.testnet.chain.robinhood.com",
  },
  showQrModal: true,
  qrModalOptions: {
    themeMode: "dark",
    enableExplorer: true,
  },
  metadata: {
    name: "BitBT Pump",
    description: "BitBT Pump — multi-chain launch and trading terminal",
    url: "https://bitbt.fun",
    icons: ["https://bitbt.fun/launchpad/assets/branding/bitbt-logo.png"],
  },
});

window.BitBTWalletConnect = {
  async getProvider(projectId) {
    const normalized = projectId.trim();
    if (!normalized) throw new Error("WalletConnect 尚未配置，请使用钱包 App 打开或联系支持");
    providerPromise ||= createProvider(normalized).catch((error) => {
      providerPromise = null;
      throw error;
    });
    return providerPromise;
  },
  async disconnect() {
    const provider = await providerPromise?.catch(() => null);
    providerPromise = null;
    if (provider?.connected) await provider.disconnect();
  },
};
