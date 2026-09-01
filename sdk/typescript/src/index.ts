export type PumpSide = "buy" | "sell";
export type PumpStage = "creating" | "new" | "trending" | "almost_bonded" | "migrated";

export interface PumpToken {
  token_address: string;
  name?: string;
  token_name?: string;
  symbol: string;
  quote_token: string;
  status: string;
  curve_address?: string;
  progress_percent?: number;
  price?: string;
  submitted_at?: string;
  [key: string]: unknown;
}

export interface PumpTrade {
  tx_hash: string;
  trader: string;
  trade_type?: PumpSide;
  side?: PumpSide;
  quote_token: string;
  quote_amount: string;
  token_amount: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface PumpQuote {
  token_address: string;
  curve_address: string;
  quote_id: string;
  expires_at: number;
  quote_token: string;
  fee_rate_ppm: number;
  route_type: "bonding_curve" | string;
  router_address?: string;
  pair_address?: string;
  dex_kind?: "v2" | "v3";
  execution_target?: string;
  execution_data?: string;
  approval_spender?: string;
  quote_token_address: string;
  chain_id: string;
  min_out: string;
  slippage_bps: number;
  [key: string]: unknown;
}

export interface PumpMigrationProof {
  token_address: string;
  curve_address: string;
  migrated: boolean;
  router_address: string;
  router_verified: boolean;
  factory_address?: string;
  factory_verified: boolean;
  wrapped_native_verified: boolean;
  pair_init_hash_verified: boolean;
  dex_profile: string;
  pair_address?: string;
  lp_receiver_address: string;
  lp_assignment_verified: boolean;
  reserve_verified: boolean;
  position_token_id?: string;
  position_liquidity_raw?: string;
  position_fee_tier?: number;
  v3_trade_adapter?: string;
  v3_trade_adapter_verified: boolean;
  v3_quoter?: string;
  v3_quoter_verified: boolean;
  diagnostic: string;
  [key: string]: unknown;
}

export interface VaultTemplateResponse {
  enabled: boolean;
  factory_address?: string;
  buyback_oracle_address?: string;
  buyback_oracle_ready: boolean;
  chain_id: string;
  registry_version: string;
  templates: Array<Record<string, unknown>>;
}

export interface PumpIntegrationStatus {
  api_version: string;
  chain_id: string;
  database: "operational" | "degraded";
  webhooks: "operational" | "not_configured";
  split_vaults: "operational" | "degraded" | "not_configured";
  strategy_vaults: "operational" | "degraded" | "not_configured";
  events: PumpWebhookEvent[];
  partner_api_keys: number;
  webhook_pending_deliveries: number;
  webhook_dead_letters: number;
  checked_at: string;
}

export interface PumpV3FeeReward {
  id: string;
  token_address: string;
  distributor_address: string;
  position_token_id: string;
  reward_token_address: string;
  onchain_epoch: string;
  amount_raw: string;
  proof: string[];
  snapshot_block: number;
  publish_tx_hash: string;
  claimed: boolean;
  claim_transaction?: {
    to: string;
    data: string;
    value: string;
    chain_id: string;
  };
}

export interface WebhookEndpoint {
  id: string;
  endpoint_url: string;
  events: PumpWebhookEvent[];
  active: boolean;
  failure_count: number;
  last_delivery_at?: string;
  last_status?: number;
  created_at: string;
}

export type PumpWebhookEvent =
  | "trade.buy"
  | "trade.sell"
  | "token.created"
  | "token.almost_bonded"
  | "token.migrated"
  | "tax.dispatched";

export interface PumpClientOptions {
  baseUrl?: string;
  apiKey?: string;
  getSessionToken?: () => string | undefined | Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export class PumpApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "PumpApiError";
  }
}

