export class PumpApiError extends Error {
    status;
    payload;
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
        this.name = "PumpApiError";
    }
}
export class BitBTPumpClient {
    baseUrl;
    apiKey;
    getSessionToken;
    fetcher;
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl ?? "https://bitbt.fun/api/pump").replace(/\/$/, "");
        this.apiKey = options.apiKey;
        this.getSessionToken = options.getSessionToken;
        this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    }
    tokens(query = {}) { return this.request("/v1/pump/tokens", { query }); }
    market(query = {}) { return this.request("/v1/pump/market", { query }); }
    token(address) { return this.request("/v1/pump/detail", { query: { address } }); }
    trades(address, query = {}) { return this.request("/v1/pump/trades", { query: { ...query, token_address: address } }); }
    candles(address, interval = 60, query = {}) { return this.request("/v1/pump/candles", { query: { ...query, token_address: address, interval } }); }
    migration(address) { return this.request("/v1/pump/migration-proof", { query: { token_address: address } }); }
    buyQuote(query) { return this.request("/v1/pump/buy-quote", { query }); }
    sellQuote(query) { return this.request("/v1/pump/sell-quote", { query }); }
    vaultConfig() { return this.request("/v1/pump/vaults/config"); }
    keeperQueue() { return this.request("/v1/pump/vaults/keeper/queue"); }
    prepareVault(body) { return this.request("/v1/pump/vaults/prepare", { method: "POST", body, session: true }); }
    vaults(owner) { return this.request("/v1/pump/vaults", { query: { creator_address: owner }, session: true }); }
    vaultTemplates() { return this.request("/v1/pump/vault-store/templates"); }
    vaultRegistry() { return this.request("/v1/pump/vault-store/registry"); }
    submitVaultFactory(body) { return this.request("/v1/pump/vault-store/registry", { method: "POST", body, session: true }); }
    prepareRegisteredVault(body) { return this.request("/v1/pump/vault-store/prepare", { method: "POST", body, session: true }); }
    prepareRegisteredVaultAction(body) { return this.request("/v1/pump/vault-store/action/prepare", { method: "POST", body, session: true }); }
    prepareStrategy(body) { return this.request("/v1/pump/strategies/prepare", { method: "POST", body, session: true }); }
    prepareStrategyAction(body) { return this.request("/v1/pump/strategies/action/prepare", { method: "POST", body, session: true }); }
    strategies(owner) { return this.request("/v1/pump/strategies", { query: { creator_address: owner }, session: true }); }
    integrationStatus() { return this.request("/v1/pump/integrations/status"); }
    v3FeeRewards(wallet, tokenAddress) { return this.request("/v1/pump/v3-fee-rewards", { query: { wallet_address: wallet, token_address: tokenAddress }, session: true }); }
    webhooks(owner) { return this.request("/v1/pump/integrations/webhooks", { query: { owner_address: owner }, session: true }); }
    createWebhook(body) { return this.request("/v1/pump/integrations/webhooks", { method: "POST", body, session: true }); }
    deleteWebhook(owner, id) { return this.request("/v1/pump/integrations/webhooks", { method: "DELETE", body: { owner_address: owner, id }, session: true }); }
    async request(path, options = {}) {
        const url = new URL(`${this.baseUrl}${path}`);
        for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value !== undefined && value !== null)
                url.searchParams.set(key, String(value));
        }
        const headers = { accept: "application/json" };
        if (this.apiKey)
            headers["x-api-key"] = this.apiKey;
        if (options.body !== undefined)
            headers["content-type"] = "application/json";
        if (options.session) {
            const token = await this.getSessionToken?.();
            if (!token)
                throw new PumpApiError("A SIWE session is required", 401);
            headers.authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
        }
        const response = await this.fetcher(url, {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
        const payload = await response.json().catch(() => undefined);
        if (!response.ok || !payload?.success) {
            throw new PumpApiError(payload?.error ?? `Pump API returned HTTP ${response.status}`, response.status, payload);
        }
        return payload.data;
    }
}
export function verifyWebhookSignature(secret, timestamp, rawBody, signature, crypto, options = {}) {
    const timestampSeconds = Number(timestamp);
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const maxAgeSeconds = options.maxAgeSeconds ?? 300;
    if (!Number.isSafeInteger(timestampSeconds) || maxAgeSeconds <= 0 || Math.abs(nowSeconds - timestampSeconds) > maxAgeSeconds)
        return false;
    const expected = `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
    if (signature.length !== expected.length)
        return false;
    let mismatch = 0;
    for (let index = 0; index < signature.length; index += 1)
        mismatch |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
    return mismatch === 0;
}
