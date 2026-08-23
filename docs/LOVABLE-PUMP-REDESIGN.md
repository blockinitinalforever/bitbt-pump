# Lovable Prompt — BitBT PUMP redesign

Import the BitBT website repository and redesign only the Pump product UI.

Repository: `blockinitinalforever/bitbt-website`
Use the latest Pump wallet-sync branch if available: `fix/pump-wallet-sync`.

## Product direction

Build a focused, premium BNB Chain launchpad/trading terminal inspired by the information density of Flap's board, without copying its branding, assets, or exact layout.

BitBT PUMP is a standalone product. The page must not show About, Services, Investment, Partners, Team, Contact, or the old `app.bitbt.com/launcher` route.

## Visual direction

- Editorial terminal aesthetic: warm off-white background, near-black panels, BitBT lime accent.
- Use clear hierarchy, compact market rows, strong spacing, restrained borders, and responsive mobile behavior.
- Use the existing official `/icon.svg` asset. Do not use Gwallet branding.
- Suggested colors: `#f5f4f2`, `#101210`, `#d9ff46`, `#666666`, `#ffffff`.
- Keep typography readable on mobile; no oversized hero that pushes the market below the fold.

## Required layout

1. Minimal top bar: BitBT PUMP logo, language switch, wallet connection status.
2. Compact product header with Connect Wallet and Launch Token actions.
3. Market board with tabs: All, Trending, Creating, New, Almost Bonded, Migrated.
4. Search and quote-token filter.
5. Dense token rows showing token identity, status, symbol, quote token, progress, price/raised data when available.
6. Selected-token detail panel with real OHLC K-line, price, raised amount, sold amount, recent trades, Buy/Sell controls, quote, slippage, priority fee, balances, and transaction state.
7. Mobile layout must stack the board and detail panel without horizontal scrolling.

## Do not change

- Do not change API routes or response contracts.
- Do not replace real wallet signing with mock behavior.
- Do not remove BNB Chain switching, SIWE, quote binding, ERC20 approval, broadcast, receipt polling, failure reporting, or WSS-backed trade history.
- Do not fabricate market cap, volume, price change, recommendation, or K-line data. Render only fields supplied by the API; show `—` when unavailable.
- Keep `https://bitbt.fun` as the canonical Pump URL.
- Keep the shared wallet state behavior in `PumpWalletConnect`.

## Acceptance checks

- `/en` and `/zh` redirect to `/en/pump` and `/zh/pump`.
- No visible legacy navigation or `app.bitbt.com/launcher` link.
- Two wallet buttons always show the same connected account.
- Switching wallet accounts clears the old SIWE session and requires re-authentication.
- K-line uses real `/v1/pump/trades` data and refreshes with the existing WSS-backed API flow.
- `npm run lint`, `npm run build`, and `npm test` pass.
- Verify desktop widths 1440/1280/1024 and mobile widths 390/430/768.
