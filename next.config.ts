import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:locale/pump", destination: "/launchpad/bitbt-wallet-ui.html" },
        { source: "/:locale/bitbt-launch-ui-app.html", destination: "/launchpad/bitbt-launch-ui-app.html" },
        { source: "/:locale/launchpad-live.js", destination: "/launchpad/launchpad-live.js" },
        { source: "/:locale/assets/:path*", destination: "/launchpad/assets/:path*" },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
