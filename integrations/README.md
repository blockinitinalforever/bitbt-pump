# BitBT Pump partner integrations

- `telegram-bot/` is a deployable, read-only bot example using the public Pump API, including official announcements. It never accepts a seed phrase or private key. Set `BITBT_PUMP_API_KEY` when calling the direct partner API origin; the Website proxy does not require this server credential from the bot.
- `vault-keeper/` polls the bounded Split Vault keeper queue and submits only `claimForAtLeast(recipient, threshold)` transactions after binding BSC, selector, Vault, recipient, threshold and zero native value. Funds always go to immutable recipients. Run it as a separate low-balance service account with `BITBT_PUMP_API_URL`, `BITBT_PUMP_API_KEY`, `RPC_BSC`, and `PUMP_VAULT_KEEPER_PRIVATE_KEY`; never reuse the Factory deployer key.
- Transactional terminals should use `sdk/typescript`, obtain a user SIWE session, request a bound 30-second quote, show the complete transaction to the wallet and let the wallet sign/broadcast it.
- Webhook endpoints are wallet-owned and require API Key + SIWE to create. Production endpoints must be HTTPS and their exact hostname must be approved by BitBT.
- Verify each delivery with the one-time signing secret, `x-bitbt-timestamp`, `x-bitbt-signature`, and the unmodified request body. Reject stale timestamps and duplicate payload IDs.

Supported events: `token.created`, `trade.buy`, `trade.sell`, `token.almost_bonded`, `token.migrated`, `tax.dispatched`.
