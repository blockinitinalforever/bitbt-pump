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
export interface PumpAnnouncement {
    id: string;
    title: string;
    title_en: string;
    content: string;
    content_en: string;
    content_zh: string;
    category: string;
    tags: string[];
    pinned: boolean;
    published_at: string;
}
export interface PumpPerpetualConfig {
    enabled: boolean;
    contractAddress?: string;
    chainId: string;
    feePpm: number;
    feePercent: string;
    minLiquidityUsd: string;
    maxLeverage: number;
    statusNote: string;
}
export interface PumpPerpetualMarket {
    marketId: number;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    quoteTokenAddress: string;
    quoteDecimals: number;
    oracleAddress: string;
    liquidityRaw: string;
    lockedNotionalRaw: string;
    totalSharesRaw: string;
    minLiquidityRaw: string;
    maxLeverage: number;
    enabled: boolean;
}
export interface PumpPerpetualPosition {
    marketId: number;
    walletAddress: string;
    collateralRaw: string;
    notionalRaw: string;
    entryPriceE18: string;
    isLong: boolean;
    open: boolean;
    liquiditySharesRaw: string;
}
export interface PumpPreparedTransaction {
    label: string;
    to: string;
    data: string;
    value: string;
    chainId: string;
}
export interface PumpPerpetualPrepareResponse {
    marketId: number;
    action: "deposit_liquidity" | "withdraw_liquidity" | "open_position" | "close_position" | "liquidate";
    transactions: PumpPreparedTransaction[];
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
export type PumpWebhookEvent = "trade.buy" | "trade.sell" | "token.created" | "token.almost_bonded" | "token.migrated" | "tax.dispatched";
export interface PumpClientOptions {
    baseUrl?: string;
    apiKey?: string;
    getSessionToken?: () => string | undefined | Promise<string | undefined>;
    fetch?: typeof globalThis.fetch;
}
type Query = Record<string, string | number | boolean | null | undefined>;
export declare class PumpApiError extends Error {
    readonly status: number;
    readonly payload?: unknown | undefined;
    constructor(message: string, status: number, payload?: unknown | undefined);
}
export declare class BitBTPumpClient {
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly getSessionToken?;
    private readonly fetcher;
    constructor(options?: PumpClientOptions);
    tokens(query?: Query): Promise<PumpToken[]>;
    market(query?: Query): Promise<PumpToken[]>;
    token(address: string): Promise<PumpToken>;
    trades(address: string, query?: Query): Promise<PumpTrade[]>;
    candles(address: string, interval?: number, query?: Query): Promise<unknown[]>;
    migration(address: string): Promise<PumpMigrationProof>;
    buyQuote(query: Query): Promise<PumpQuote>;
    sellQuote(query: Query): Promise<PumpQuote>;
    vaultConfig(): Promise<unknown>;
    keeperQueue(): Promise<unknown>;
    prepareVault(body: Record<string, unknown>): Promise<unknown>;
    vaults(owner: string): Promise<unknown[]>;
    vaultTemplates(): Promise<VaultTemplateResponse>;
    vaultRegistry(): Promise<unknown[]>;
    submitVaultFactory(body: Record<string, unknown>): Promise<unknown>;
    prepareRegisteredVault(body: {
        owner_address: string;
        registry_id: string;
        values: Record<string, unknown>;
    }): Promise<unknown>;
    prepareRegisteredVaultAction(body: {
        owner_address: string;
        registry_id: string;
        vault_address: string;
        action: string;
        values: Record<string, unknown>;
    }): Promise<unknown>;
    prepareStrategy(body: Record<string, unknown>): Promise<unknown>;
    prepareStrategyAction(body: Record<string, unknown>): Promise<unknown>;
    strategies(owner: string): Promise<unknown[]>;
    integrationStatus(): Promise<PumpIntegrationStatus>;
    announcements(): Promise<PumpAnnouncement[]>;
    perpetualConfig(): Promise<PumpPerpetualConfig>;
    perpetualMarkets(): Promise<PumpPerpetualMarket[]>;
    perpetualPosition(wallet: string, marketId: number): Promise<PumpPerpetualPosition>;
    preparePerpetual(body: Record<string, unknown>): Promise<PumpPerpetualPrepareResponse>;
    v3FeeRewards(wallet: string, tokenAddress?: string): Promise<PumpV3FeeReward[]>;
    webhooks(owner: string): Promise<WebhookEndpoint[]>;
    createWebhook(body: {
        owner_address: string;
        endpoint_url: string;
        events: PumpWebhookEvent[];
    }): Promise<{
        webhook: WebhookEndpoint;
        signing_secret: string;
        secret_shown_once: true;
    }>;
    deleteWebhook(owner: string, id: string): Promise<string>;
    private request;
}
export declare function verifyWebhookSignature(secret: string, timestamp: string, rawBody: string, signature: string, crypto: {
    createHmac(algorithm: string, key: string): {
        update(data: string): {
            digest(encoding: "hex"): string;
        };
    };
}, options?: {
    nowSeconds?: number;
    maxAgeSeconds?: number;
}): boolean;
export {};
