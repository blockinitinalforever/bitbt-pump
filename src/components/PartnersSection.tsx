"use client";

import { useTranslations } from "next-intl";

export default function PartnersSection() {
  const t = useTranslations("partners");

  const marqueeItems = t("marquee").split(",");
  const vcList = t("vcList").split(",");
  const mmList = t("mmList").split(",");
  const mediaList = t("mediaList").split(",");

  const partnerGroups = [
    { label: t("vcLabel"), items: vcList },
    { label: t("mmLabel"), items: mmList },
    { label: t("mediaLabel"), items: mediaList },
  ];

  return (
    <section className="py-[60px] md:py-[120px] border-b border-[#e5e5e5]" id="partners">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        {/* Section label */}
        <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

        {/* Title */}
        <h2 className="mt-5 text-[32px] md:text-[52px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1a1a1a]">
          {t("title")}
        </h2>

        {/* Marquee */}
        <div className="mt-10 md:mt-[52px] bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden py-5">
          <div className="flex overflow-hidden">
            <div className="animate-marquee flex shrink-0">
              {[...marqueeItems, ...marqueeItems].map((item, i) => (
                <span key={i} className="flex items-center gap-8 px-8">
                  <span className="text-[13px] text-[#aaa] font-medium tracking-[-0.13px] whitespace-nowrap">{item}</span>
                  <span className="text-[10px] text-[#ddd]">·</span>
                </span>
              ))}
            </div>
            <div className="animate-marquee flex shrink-0">
              {[...marqueeItems, ...marqueeItems].map((item, i) => (
                <span key={`dup-${i}`} className="flex items-center gap-8 px-8">
                  <span className="text-[13px] text-[#aaa] font-medium tracking-[-0.13px] whitespace-nowrap">{item}</span>
                  <span className="text-[10px] text-[#ddd]">·</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Partner lists */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {partnerGroups.map((group, i) => (
            <div key={i} className="bg-white border border-[#e5e5e5] rounded-2xl py-6 px-5">
              <p className="text-[11px] text-[#aaa] font-medium tracking-[0.08em] pb-3.5 border-b border-[#f0f0f0]">
                {group.label}
              </p>
              <div className="mt-4 space-y-0">
                {group.items.map((item, j) => (
                  <div
                    key={j}
                    className={`py-[9px] px-2 rounded-lg flex items-center gap-2 text-[13.5px] text-[#6b6b6b] tracking-[-0.14px] ${
                      j < group.items.length - 1 ? "border-b border-[#f5f5f5]" : ""
                    }`}
                  >
                    <span className="w-[3px] h-[3px] bg-[#ccc] rounded-[1.5px] shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
