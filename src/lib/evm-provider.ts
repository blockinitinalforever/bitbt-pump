export type EvmProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  providers?: EvmProvider[];
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isBinance?: boolean;
  isBinanceWallet?: boolean;
  isTokenPocket?: boolean;
  isMetaMask?: boolean;
};

type ProviderWindow = Window & {
  ethereum?: EvmProvider;
  okxwallet?: EvmProvider | { ethereum?: EvmProvider };
  BinanceChain?: EvmProvider;
  binancew3w?: EvmProvider | { ethereum?: EvmProvider };
  tokenpocket?: { ethereum?: EvmProvider };
};

const isProvider = (value: unknown): value is EvmProvider =>
  Boolean(value && typeof (value as EvmProvider).request === "function");

const score = (provider: EvmProvider) => {
  if (provider.isOkxWallet || provider.isOKExWallet) return 500;
  if (provider.isBinance || provider.isBinanceWallet) return 400;
  if (provider.isTokenPocket) return 300;
  if (provider.isMetaMask) return 200;
  return 100;
};

export function getInjectedEvmProvider(): EvmProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const injected = window as ProviderWindow;
  const okx = injected.okxwallet;
  const binanceWeb3 = injected.binancew3w;
  const candidates = [
    isProvider(okx) ? okx : okx?.ethereum,
    injected.BinanceChain,
    isProvider(binanceWeb3) ? binanceWeb3 : binanceWeb3?.ethereum,
    injected.tokenpocket?.ethereum,
    ...(injected.ethereum?.providers || []),
    injected.ethereum,
  ].filter(isProvider);
  return [...new Set(candidates)].sort((a, b) => score(b) - score(a))[0];
}
