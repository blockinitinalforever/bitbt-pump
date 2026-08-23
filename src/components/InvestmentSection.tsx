import { useTranslations } from "next-intl";

export default function InvestmentSection() {
  const t = useTranslations("investment");

  const stages = [t("stage1"), t("stage2"), t("stage3"), t("stage4")];
  const focuses = [t("focus1"), t("focus2"), t("focus3"), t("focus4"), t("focus5"), t("focus6")];
  const strategies = [
    { label: t("strategy1Label"), title: t("strategy1Title"), ret: t("strategy1Return"), desc: t("strategy1Desc") },
    { label: t("strategy2Label"), title: t("strategy2Title"), ret: t("strategy2Return"), desc: t("strategy2Desc") },
    { label: t("strategy3Label"), title: t("strategy3Title"), ret: t("strategy3Return"), desc: t("strategy3Desc") },
  ];
  const caps = [t("cap1"), t("cap2"), t("cap3"), t("cap4"), t("cap5"), t("cap6")];

  return (
    <section className="py-[60px] md:py-[120px] border-b border-[#e5e5e5]" id="portfolio">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        {/* Section label */}
        <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

        {/* Title */}
        <h2 className="mt-5 text-[32px] md:text-[52px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1a1a1a]">
          {t("title")}
        </h2>

        {/* Two columns */}
        <div className="mt-10 md:mt-[60px] flex flex-col md:flex-row gap-6 md:gap-12">
          {/* Left column */}
          <div className="flex-1 space-y-6">
            {/* Investment Stages */}
            <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5">
              <p className="text-[10px] text-[#aaa] font-medium tracking-[1px] mb-3.5">{t("stagesLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {stages.map((s, i) => (
                  <span
                    key={i}
                    className={`text-xs tracking-[-0.12px] px-4 py-[7px] rounded-full border ${
                      i === stages.length - 1
                        ? "bg-[#1a1a1a] text-white font-semibold border-[#ccc]"
                        : "bg-[#f5f4f2] text-[#6b6b6b] border-[#e8e8e8]"
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Focus Areas */}
            <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5">
              <p className="text-[10px] text-[#aaa] font-medium tracking-[1px] mb-3.5">{t("focusLabel")}</p>
              <div>
                {focuses.map((f, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 py-2.5 ${
                      i < focuses.length - 1 ? "border-b border-[#f0f0f0]" : ""
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                      <path d="M4 3l4 3-4 3" stroke="#ccc" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm text-[#1a1a1a] tracking-[-0.14px]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex-1 space-y-6">
            {/* Strategy Cards */}
            <div className="space-y-2.5">
              {strategies.map((s, i) => (
                <div key={i} className="bg-white border border-[#e5e5e5] rounded-[14px] p-5">
                  <p className="text-[10px] text-[#aaa] font-medium tracking-[1px] mb-[5px]">{s.label}</p>
                  <div className="flex items-baseline justify-between mb-2.5">
                    <h3 className="text-base font-bold text-[#1a1a1a] tracking-[-0.32px]">{s.title}</h3>
                    <span className="text-sm font-bold text-[#1a1a1a] tracking-[-0.14px]">{s.ret}</span>
                  </div>
                  <p className="text-[13px] text-[#6b6b6b]">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* Capabilities */}
            <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5">
              <p className="text-[10px] text-[#aaa] font-medium tracking-[1px] mb-3.5">{t("capLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {caps.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-2 text-xs text-[#6b6b6b] tracking-[-0.12px] bg-[#f5f4f2] border border-[#ebebeb] px-3 py-[9px] rounded-lg">
                    <span className="w-1 h-1 bg-[#ccc] rounded-[2px] shrink-0" />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
