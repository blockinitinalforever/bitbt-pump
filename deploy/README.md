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

The protected production build adds content-derived `?v=` versions to the outer iframe and
every local browser script. Nginx prevents the two HTML entry documents from being stored and
requires fixed-name application scripts to be revalidated, so direct-origin releases do not
depend on a user's browser cache being cleared manually.

`bitbt.fun` currently resolves directly to the HK Nginx origin. If Cloudflare is added in front
of it later, create the root-owned `/etc/bitbt-pump-cdn.env` file with a token restricted to that
zone and Cache Purge permission:

```text
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_API_TOKEN=...
```

After Nginx reload and service health checks, deployment purges only the Pump HTML and browser
bundle URLs. Missing or invalid configured credentials are never reported as a successful CDN
purge; an API failure stops the deploy script before old-release cleanup.
