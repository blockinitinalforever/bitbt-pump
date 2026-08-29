import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

export const metadata: Metadata = {
  title: "BitBT Pump",
  description:
    "Building Long-Term Value for the Next Generation of AI & Web3 Innovation",
  icons: {
    icon: [
      { url: "/launchpad/assets/app-icons/pwa/bitbt-32.png?v=20260829-3", type: "image/png", sizes: "32x32" },
      { url: "/launchpad/assets/app-icons/pwa/bitbt-16.png?v=20260829-3", type: "image/png", sizes: "16x16" },
      { url: "/icon.svg?v=20260829-3", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico?v=20260829-3",
    apple: "/launchpad/assets/app-icons/pwa/bitbt-180.png?v=20260829-3",
  },
  manifest: "/manifest.webmanifest?v=20260829-3",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
