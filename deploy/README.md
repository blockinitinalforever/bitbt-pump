# BitBT.fun Pump Web deployment

Build the standalone Next.js output with the production SIWE domain baked into the client:

```sh
NEXT_PUBLIC_PUMP_SIWE_DOMAIN=bitbt.fun \
BITBT_PUMP_API_URL=https://appbackend.bitbt.com \
npm run build
```

WalletConnect uses the public Reown/WalletConnect project ID already exposed by the independent
BitBT API capability endpoint. A server-local override may be stored in
`/etc/bitbt-pump-web.env` as `WALLETCONNECT_PROJECT_ID=...`. Allow `https://bitbt.fun` in the
selected project's origin allowlist. The ID is intentionally returned to the browser by the
same-origin `/api/pump/wallet-config` endpoint; private RPC/API credentials must never be put in
this environment variable.

Upload `.next/standalone/`, `.next/static/`, and `public/` to the release directory. The
systemd unit expects the standalone entrypoint at `current/server.js` and fails fast if it
is missing. The Nginx TLS configuration assumes the Let's Encrypt certificate for
`bitbt.fun` (covering `www.bitbt.fun`) has already been issued. `bitbt.fun` is the
canonical origin; both HTTP and `www` HTTPS redirect to it before the Pump app is served.

Production deploys run directly on the HK server from the Git `main` branch:

```sh
cd /opt/bitbt-pump-source/repo
bash deploy/deploy-server.sh
```

The script builds on the server, atomically switches `/opt/bitbt-pump-web/current`, verifies
the local page and public Token API, and only then removes old release directories. It keeps
the newest five releases by default; set `PUMP_KEEP_RELEASES` to a larger positive number when
additional rollback history is required.
