export type PumpApiResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("bitbt_pump_session")
      : null;
  const response = await fetch(`/api/pump/${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json()) as PumpApiResponse<T>;
  if (!response.ok || payload.data === undefined)
    throw new Error(
      payload.error ||
        payload.message ||
        `Pump API request failed (${response.status})`,
    );
  return payload.data;
}

export type PumpToken = {
  id: string;
  token_name: string;
  symbol: string;
  creator_address: string;
  contract_address: string | null;
  chain_id: string;
  quote_token: string;
  status: string;
  submitted_at?: string;
  logo_url?: string | null;
  classification?: string | null;
  progress_percent: number;
  current_price_quote?: string;
  total_raised_quote?: string;
  current_price_bnb?: string;
  total_raised_bnb?: string;
  tax_enabled?: boolean;
  buy_tax_percent?: number | null;
  sell_tax_percent?: number | null;
};

export type PumpDetail = {
  id: string;
  token_name: string;
  symbol: string;
  contract_address: string | null;
  curve_address: string;
  quote_token: string;
  quote_token_address?: string | null;
  status?: string;
  submitted_at?: string;
  logo_url?: string | null;
  classification?: string | null;
  description?: string | null;
  website?: string | null;
  telegram?: string | null;
  twitter?: string | null;
  discord?: string | null;
  current_price_bnb: string;
  current_price_quote?: string;
  tokens_sold: string;
  total_raised_bnb: string;
  total_raised_quote?: string;
  progress_percent: number;
  migrated: boolean;
  tax_enabled?: boolean;
  buy_tax_percent?: number | null;
  sell_tax_percent?: number | null;
};

export type PumpQuote = {
  token_address?: string;
  tokens_out?: string;
  quote_out?: string;
  bnb_out?: string;
  quote_token: string;
  quote_token_address?: string;
  fee_quote?: string;
  fee_bnb?: string;
  curve_address: string;
  price_impact_percent?: string | null;
};

export type PumpTrade = {
  tx_hash: string;
  trader: string;
  trade_type: string;
  quote_token?: string;
  quote_amount?: string;
  bnb_amount: string;
  token_amount: string;
  timestamp: number;
};

export const pumpApi = {
  tokens: () => request<PumpToken[]>("v1/pump/tokens"),
  detail: (address: string) =>
    request<PumpDetail>(
      `v1/pump/detail?address=${encodeURIComponent(address)}`,
    ),
  details: () => request<PumpDetail[]>("v1/pump/details"),
  buyQuote: (address: string, amount: string) =>
    request<PumpQuote>(
      `v1/pump/buy-quote?token_address=${encodeURIComponent(address)}&quote_amount=${encodeURIComponent(amount)}`,
    ),
  sellQuote: (address: string, amount: string) =>
    request<PumpQuote>(
      `v1/pump/sell-quote?token_address=${encodeURIComponent(address)}&token_amount=${encodeURIComponent(amount)}`,
    ),
  trades: (address: string) =>
    request<PumpTrade[]>(
      `v1/pump/trades?token_address=${encodeURIComponent(address)}`,
    ),
  reportTransaction: (data: PumpTransactionReport) =>
    request<unknown>("v1/wallet/tx/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
};

export type PumpTransactionReport = {
  user_address: string;
  tx_hash: string;
  chain_id: "bsc";
  tx_type: "approve" | "pump_buy" | "pump_sell";
  from_token?: string;
  to_token?: string;
  from_amount?: string;
  to_amount?: string;
  status: "pending" | "success" | "failed";
  metadata?: Record<string, unknown>;
};

export type LaunchFeeInfo = {
  amount_bnb: number;
  fee_wei: string;
  receive_address: string;
  factory_address: string;
  chain_id: string;
  gas_reserve_bnb: number;
};

export type PreparedLaunch = {
  launch: {
    id: string;
    token_name: string;
    symbol: string;
    creator_address: string;
    quote_token: string;
    status: string;
  };
  amount_bnb: number;
  fee_wei: string;
  factory_address: string;
  fee_recipient: string;
  chain_id: string;
  salt: string;
  predicted_token_address: string;
  curve_address: string;
  migration_threshold_wei: string;
  quote_token_address: string;
  method: string;
};

export type PumpQuoteToken = "BNB" | "USDT" | "USDC" | "USD1" | "GW";
export type PumpLaunchQuoteToken = Exclude<PumpQuoteToken, "GW">;

export type PrepareLaunchInput = {
  creator_address: string;
  token_name: string;
  symbol: string;
  total_supply: string;
  decimals: number;
  mintable: boolean;
  burnable: boolean;
  chain_id: "bsc";
  // GW remains readable/tradable for existing launches, but is intentionally
  // unavailable for new launches after its product entry was retired.
  quote_token: PumpLaunchQuoteToken;
  description?: string;
  website?: string;
  telegram?: string;
  twitter?: string;
  discord?: string;
  memo?: string;
  classification?: string;
  logo_url?: string;
};

export type ConfirmedLaunch = {
  id: string;
  token_name: string;
  symbol: string;
  status: string;
  contract_address?: string | null;
  rejection_reason?: string | null;
};

export const pumpLaunchApi = {
  fee: () => request<LaunchFeeInfo>("v1/token/launch-fee"),
  uploadImage: async (file: File) => {
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Unable to read logo file"));
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Invalid logo file"));
      reader.readAsDataURL(file);
    });
    return request<{ url: string }>("v1/upload/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, filename: file.name }),
    });
  },
  prepare: (body: PrepareLaunchInput) =>
    request<PreparedLaunch>("v1/token/prepare-launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  confirm: (body: { launch_id: string; deploy_tx_hash: string }) =>
    request<ConfirmedLaunch>("v1/token/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
};
