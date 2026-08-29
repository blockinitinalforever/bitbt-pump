import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BitBT Pump",
    short_name: "BitBT Pump",
    description: "BitBT Pump on-chain launch and trading terminal",
    start_url: "/pump",
    display: "standalone",
    background_color: "#08090a",
    theme_color: "#08090a",
    icons: [
      {
        src: "/launchpad/assets/app-icons/pwa/bitbt-192.png?v=20260829-3",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/launchpad/assets/app-icons/pwa/bitbt-512.png?v=20260829-3",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/launchpad/assets/app-icons/pwa/bitbt-maskable-512.png?v=20260829-3",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
