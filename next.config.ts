import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:locale/pump", destination: "/launchpad/bitbt-wallet-ui.html" },
        { source: "/:locale/bitbt-launch-ui-app.html", destination: "/launchpad/bitbt-launch-ui-app.html" },
        { source: "/:locale/launch-logo-upload.js", destination: "/launchpad/launch-logo-upload.js" },
        { source: "/:locale/launchpad-live.js", destination: "/launchpad/launchpad-live.js" },
        { source: "/:locale/assets/:path*", destination: "/launchpad/assets/:path*" },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
