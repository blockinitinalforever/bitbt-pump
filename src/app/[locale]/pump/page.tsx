import { useLocale } from "next-intl";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PumpWalletConnect from "@/components/PumpWalletConnect";
import PumpLiveBoard from "@/components/PumpLiveBoard";
import PumpLaunchForm from "@/components/PumpLaunchForm";

export default function PumpPage() {
  const locale = useLocale();
  const zh = locale === "zh";
  const steps = zh
    ? [["01", "连接钱包", "使用 EIP-4361 验证钱包身份，私钥始终留在你的钱包中。"], ["02", "发现项目", "按阶段浏览 Pump 项目，查看真实详情和交易记录。"], ["03", "确认每一步", "报价、授权、网络费用和交易内容在签名之前清晰展示。"]]
    : [["01", "Connect wallet", "Verify your wallet with EIP-4361 while your keys stay in your wallet."], ["02", "Discover projects", "Browse Pump projects by stage with live details and trade records."], ["03", "Confirm every step", "Quotes, authorization, network fees and transaction details are shown before signing."]];

  return (
    <div className="min-h-screen bg-[#f5f4f2] text-[#1a1a1a]">
      <Header />
      <main className="px-5 pb-20 pt-32 sm:px-8 lg:px-12">
        <section className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#101210] px-6 py-16 text-white sm:px-12 sm:py-24 lg:px-20">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d9ff46]">BitBT PUMP</p>
            <h1 className="mt-7 text-4xl font-semibold leading-[.98] tracking-[-0.07em] sm:text-7xl lg:text-8xl">
              {zh ? "让每一个想法，都有机会登上链上市场。" : "Give every idea a path to the on-chain market."}
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
              {zh ? "PUMP 是 BitBT 的非托管交易市场：发现项目、获取报价并在 BNB Chain 上完成买卖，都由真实钱包和链上交易驱动。" : "PUMP is BitBT's non-custodial trading market for project discovery, live quotes and BNB Chain buy/sell transactions powered by your real wallet."}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <PumpWalletConnect />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#777]">{zh ? "如何开始" : "How it works"}</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">{zh ? "清晰、可验证、由钱包确认。" : "Clear, verifiable, wallet-approved."}</h2>
            </div>
            <div className="divide-y divide-black/10 border-y border-black/10">
              {steps.map(([number, title, body]) => <div key={number} className="grid gap-4 py-7 sm:grid-cols-[64px_180px_1fr] sm:items-start"><span className="text-sm font-semibold text-[#a0a0a0]">{number}</span><h3 className="text-lg font-semibold">{title}</h3><p className="max-w-md text-sm leading-6 text-[#666]">{body}</p></div>)}
            </div>
          </div>
        </section>

        <div id="live-market"><PumpLiveBoard zh={zh} /></div>
        <PumpLaunchForm zh={zh} />

        <section className="mx-auto max-w-7xl rounded-[2rem] bg-[#d9ff46] px-6 py-12 sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between lg:px-16">
          <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/55">{zh ? "进入真实产品" : "Enter the product"}</p><h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">{zh ? "准备好交易下一个项目了吗？" : "Ready to trade the next project?"}</h2></div>
          <a href="#live-market" className="mt-8 inline-flex shrink-0 rounded-full bg-[#101210] px-7 py-4 text-sm font-semibold text-white transition hover:bg-black lg:mt-0">{zh ? "进入实时交易" : "Open live market"}</a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
