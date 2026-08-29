export type EvmProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type ProviderWindow = Window & {
  ethereum?: EvmProvider;
};

const isProvider = (value: unknown): value is EvmProvider =>
  Boolean(value && typeof (value as EvmProvider).request === "function");

export function getInjectedEvmProvider(): EvmProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = (window as ProviderWindow).ethereum;
  return isProvider(provider) ? provider : undefined;
}
