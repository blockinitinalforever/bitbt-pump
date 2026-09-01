# @bitbt/pump-sdk

Typed, non-custodial access to BitBT Pump market data, quotes, Vaults and signed webhooks.

The SDK never accepts or stores private keys. Transaction preparation responses must be shown to the user and signed by their wallet. Private wallet endpoints require the existing SIWE bearer session.

```ts
import { BitBTPumpClient } from "@bitbt/pump-sdk";

const pump = new BitBTPumpClient();
const tokens = await pump.tokens();
const trades = await pump.trades(tokens[0].token_address);
```

Partner webhooks require a server-side API key and SIWE session. Store the signing secret returned at creation; it is shown once. Verify `x-bitbt-timestamp` and `x-bitbt-signature` against the unmodified request body before processing an event.