export class BitBTPumpClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly getSessionToken?: PumpClientOptions["getSessionToken"];
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: PumpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://bitbt.fun/api/pump").replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.getSessionToken = options.getSessionToken;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  tokens(query: Query = {}) { return this.request<PumpToken[]>("/v1/pump/tokens", { query }); }
  market(query: Query = {}) { return this.request<PumpToken[]>("/v1/pump/market", { query }); }
  token(address: string) { return this.request<PumpToken>("/v1/pump/detail", { query: { address } }); }
  trades(address: string, query: Query = {}) { return this.request<PumpTrade[]>("/v1/pump/trades", { query: { ...query, token_address: address } }); }
  candles(address: string, interval = 60, query: Query = {}) { return this.request<unknown[]>("/v1/pump/candles", { query: { ...query, token_address: address, interval } }); }
  migration(address: string) { return this.request<PumpMigrationProof>("/v1/pump/migration-proof", { query: { token_address: address } }); }
  buyQuote(query: Query) { return this.request<PumpQuote>("/v1/pump/buy-quote", { query }); }
  sellQuote(query: Query) { return this.request<PumpQuote>("/v1/pump/sell-quote", { query }); }
  vaultConfig() { return this.request<unknown>("/v1/pump/vaults/config"); }
  keeperQueue() { return this.request<unknown>("/v1/pump/vaults/keeper/queue"); }
  prepareVault(body: Record<string, unknown>) { return this.request<unknown>("/v1/pump/vaults/prepare", { method: "POST", body, session: true }); }
  vaults(owner: string) { return this.request<unknown[]>("/v1/pump/vaults", { query: { creator_address: owner }, session: true }); }
  vaultTemplates() { return this.request<VaultTemplateResponse>("/v1/pump/vault-store/templates"); }
  vaultRegistry() { return this.request<unknown[]>("/v1/pump/vault-store/registry"); }
  submitVaultFactory(body: Record<string, unknown>) { return this.request<unknown>("/v1/pump/vault-store/registry", { method: "POST", body, session: true }); }
  prepareRegisteredVault(body: { owner_address: string; registry_id: string; values: Record<string, unknown> }) { return this.request<unknown>("/v1/pump/vault-store/prepare", { method: "POST", body, session: true }); }
  prepareRegisteredVaultAction(body: { owner_address: string; registry_id: string; vault_address: string; action: string; values: Record<string, unknown> }) { return this.request<unknown>("/v1/pump/vault-store/action/prepare", { method: "POST", body, session: true }); }
  prepareStrategy(body: Record<string, unknown>) { return this.request<unknown>("/v1/pump/strategies/prepare", { method: "POST", body, session: true }); }
  prepareStrategyAction(body: Record<string, unknown>) { return this.request<unknown>("/v1/pump/strategies/action/prepare", { method: "POST", body, session: true }); }
  strategies(owner: string) { return this.request<unknown[]>("/v1/pump/strategies", { query: { creator_address: owner }, session: true }); }
  integrationStatus() { return this.request<PumpIntegrationStatus>("/v1/pump/integrations/status"); }
  v3FeeRewards(wallet: string, tokenAddress?: string) { return this.request<PumpV3FeeReward[]>("/v1/pump/v3-fee-rewards", { query: { wallet_address: wallet, token_address: tokenAddress }, session: true }); }
  webhooks(owner: string) { return this.request<WebhookEndpoint[]>("/v1/pump/integrations/webhooks", { query: { owner_address: owner }, session: true }); }
  createWebhook(body: { owner_address: string; endpoint_url: string; events: PumpWebhookEvent[] }) { return this.request<{ webhook: WebhookEndpoint; signing_secret: string; secret_shown_once: true }>("/v1/pump/integrations/webhooks", { method: "POST", body, session: true }); }
  deleteWebhook(owner: string, id: string) { return this.request<string>("/v1/pump/integrations/webhooks", { method: "DELETE", body: { owner_address: owner, id }, session: true }); }

  private async request<T>(path: string, options: { method?: string; query?: Query; body?: unknown; session?: boolean } = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.session) {
      const token = await this.getSessionToken?.();
      if (!token) throw new PumpApiError("A SIWE session is required", 401);
      headers.authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }
    const response = await this.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => undefined) as { success?: boolean; data?: T; error?: string } | undefined;
    if (!response.ok || !payload?.success) {
      throw new PumpApiError(payload?.error ?? `Pump API returned HTTP ${response.status}`, response.status, payload);
    }
    return payload.data as T;
  }
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  crypto: { createHmac(algorithm: string, key: string): { update(data: string): { digest(encoding: "hex"): string } } },
  options: { nowSeconds?: number; maxAgeSeconds?: number } = {},
): boolean {
  const timestampSeconds = Number(timestamp);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  if (!Number.isSafeInteger(timestampSeconds) || maxAgeSeconds <= 0 || Math.abs(nowSeconds - timestampSeconds) > maxAgeSeconds) return false;
  const expected = `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < signature.length; index += 1) mismatch |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0;
}
