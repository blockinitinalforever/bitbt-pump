import { useLocale } from "next-intl";

const PUMP_URL = "https://bitbt.fun";

export default function PumpSection() {
  const locale = useLocale();
  const zh = locale === "zh";

  return (
    <section id="pump" className="relative overflow-hidden bg-[#101210] px-5 py-20 text-white sm:px-8 sm:py-28 lg:px-12">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#d9ff46]/15 blur-3xl" />
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-20">
        <div>
          <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#d9ff46]">
            <span className="h-px w-8 bg-[#d9ff46]" />
            {zh ? "BitBT PUMP" : "BitBT PUMP"}
          </div>
          <h2 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
            {zh ? "发现项目、获取报价并完成链上交易。" : "Discover projects, get a quote and trade on-chain."}
          </h2>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
            {zh
              ? "BitBT PUMP 提供社区发现、实时报价和非托管买卖体验。所有签名仍由你的钱包确认。"
              : "BitBT PUMP provides community discovery, live quotes and non-custodial buy/sell trading. Every signature remains under your control."}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={PUMP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full bg-[#d9ff46] px-6 py-3.5 text-sm font-semibold text-[#101210] transition hover:bg-white">
              {zh ? "进入 PUMP" : "Enter PUMP"} <span aria-hidden className="ml-2">↗</span>
            </a>
          </div>
        </div>

        <div className="relative rounded-[2rem] border border-white/15 bg-white/[0.06] p-4 shadow-2xl sm:p-6">
          <div className="rounded-[1.5rem] border border-white/10 bg-[#191c19] p-5 sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <span className="text-sm font-semibold tracking-wide">PUMP</span>
              <span className="rounded-full bg-[#d9ff46]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d9ff46]">{zh ? "链上交易" : "On-chain trading"}</span>
            </div>
            <div className="grid gap-3 pt-5 sm:grid-cols-2">
              {[
                [zh ? "项目发现" : "Project discovery", zh ? "按阶段浏览市场" : "Browse the market by stage"],
                [zh ? "发现新项目" : "Discover projects", zh ? "按阶段浏览市场" : "Browse by launch stage"],
                [zh ? "实时交易" : "Trade in real time", zh ? "透明报价与确认" : "Transparent quotes and confirmation"],
                [zh ? "授权确认" : "Approval confirmation", zh ? "仅在需要时 exact 授权" : "Exact approval only when needed"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-8 h-2 w-2 rounded-full bg-[#d9ff46]" />
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
