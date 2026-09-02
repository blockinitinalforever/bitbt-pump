# BitBT Pump developer integrations

Production browser traffic uses `https://bitbt.fun/api/pump/`. Partner server integrations should use the API origin supplied by BitBT operations. Private RPC URLs and the internal API key must never be shipped to a browser or bot package.

## TypeScript SDK

The package source is in `sdk/typescript`. It provides typed market, detail, quote, trade, candle and migration-proof reads. Wallet signing and transaction broadcast remain in the caller's wallet.

## Telegram bot

The read-only bot is in `integrations/telegram-bot`. Configure its documented environment variables and use a restricted API client. It never accepts seed phrases or private keys.

## Webhooks

Create and delete subscriptions in **My → SDK, Webhook & Bot** after SIWE verification. The endpoint must be HTTPS and its exact hostname must be approved through `PUMP_WEBHOOK_ALLOWED_DOMAINS`.

Events:

- `token.created`
- `trade.buy`
- `trade.sell`
- `token.almost_bonded`
- `token.migrated`
- `tax.dispatched`

Each request includes `X-BitBT-Event`, `X-BitBT-Delivery`, `X-BitBT-Timestamp`, and `X-BitBT-Signature`. Verify `X-BitBT-Signature` as lowercase hexadecimal HMAC-SHA256 over `<timestamp>.<raw-request-body>`, reject timestamps outside the five-minute window, and deduplicate by delivery ID. Delivery does not follow HTTP redirects. The signing secret is displayed once when the endpoint is created.

Deliveries are persisted before HTTP transmission and retried up to eight times with bounded exponential backoff. A canonical chain event is idempotent per endpoint, including after WSS replay or an API restart. The public integration status reports pending deliveries and exhausted dead letters; partners should still return a 2xx response only after their own durable acceptance.

Operators can release one exhausted delivery, or all exhausted deliveries for one endpoint, through `POST /api/v1/admin/pump/integrations/webhooks/replay` using the admin API key. The request must contain exactly one of `delivery_id` or `endpoint_id`. Replay keeps the original delivery row and id, re-enables the endpoint when selected by endpoint, and therefore preserves signing and audit continuity without creating duplicate outbox records.

Each terminal or bot must receive its own server-side API key. Configure API keys on the API host with `PUMP_PARTNER_API_KEYS_JSON` (never in browser JavaScript), for example an array of `{ "id", "key", "requests_per_minute" }`. Keys shorter than 32 characters, duplicate IDs, and limits outside 1–10,000 requests/minute are rejected. Partner keys cannot pass administrator authentication; every wallet-private action still requires the matching SIWE session.
