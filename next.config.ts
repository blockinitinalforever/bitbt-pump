import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/favicon.ico", destination: "/launchpad/assets/app-icons/pwa/bitbt-32.png" },
        { source: "/pump/:address", destination: "/launchpad/bitbt-wallet-ui.html" },
        { source: "/pump", destination: "/launchpad/bitbt-wallet-ui.html" },
        { source: "/:locale(en|zh)/pump/:address", destination: "/launchpad/bitbt-wallet-ui.html" },
        { source: "/:locale(en|zh)/pump", destination: "/launchpad/bitbt-wallet-ui.html" },
        { source: "/:locale/bitbt-launch-ui-app.html", destination: "/launchpad/bitbt-launch-ui-app.html" },
        { source: "/:locale/launch-logo-upload.js", destination: "/launchpad/launch-logo-upload.js" },
        { source: "/:locale/launchpad-live.js", destination: "/launchpad/launchpad-live.js" },
        { source: "/:locale/assets/:path*", destination: "/launchpad/assets/:path*" },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
