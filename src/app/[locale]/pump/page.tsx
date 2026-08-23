import type { Metadata } from "next";
import { useLocale } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import PumpWalletConnect from "@/components/PumpWalletConnect";
import PumpLiveBoard from "@/components/PumpLiveBoard";

export const metadata: Metadata = {
  title: "BitBT PUMP — On-chain project terminal",
  description: "Non-custodial BNB Chain Pump trading with live quotes, charts and transaction receipts.",
};

export default function PumpPage() {
  const locale = useLocale();
  const zh = locale === "zh";

  return (
    <div className="pump-terminal min-h-screen bg-[#f5f4f2] text-[#1a1a1a]">
      <div className="pump-terminal__notice">{zh ? "实时数据 — 已连接 Pump API" : "LIVE DATA — CONNECTED TO THE PUMP API"}</div>
      <header className="pump-terminal__header">
        <Link href={`/${locale}/pump`} className="flex items-center gap-2" aria-label="BitBT Pump home">
          <Image src="/icon.svg" alt="BitBT" width={28} height={28} className="rounded-lg" />
          <span className="text-base font-bold tracking-[0.2em]">BITBT</span>
          <span className="rounded bg-[#d9ff46] px-2 py-1 text-xs font-bold tracking-[0.16em]">PUMP</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/${locale === "en" ? "zh" : "en"}/pump`} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium">
            {locale === "en" ? "中文" : "EN"}
          </Link>
          <PumpWalletConnect compact />
        </div>
      </header>
      <main className="pump-terminal__main">
        <section className="pump-terminal__titlebar">
          <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#777]">BitBT PUMP</p><h1>{zh ? "链上项目交易终端" : "On-chain project terminal"}</h1><p>{zh ? "BNB Chain · bitbt.fun · 非托管实时交易" : "BNB Chain · bitbt.fun · non-custodial live trading"}</p></div>
          <span className="hidden text-right text-xs text-[#777] sm:block">{zh ? "真实钱包 · 实时报价 · 链上回执" : "REAL WALLET · LIVE QUOTES · ON-CHAIN RECEIPTS"}</span>
        </section>
        <PumpLiveBoard zh={zh} />
      </main>
    </div>
  );
}
