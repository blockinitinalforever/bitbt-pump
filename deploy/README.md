# BitBT.fun Pump Web deployment

Build the standalone Next.js output with the production SIWE domain baked into the client:

```sh
NEXT_PUBLIC_PUMP_SIWE_DOMAIN=bitbt.fun \
BITBT_PUMP_API_URL=https://appbackend.bitbt.com \
npm run build
```

Upload `.next/standalone/`, `.next/static/`, and `public/` to the release directory. The
systemd unit expects the standalone entrypoint at `current/server.js` and fails fast if it
is missing. The Nginx TLS configuration assumes the Let's Encrypt certificate for
`bitbt.fun` (covering `www.bitbt.fun`) has already been issued. `bitbt.fun` is the
canonical origin; both HTTP and `www` HTTPS redirect to it before the Pump app is served.
